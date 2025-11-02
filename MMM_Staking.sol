// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title MrManMan Staking (HEX-inspired)
/// @notice Time-locked staking with heavy early-exit penalties, post-maturity grace
///         period, and redistribution of penalties to stakers and holders.
///
/// Design highlights
/// - No partial emergency exits (full stake only)
/// - Early exit penalty: up to EARLY_PENALTY_MAX_BPS, scales linearly by remaining time
/// - Late end penalty: 0 during grace, then accrues per-day up to LATE_PENALTY_MAX_BPS
/// - Penalty distribution: STAKER_REWARD_BPS to active stakers via acc-per-share,
///   HOLDER_REWARD_BPS reserved for holder distribution (module to be finalized)
/// - Security: nonReentrant, no external calls inside accounting, explicit events
contract MMM_Staking is Ownable, ReentrancyGuard {
    IERC20 public immutable token;

    // Lock configuration
    uint256 public immutable MIN_LOCK_DAYS;           // e.g., 1
    uint256 public immutable MAX_LOCK_DAYS;           // e.g., 3650 (10 years)
    uint256 public immutable GRACE_PERIOD;            // seconds, e.g., 30 days

    // Early exit penalty configuration (before maturity)
    uint256 public immutable EARLY_PENALTY_MAX_BPS;   // e.g., 9000 (90%)

    // Late end penalty configuration (after maturity + grace)
    uint256 public immutable LATE_PENALTY_RATE_PER_DAY_BPS; // e.g., 100 (1%/day)
    uint256 public immutable LATE_PENALTY_MAX_BPS;          // e.g., 5000 (50%)

    // Penalty split between stakers, holders, and optional receiver (must sum to 10000)
    uint256 public immutable STAKER_REWARD_BPS; // e.g., 7000
    uint256 public immutable HOLDER_REWARD_BPS; // e.g., 3000
    address public immutable PENALTY_RECEIVER;  // optional address to receive a small portion
    uint256 public immutable PENALTY_RECEIVER_BPS;

    // Global staking accounting
    uint256 public totalStaked;
    uint256 public accPenaltyPerShare;        // scaled by 1e18
    uint256 public stakerRewardsPending;      // penalties accumulated while totalStaked == 0
    uint256 public holderRewardsReserve;      // tokens reserved for holder distribution

    struct Stake {
        uint128 amount;       // staked principal
        uint40  startTs;      // unix time
        uint24  lockDays;     // up to ~16 million
        bool    closed;       // closed flag
        uint40  closeTs;      // unix time of close
        uint256 rewardDebt;   // amount * accPenaltyPerShare / 1e18 at last action
    }

    mapping(address => uint256) public stakeCount;                // user => # stakes
    mapping(address => mapping(uint256 => Stake)) public stakes;  // user => id => Stake

    event Staked(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 lockDays);
    event Unstaked(address indexed user, uint256 indexed stakeId, uint256 amountReturned, uint256 penaltyApplied);
    event EmergencyExit(address indexed user, uint256 indexed stakeId, uint256 amountReturned, uint256 penaltyApplied);
    event PenaltyDistributed(uint256 stakerShare, uint256 holderShare);
    event RewardsClaimed(address indexed user, uint256 indexed stakeId, uint256 amount);

    constructor(
        address token_,
        uint256 minLockDays_,
        uint256 maxLockDays_,
        uint256 gracePeriodSec_,
        uint256 earlyPenaltyMaxBps_,
        uint256 latePenaltyRatePerDayBps_,
        uint256 latePenaltyMaxBps_,
        address penaltyReceiver_,                 // optional if splitsBps_[2] == 0
        uint256[3] memory splitsBps_              // [staker, holder, receiver]
    ) Ownable(msg.sender) {
        require(token_ != address(0), "token");
        require(minLockDays_ > 0 && maxLockDays_ >= minLockDays_, "lock bounds");
        require(earlyPenaltyMaxBps_ <= 10_000, "early bps");
        require(latePenaltyMaxBps_ <= 10_000, "late bps");

        // Validate splits
        require(splitsBps_.length == 3, "splits len");
        require(splitsBps_[0] >= splitsBps_[1] * 2, "staker >= 2x holder");
        require(
            (penaltyReceiver_ == address(0) && splitsBps_[2] == 0) || penaltyReceiver_ != address(0),
            "receiver addr"
        );
        require(splitsBps_[0] + splitsBps_[1] + splitsBps_[2] == 10_000, "split sum");

        token = IERC20(token_);
        MIN_LOCK_DAYS = minLockDays_;
        MAX_LOCK_DAYS = maxLockDays_;
        GRACE_PERIOD = gracePeriodSec_;
        EARLY_PENALTY_MAX_BPS = earlyPenaltyMaxBps_;
        LATE_PENALTY_RATE_PER_DAY_BPS = latePenaltyRatePerDayBps_;
        LATE_PENALTY_MAX_BPS = latePenaltyMaxBps_;
        STAKER_REWARD_BPS = splitsBps_[0];
        HOLDER_REWARD_BPS = splitsBps_[1];
        PENALTY_RECEIVER = penaltyReceiver_;
        PENALTY_RECEIVER_BPS = splitsBps_[2];
    }

    // ----- Views -----
    function pendingStakerRewards(address user, uint256 stakeId) public view returns (uint256) {
        Stake memory s = stakes[user][stakeId];
        if (s.closed || s.amount == 0) return 0;
        return (uint256(s.amount) * accPenaltyPerShare) / 1e18 - s.rewardDebt;
    }

    function stakeInfo(address user, uint256 stakeId) external view returns (Stake memory) {
        return stakes[user][stakeId];
    }

    // ----- Internal helpers -----
    function _applyPendingToAcc() internal {
        uint256 pending = stakerRewardsPending;
        if (pending == 0) return;
        if (totalStaked == 0) return;
        accPenaltyPerShare += (pending * 1e18) / totalStaked;
        stakerRewardsPending = 0;
    }

    function _distributePenalty(uint256 penaltyAmount, uint256 excludeAmount) internal {
        if (penaltyAmount == 0) return;
        uint256 stakerShare = (penaltyAmount * STAKER_REWARD_BPS) / 10_000;
        uint256 receiverShare = (penaltyAmount * PENALTY_RECEIVER_BPS) / 10_000;
        uint256 holderShare = penaltyAmount - stakerShare - receiverShare;

        // Exclude the exiting stake from receiving its own penalty
        uint256 divisor = totalStaked - excludeAmount;
        if (divisor > 0) {
            accPenaltyPerShare += (stakerShare * 1e18) / divisor;
        } else {
            stakerRewardsPending += stakerShare;
        }
        holderRewardsReserve += holderShare;
        if (receiverShare > 0 && PENALTY_RECEIVER != address(0)) {
            require(token.transfer(PENALTY_RECEIVER, receiverShare), "transfer receiver");
        }
        emit PenaltyDistributed(stakerShare, holderShare);
    }

    // ----- User actions -----
    function stake(uint256 amount, uint256 lockDays) external nonReentrant {
        require(amount > 0, "amount");
        require(lockDays >= MIN_LOCK_DAYS && lockDays <= MAX_LOCK_DAYS, "lock range");

        _applyPendingToAcc();

        // Pull tokens
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom");

        uint256 id = stakeCount[msg.sender];
        stakeCount[msg.sender] = id + 1;

        stakes[msg.sender][id] = Stake({
            amount: uint128(amount),
            startTs: uint40(block.timestamp),
            lockDays: uint24(lockDays),
            closed: false,
            closeTs: 0,
            rewardDebt: (amount * accPenaltyPerShare) / 1e18
        });

        totalStaked += amount;
        // If some penalties accumulated while no one staked, incorporate now
        _applyPendingToAcc();

        emit Staked(msg.sender, id, amount, lockDays);
    }

    function emergencyExit(uint256 stakeId) external nonReentrant {
        Stake storage s = stakes[msg.sender][stakeId];
        require(!s.closed && s.amount > 0, "stake");

        uint256 start = uint256(s.startTs);
        uint256 end = start + uint256(s.lockDays) * 1 days;
        require(block.timestamp < end, "use unstake"); // matured -> user should call unstake()

        // Early penalty scales with remaining time (linear)
        uint256 totalLock = end - start;
        uint256 remaining = end > block.timestamp ? end - block.timestamp : 0;
        uint256 penaltyBps = (EARLY_PENALTY_MAX_BPS * remaining) / totalLock; // 0..EARLY_MAX
        if (penaltyBps > EARLY_PENALTY_MAX_BPS) penaltyBps = EARLY_PENALTY_MAX_BPS;

        uint256 amount = s.amount;
        uint256 penalty = (amount * penaltyBps) / 10_000;
        uint256 principalToReturn = amount - penalty;

        // Distribute penalty before closing to exclude this stake
        _distributePenalty(penalty, amount);

        // Payout accrued staker rewards for this stake
        uint256 pending = (uint256(amount) * accPenaltyPerShare) / 1e18 - s.rewardDebt;

        // Close stake
        s.closed = true;
        s.closeTs = uint40(block.timestamp);
        totalStaked -= amount;

        uint256 payout = principalToReturn + pending;
        require(token.transfer(msg.sender, payout), "transfer");

        emit EmergencyExit(msg.sender, stakeId, principalToReturn, penalty);
        if (pending > 0) emit RewardsClaimed(msg.sender, stakeId, pending);
    }

    function unstake(uint256 stakeId) external nonReentrant {
        Stake storage s = stakes[msg.sender][stakeId];
        require(!s.closed && s.amount > 0, "stake");

        uint256 start = uint256(s.startTs);
        uint256 end = start + uint256(s.lockDays) * 1 days;
        require(block.timestamp >= end, "not matured");

        // Grace period: no late penalty for GRACE_PERIOD seconds after maturity
        uint256 penaltyBps = 0;
        if (block.timestamp > end + GRACE_PERIOD) {
            uint256 lateDays = (block.timestamp - (end + GRACE_PERIOD)) / 1 days;
            uint256 accrued = lateDays * LATE_PENALTY_RATE_PER_DAY_BPS;
            if (accrued > LATE_PENALTY_MAX_BPS) accrued = LATE_PENALTY_MAX_BPS;
            penaltyBps = accrued;
        }

        uint256 amount = s.amount;
        uint256 penalty = (amount * penaltyBps) / 10_000;
        uint256 principalToReturn = amount - penalty;

        // Distribute penalty before closing to exclude this stake
        if (penalty > 0) {
            _distributePenalty(penalty, amount);
        }

        // Payout accrued staker rewards for this stake
        uint256 pending = (uint256(amount) * accPenaltyPerShare) / 1e18 - s.rewardDebt;

        // Close stake
        s.closed = true;
        s.closeTs = uint40(block.timestamp);
        totalStaked -= amount;

        uint256 payout = principalToReturn + pending;
        require(token.transfer(msg.sender, payout), "transfer");

        emit Unstaked(msg.sender, stakeId, principalToReturn, penalty);
        if (pending > 0) emit RewardsClaimed(msg.sender, stakeId, pending);
    }

    function claimStakerRewards(uint256 stakeId) external nonReentrant {
        Stake storage s = stakes[msg.sender][stakeId];
        require(!s.closed && s.amount > 0, "stake");
        _applyPendingToAcc();
        uint256 pending = (uint256(s.amount) * accPenaltyPerShare) / 1e18 - s.rewardDebt;
        require(pending > 0, "none");
        s.rewardDebt = (uint256(s.amount) * accPenaltyPerShare) / 1e18;
        require(token.transfer(msg.sender, pending), "transfer");
        emit RewardsClaimed(msg.sender, stakeId, pending);
    }

    // Admin: optional function to forward holder pool to a downstream distributor
    function sweepHolderRewards(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "to");
        if (amount == 0) amount = holderRewardsReserve;
        require(amount <= holderRewardsReserve, "amount");
        holderRewardsReserve -= amount;
        require(token.transfer(to, amount), "transfer");
    }
}

