// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/// @title MrManMan Unified (Token + Staking)
/// @notice HEX-inspired token with phase-based participation rewards and integrated staking
///         Maximum 3.69% annual inflation distributed to honest stakers
///         Penalties from broken stakes: 99.5% to stakers, 0.5% to penalty receiver
///         Holders receive NO rewards - only stakers benefit from inflation
contract MrManManUnified is ERC20, Ownable, ReentrancyGuard {
    using Math for uint256;

    // ============ IMMUTABLE CONFIGURATION ============
    uint256 public immutable TOTAL_SUPPLY;
    uint256 public immutable PRE_MINT_BPS;
    uint256 public immutable PRE_MINT_AMOUNT;
    uint256 public immutable DYNAMIC_MINT_AMOUNT;
    address public immutable PREMINT_RECIPIENT;
    
    // Time-based schedule
    uint256 public immutable LAUNCH_TIMESTAMP;
    uint256 public immutable PHASE_COUNT;
    uint256 public immutable PHASE_DURATION;   // Default phase duration
    uint256 public immutable PHASE_0_DURATION; // First phase duration
    uint256 public immutable launchBlock;
    
    // Inflation configuration (like HEX)
    uint256 public constant MAX_ANNUAL_INFLATION_BPS = 369; // 3.69%
    uint256 public constant DAYS_PER_YEAR = 365;
    uint256 public constant SECONDS_PER_DAY = 86400;
    
    // Staking configuration
    uint256 public immutable MIN_STAKE_DAYS;
    uint256 public immutable MAX_STAKE_DAYS;
    uint256 public immutable GRACE_PERIOD_SEC; // Grace period after maturity
    uint256 public immutable EARLY_PENALTY_MAX_BPS; // Max early penalty (e.g., 9000 = 90%)
    uint256 public immutable LATE_PENALTY_RATE_PER_DAY_BPS; // Late penalty rate (e.g., 100 = 1%/day)
    uint256 public immutable LATE_PENALTY_MAX_BPS; // Max late penalty (e.g., 5000 = 50%)
    
    // Penalty distribution (99.5% to stakers, 0.5% to penalty receiver)
    address public immutable PENALTY_RECEIVER;
    uint256 public constant PENALTY_RECEIVER_BPS = 50; // 0.5%
    uint256 public constant STAKER_REWARD_BPS = 9950; // 99.5%
    
    // Minimum contribution
    uint256 public immutable MIN_CONTRIBUTION_WEI;
    
    // ============ STAKING STATE ============
    uint256 public totalStaked; // Total Drops locked in stakes
    uint256 public totalStakeShares; // Total stake shares (Drops with bonuses)
    uint256 public shareRate; // Exchange rate: shares = drops * SHARE_RATE_SCALE / shareRate
    uint256 public constant SHARE_RATE_SCALE = 1e5;
    uint256 public stakePenaltyTotal; // Accumulated penalties to distribute
    
    // Daily inflation tracking
    struct DailyData {
        uint72 dayPayoutTotal; // Total Drops distributed this day
        uint72 dayStakeSharesTotal; // Total stake shares at end of day
    }
    mapping(uint256 => DailyData) public dailyData;
    uint256 public dailyDataCount;
    
    // Stake structure
    struct Stake {
        uint40 stakeId;
        uint72 stakedDrops;
        uint72 stakeShares;
        uint16 lockedDay;
        uint16 stakedDays;
        uint16 unlockedDay;
        bool isAutoStake;
    }
    
    // Stake performance result structure (reduces stack depth)
    struct StakePerformanceResult {
        uint256 stakeReturn;
        uint256 payout;
        uint256 penalty;
        uint256 servedDays;
    }
    
    mapping(address => Stake[]) public stakeLists;
    uint40 public latestStakeId;
    
    // ============ PHASE STATE ============
    // Custom phase configurations
    mapping(uint256 => uint256) private _customAllocOf;
    mapping(uint256 => bool) private _isCustomPhase;
    mapping(uint256 => uint256) private _phaseDurationOf; // Custom duration per phase
    mapping(uint256 => uint256) private _randomRewardOf; // Random rewards for specific phases
    uint256 private _totalCustomAlloc;
    
    // Baseline distribution
    uint256 public constant BASELINE_FIRST_N_DAYS = 10;
    uint256 public constant BASELINE_FIRST_SHARE_BPS = 1000;
    uint256 private constant WEIGHT_SCALE = 1e12;
    uint256 public immutable BASELINE_TOTAL_WEIGHT;
    
    // Contribution accounting
    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(uint256 => uint256) public totalContributions;
    mapping(uint256 => mapping(address => bool)) public hasMinted;
    mapping(uint256 => address[]) public phaseContributors;
    mapping(uint256 => mapping(address => bool)) private _contributorAdded;
    
    // Events
    event ContributionReceived(address indexed contributor, uint256 indexed phase, uint256 amount);
    event TokensMinted(address indexed user, uint256 indexed phase, uint256 amount);
    event StakeStart(uint40 indexed stakeId, uint256 stakedDrops, uint256 stakeShares, uint256 stakedDays, bool isAutoStake);
    event StakeEnd(uint40 indexed stakeId, uint256 stakedDrops, uint256 stakeShares, uint256 payout, uint256 penalty, uint256 servedDays);
    event ShareRateChange(uint256 shareRate, uint40 indexed stakeId);
    event DailyDataUpdate(uint256 beginDay, uint256 endDay, bool isAutoUpdate);
    
    constructor(
        string memory name_,
        string memory symbol_,
        address premintRecipient_,
        uint256 totalSupply_,
        uint256[3] memory premintInfo_, // [premintBps, premintAmountAbsolute, _]
        uint256 phaseCount_,
        uint256[2] memory phaseDurations_, // [phase0DurationSec, phaseDurationSec]
        uint256 minContributionWei_,
        uint256[2][] memory customAllocs_, // [[phaseIdx, allocation], ...]
        uint256[2][] memory customDurations_, // [[phaseIdx, durationSec], ...]
        uint256[2][] memory randomPhases_, // [[phaseIdx, maxReward], ...]
        uint256[4] memory stakingParams_ // [minStakeDays, maxStakeDays, gracePeriodSec, earlyPenaltyMaxBps]
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        require(premintRecipient_ != address(0), "premint recipient");
        require(premintInfo_[0] <= 10_000, "premint bps");
        require(phaseCount_ > 0 && phaseCount_ <= 1000, "phase count");
        require(phaseDurations_[0] > 0 && phaseDurations_[1] > 0, "duration");
        
        PREMINT_RECIPIENT = premintRecipient_;
        TOTAL_SUPPLY = totalSupply_;
        PRE_MINT_BPS = premintInfo_[0];
        PRE_MINT_AMOUNT = premintInfo_[1] > 0 ? premintInfo_[1] : (totalSupply_ * premintInfo_[0]) / 10_000;
        require(PRE_MINT_AMOUNT <= TOTAL_SUPPLY, "premint > supply");
        DYNAMIC_MINT_AMOUNT = TOTAL_SUPPLY - PRE_MINT_AMOUNT;
        
        PHASE_COUNT = phaseCount_;
        PHASE_0_DURATION = phaseDurations_[0];
        PHASE_DURATION = phaseDurations_[1];
        MIN_CONTRIBUTION_WEI = minContributionWei_;
        
        LAUNCH_TIMESTAMP = block.timestamp;
        launchBlock = block.number;
        
        // Apply custom phase configurations
        _applyCustomPhaseConfigs(customAllocs_, customDurations_, randomPhases_);
        
        BASELINE_TOTAL_WEIGHT = _precomputeBaselineTotalWeight();
        
        // Staking parameters
        MIN_STAKE_DAYS = stakingParams_[0];
        MAX_STAKE_DAYS = stakingParams_[1];
        GRACE_PERIOD_SEC = stakingParams_[2];
        EARLY_PENALTY_MAX_BPS = stakingParams_[3];
        LATE_PENALTY_RATE_PER_DAY_BPS = 100; // 1% per day
        LATE_PENALTY_MAX_BPS = 5000; // 50% max
        
        // Penalty receiver (can be zero address if not needed)
        PENALTY_RECEIVER = address(0x331A4Be966F44887347c0124c0C33BBc1D0A3A68);
        
        // Initialize share rate
        shareRate = SHARE_RATE_SCALE;
        
        // Initialize daily data
        dailyDataCount = 1;
        
        // Premint
        _mint(PREMINT_RECIPIENT, PRE_MINT_AMOUNT);
    }
    
    function _applyCustomPhaseConfigs(
        uint256[2][] memory customAllocs_,
        uint256[2][] memory customDurations_,
        uint256[2][] memory randomPhases_
    ) internal {
        // Apply custom allocations
        if (customAllocs_.length > 0) {
            for (uint256 i = 0; i < customAllocs_.length; i++) {
                uint256 p = customAllocs_[i][0];
                uint256 a = customAllocs_[i][1];
                require(p < PHASE_COUNT, "phase idx");
                require(!_isCustomPhase[p], "dup phase");
                _isCustomPhase[p] = true;
                _customAllocOf[p] = a;
                _totalCustomAlloc += a;
            }
        }
        require(_totalCustomAlloc <= DYNAMIC_MINT_AMOUNT, "alloc sum");
        
        // Apply custom durations
        if (customDurations_.length > 0) {
            for (uint256 i = 0; i < customDurations_.length; i++) {
                uint256 p = customDurations_[i][0];
                uint256 d = customDurations_[i][1];
                require(p < PHASE_COUNT, "phase idx");
                require(d > 0, "duration");
                _phaseDurationOf[p] = d;
            }
        }
        
        // Apply random rewards (set max range, actual reward determined at phase end)
        if (randomPhases_.length > 0) {
            for (uint256 i = 0; i < randomPhases_.length; i++) {
                uint256 p = randomPhases_[i][0];
                uint256 maxReward = randomPhases_[i][1];
                require(p < PHASE_COUNT, "phase idx");
                require(maxReward > 0, "max reward");
                _randomRewardOf[p] = maxReward;
            }
        }
    }
    
    // ============ PHASE HELPERS ============
    
    function currentDay() public view returns (uint256) {
        return (block.timestamp - LAUNCH_TIMESTAMP) / SECONDS_PER_DAY;
    }
    
    function _currentDay() internal view returns (uint256) {
        return (block.timestamp - LAUNCH_TIMESTAMP) / SECONDS_PER_DAY;
    }
    
    function phaseStartTs(uint256 phase) public view returns (uint256) {
        require(phase < PHASE_COUNT, "phase");
        if (phase == 0) return LAUNCH_TIMESTAMP;
        
        uint256 cumulative = PHASE_0_DURATION;
        for (uint256 i = 1; i < phase; i++) {
            uint256 dur = _phaseDurationOf[i] > 0 ? _phaseDurationOf[i] : PHASE_DURATION;
            cumulative += dur;
        }
        return LAUNCH_TIMESTAMP + cumulative;
    }
    
    function phaseEndTs(uint256 phase) public view returns (uint256) {
        require(phase < PHASE_COUNT, "phase");
        uint256 start = phaseStartTs(phase);
        uint256 dur = _phaseDurationOf[phase] > 0 ? _phaseDurationOf[phase] : PHASE_DURATION;
        return start + dur;
    }
    
    function getCurrentPhase() public view returns (uint256) {
        if (block.timestamp <= LAUNCH_TIMESTAMP) return 0;
        uint256 elapsed = block.timestamp - LAUNCH_TIMESTAMP;
        if (elapsed < PHASE_0_DURATION) return 0;
        
        uint256 cumulative = PHASE_0_DURATION;
        for (uint256 i = 1; i < PHASE_COUNT; i++) {
            uint256 dur = _phaseDurationOf[i] > 0 ? _phaseDurationOf[i] : PHASE_DURATION;
            if (elapsed < cumulative + dur) {
                return i;
            }
            cumulative += dur;
        }
        return PHASE_COUNT - 1;
    }
    
    function phaseAllocation(uint256 phase) public view returns (uint256) {
        require(phase < PHASE_COUNT, "phase");
        if (_isCustomPhase[phase]) {
            return _customAllocOf[phase];
        }
        
        // Check for random phase (determined at phase end)
        if (_randomRewardOf[phase] > 0) {
            // Return max for display, actual is set at phase end
            return _randomRewardOf[phase];
        }
        
        uint256 remainder = DYNAMIC_MINT_AMOUNT - _totalCustomAlloc;
        if (remainder == 0 || BASELINE_TOTAL_WEIGHT == 0) return 0;
        
        uint256 firstN = BASELINE_FIRST_N_DAYS < PHASE_COUNT ? BASELINE_FIRST_N_DAYS : PHASE_COUNT;
        uint256 w = _baselineWeightScaled(phase, firstN);
        return Math.mulDiv(remainder, w, BASELINE_TOTAL_WEIGHT);
    }
    
    function _baselineWeightScaled(uint256 phase, uint256 firstN) internal view returns (uint256) {
        if (PHASE_COUNT == 0) return 0;
        uint256 m = firstN;
        if (m > PHASE_COUNT) m = PHASE_COUNT;
        if (m == 0 || m == PHASE_COUNT) {
            return WEIGHT_SCALE;
        }
        if (phase < m) {
            return (BASELINE_FIRST_SHARE_BPS * WEIGHT_SCALE) / m;
        } else {
            uint256 others = PHASE_COUNT - m;
            return ((10_000 - BASELINE_FIRST_SHARE_BPS) * WEIGHT_SCALE) / others;
        }
    }
    
    function _precomputeBaselineTotalWeight() internal view returns (uint256 sumW) {
        uint256 firstN = BASELINE_FIRST_N_DAYS < PHASE_COUNT ? BASELINE_FIRST_N_DAYS : PHASE_COUNT;
        for (uint256 i = 0; i < PHASE_COUNT; i++) {
            if (!_isCustomPhase[i]) {
                sumW += _baselineWeightScaled(i, firstN);
            }
        }
    }
    
    function _phaseEnded(uint256 phase) internal view returns (bool) {
        return block.timestamp >= phaseEndTs(phase);
    }
    
    // ============ CONTRIBUTIONS & MINTING ============
    
    receive() external payable nonReentrant {
        require(block.timestamp < phaseEndTs(PHASE_COUNT - 1), "ended");
        require(msg.value >= MIN_CONTRIBUTION_WEI, "min contrib");
        
        uint256 phase = getCurrentPhase();
        
        contributions[phase][msg.sender] += msg.value;
        totalContributions[phase] += msg.value;
        
        if (!_contributorAdded[phase][msg.sender]) {
            phaseContributors[phase].push(msg.sender);
            _contributorAdded[phase][msg.sender] = true;
        }
        
        emit ContributionReceived(msg.sender, phase, msg.value);
    }
    
    function mintUserShare(uint256 phase) external nonReentrant {
        require(phase < PHASE_COUNT, "phase");
        require(_phaseEnded(phase), "phase not ended");
        require(!hasMinted[phase][msg.sender], "minted");
        require(msg.sender != address(0), "zero addr");
        
        uint256 userContribution = contributions[phase][msg.sender];
        require(userContribution > 0, "no contrib");
        
        uint256 phaseTotal = totalContributions[phase];
        require(phaseTotal > 0, "no total");
        
        uint256 allocation = _getPhaseAllocationActual(phase);
        uint256 userShare = Math.mulDiv(userContribution, allocation, phaseTotal);
        require(totalSupply() + userShare <= TOTAL_SUPPLY, "exceeds supply");
        
        hasMinted[phase][msg.sender] = true;
        _mint(msg.sender, userShare);
        emit TokensMinted(msg.sender, phase, userShare);
    }
    
    function _getPhaseAllocationActual(uint256 phase) internal view returns (uint256) {
        if (_isCustomPhase[phase]) {
            return _customAllocOf[phase];
        }
        
        // For random phases, use stored value (set at phase end)
        if (_randomRewardOf[phase] > 0) {
            // If phase ended, use the actual random reward
            // Otherwise return max for estimation
            return _randomRewardOf[phase];
        }
        
        return phaseAllocation(phase);
    }
    
    function getEligibleTokens(uint256 phase, address user) external view returns (uint256) {
        if (phase >= PHASE_COUNT || !_phaseEnded(phase)) return 0;
        if (hasMinted[phase][user]) return 0;
        uint256 userContribution = contributions[phase][user];
        if (userContribution == 0) return 0;
        uint256 phaseTotal = totalContributions[phase];
        if (phaseTotal == 0) return 0;
        uint256 allocation = _getPhaseAllocationActual(phase);
        return Math.mulDiv(userContribution, allocation, phaseTotal);
    }
    
    function getPhaseContributors(uint256 phase) external view returns (address[] memory) {
        return phaseContributors[phase];
    }
    
    // ============ STAKING (HEX-INSPIRED) ============
    
    function stakeStart(uint256 newStakedDrops, uint256 newStakedDays) external nonReentrant {
        require(newStakedDrops > 0, "amount");
        require(newStakedDays >= MIN_STAKE_DAYS, "min days");
        require(newStakedDays <= MAX_STAKE_DAYS, "max days");
        
        // Update daily data if needed
        _dailyDataUpdateAuto();
        
        uint256 bonusDrops = _stakeStartBonusDrops(newStakedDrops, newStakedDays);
        uint256 newStakeShares = (newStakedDrops + bonusDrops) * SHARE_RATE_SCALE / shareRate;
        require(newStakeShares > 0, "shares zero");
        
        uint256 currentDayNum = _currentDay();
        uint256 newLockedDay = currentDayNum + 1;
        
        // Burn tokens (lock them)
        _burn(msg.sender, newStakedDrops);
        
        uint40 newStakeId = ++latestStakeId;
        stakeLists[msg.sender].push(Stake({
            stakeId: newStakeId,
            stakedDrops: uint72(newStakedDrops),
            stakeShares: uint72(newStakeShares),
            lockedDay: uint16(newLockedDay),
            stakedDays: uint16(newStakedDays),
            unlockedDay: 0,
            isAutoStake: false
        }));
        
        totalStaked += newStakedDrops;
        totalStakeShares += newStakeShares;
        
        emit StakeStart(newStakeId, newStakedDrops, newStakeShares, newStakedDays, false);
    }
    
    function _stakeStartBonusDrops(uint256 newStakedDrops, uint256 newStakedDays) internal pure returns (uint256 bonusDrops) {
        // Longer Pays Better: up to 200% bonus for longer stakes
        uint256 cappedExtraDays = 0;
        if (newStakedDays > 1) {
            uint256 maxBonusDays = 3640; // ~10 years
            cappedExtraDays = newStakedDays <= maxBonusDays ? newStakedDays - 1 : maxBonusDays;
        }
        
        // Bigger Pays Better: up to 10% bonus for larger stakes
        uint256 maxStake = 150_000_000 * 1e18; // 150M Drops
        uint256 cappedStakedDrops = newStakedDrops <= maxStake ? newStakedDrops : maxStake;
        
        // Combined bonus calculation (like HEX)
        uint256 LPB = 364 * 100 / 20; // 1820
        uint256 BPB = maxStake * 100 / 10; // 1.5B
        
        bonusDrops = cappedExtraDays * BPB + cappedStakedDrops * LPB;
        bonusDrops = newStakedDrops * bonusDrops / (LPB * BPB);
        
        return bonusDrops;
    }
    
    function stakeEnd(uint256 stakeIndex, uint40 stakeIdParam) external nonReentrant {
        Stake[] storage stakeListRef = stakeLists[msg.sender];
        require(stakeListRef.length > 0, "no stakes");
        require(stakeIndex < stakeListRef.length, "invalid index");
        
        Stake storage stRef = stakeListRef[stakeIndex];
        require(stRef.stakeId == stakeIdParam, "stake id mismatch");
        
        _dailyDataUpdateAuto();
        
        StakePerformanceResult memory result = _calculateStakeEndResult(stRef);
        
        if (result.penalty > 0) {
            _splitPenaltyProceeds(result.penalty);
        }
        
        if (result.stakeReturn > 0) {
            _mint(msg.sender, result.stakeReturn);
            _shareRateUpdate(stRef, result.stakeReturn);
        }
        
        totalStaked -= stRef.stakedDrops;
        
        // Remove stake from list
        uint256 lastIndex = stakeListRef.length - 1;
        if (stakeIndex != lastIndex) {
            stakeListRef[stakeIndex] = stakeListRef[lastIndex];
        }
        stakeListRef.pop();
        
        emit StakeEnd(stRef.stakeId, stRef.stakedDrops, stRef.stakeShares, result.payout, result.penalty, result.servedDays);
    }
    
    function _calculateStakeEndResult(Stake storage stRef) internal returns (StakePerformanceResult memory) {
        uint256 currentDayNum = _currentDay();
        
        if (currentDayNum < stRef.lockedDay) {
            // Stake hasn't started yet
            totalStakeShares -= stRef.stakeShares;
            return StakePerformanceResult({
                stakeReturn: stRef.stakedDrops,
                payout: 0,
                penalty: 0,
                servedDays: 0
            });
        }
        
        uint256 servedDays;
        if (stRef.unlockedDay != 0) {
            servedDays = stRef.stakedDays;
        } else {
            _stakeUnlock(stRef, currentDayNum);
            servedDays = currentDayNum - stRef.lockedDay;
            if (servedDays > stRef.stakedDays) {
                servedDays = stRef.stakedDays;
            }
        }
        
        return _stakePerformance(stRef, servedDays);
    }
    
    function _stakeUnlock(Stake storage st, uint256 currentDayNum) internal {
        totalStakeShares -= st.stakeShares;
        st.unlockedDay = uint16(currentDayNum);
    }
    
    function _stakePerformance(Stake storage st, uint256 servedDays) internal view returns (StakePerformanceResult memory) {
        uint256 payout;
        uint256 penalty;
        
        if (servedDays < st.stakedDays) {
            // Early exit - calculate penalty first
            (payout, penalty) = _calcPayoutAndEarlyPenalty(st, servedDays);
        } else {
            // Served full term - calculate rewards first
            payout = _calcPayoutRewards(st);
            // Then check for late penalty (after grace period)
            penalty = _calcLatePenalty(st, st.stakedDrops + payout);
        }
        
        uint256 stakeReturn = st.stakedDrops + payout;
        
        if (penalty > stakeReturn) {
            penalty = stakeReturn;
            stakeReturn = 0;
        } else {
            stakeReturn -= penalty;
        }
        
        return StakePerformanceResult({
            stakeReturn: stakeReturn,
            payout: payout,
            penalty: penalty,
            servedDays: 0 // Will be set by caller
        });
    }
    
    function _calcPayoutRewards(Stake storage st) internal view returns (uint256) {
        uint256 payout = 0;
        uint256 endDay = st.lockedDay + st.stakedDays;
        
        for (uint256 day = st.lockedDay; day < endDay; day++) {
            if (dailyData[day].dayStakeSharesTotal > 0) {
                payout += dailyData[day].dayPayoutTotal * st.stakeShares / dailyData[day].dayStakeSharesTotal;
            }
        }
        
        return payout;
    }
    
    function _calcPayoutAndEarlyPenalty(Stake storage st, uint256 servedDays) internal view returns (uint256 payout, uint256 penalty) {
        uint256 penaltyDays = (st.stakedDays + 1) / 2;
        if (penaltyDays < 90) penaltyDays = 90; // Minimum penalty period
        
        if (servedDays == 0) {
            // Estimate penalty
            uint256 expected = _estimatePayoutRewardsDay(st, st.lockedDay);
            return (0, expected * penaltyDays);
        }
        
        uint256 servedEndDay = st.lockedDay + servedDays;
        
        if (penaltyDays < servedDays) {
            uint256 penaltyEndDay = st.lockedDay + penaltyDays;
            penalty = _calcPayoutRewardsRange(st, st.lockedDay, penaltyEndDay);
            uint256 delta = _calcPayoutRewardsRange(st, penaltyEndDay, servedEndDay);
            return (penalty + delta, penalty);
        }
        
        payout = _calcPayoutRewardsRange(st, st.lockedDay, servedEndDay);
        if (penaltyDays == servedDays) {
            penalty = payout;
        } else {
            penalty = payout * penaltyDays / servedDays;
        }
        
        return (payout, penalty);
    }
    
    function _calcPayoutRewardsRange(Stake storage st, uint256 beginDay, uint256 endDay) internal view returns (uint256) {
        uint256 payout = 0;
        for (uint256 day = beginDay; day < endDay; day++) {
            if (dailyData[day].dayStakeSharesTotal > 0) {
                payout += dailyData[day].dayPayoutTotal * st.stakeShares / dailyData[day].dayStakeSharesTotal;
            }
        }
        return payout;
    }
    
    function _estimatePayoutRewardsDay(Stake storage st, uint256 day) internal view returns (uint256) {
        if (dailyData[day].dayStakeSharesTotal > 0) {
            return dailyData[day].dayPayoutTotal * st.stakeShares / dailyData[day].dayStakeSharesTotal;
        }
        // Estimate based on current inflation
        uint256 allocSupply = totalSupply() + totalStaked;
        uint256 estimatedPayout = Math.mulDiv(allocSupply, 10000, 100448995);
        if (totalStakeShares + st.stakeShares > 0) {
            return Math.mulDiv(estimatedPayout, st.stakeShares, totalStakeShares + st.stakeShares);
        }
        return 0;
    }
    
    function _calcLatePenalty(Stake storage st, uint256 rawStakeReturn) internal view returns (uint256) {
        uint256 maturityDay = st.lockedDay + st.stakedDays;
        uint256 graceEndDay = maturityDay + (GRACE_PERIOD_SEC / SECONDS_PER_DAY);
        uint256 currentDayNum = _currentDay();
        
        if (currentDayNum <= graceEndDay) {
            return 0;
        }
        
        uint256 lateDays = currentDayNum - graceEndDay;
        uint256 penaltyRate = lateDays * LATE_PENALTY_RATE_PER_DAY_BPS;
        if (penaltyRate > LATE_PENALTY_MAX_BPS) {
            penaltyRate = LATE_PENALTY_MAX_BPS;
        }
        
        return rawStakeReturn * penaltyRate / 10_000;
    }
    
    function _splitPenaltyProceeds(uint256 penalty) internal {
        uint256 stakerShare = penalty * STAKER_REWARD_BPS / 10_000;
        uint256 receiverShare = penalty * PENALTY_RECEIVER_BPS / 10_000;
        
        stakePenaltyTotal += stakerShare;
        
        if (receiverShare > 0 && PENALTY_RECEIVER != address(0)) {
            _mint(PENALTY_RECEIVER, receiverShare);
        }
    }
    
    function _shareRateUpdate(Stake storage st, uint256 stakeReturn) internal {
        if (stakeReturn > st.stakedDrops) {
            uint256 bonusDrops = _stakeStartBonusDrops(stakeReturn, st.stakedDays);
            uint256 newShareRate = (stakeReturn + bonusDrops) * SHARE_RATE_SCALE / st.stakeShares;
            
            uint256 maxShareRate = (1 << 40) - 1; // Prevent overflow
            if (newShareRate > maxShareRate) {
                newShareRate = maxShareRate;
            }
            
            if (newShareRate > shareRate) {
                shareRate = newShareRate;
                emit ShareRateChange(newShareRate, st.stakeId);
            }
        }
    }
    
    // ============ INFLATION DISTRIBUTION ============
    
    function _dailyDataUpdateAuto() internal {
        uint256 currentDayNum = _currentDay();
        if (dailyDataCount >= currentDayNum) {
            return;
        }
        
        uint256 day = dailyDataCount;
        while (day < currentDayNum) {
            _dailyRoundCalcAndStore(day);
            day++;
        }
        
        dailyDataCount = day;
    }
    
    function _dailyRoundCalcAndStore(uint256 day) internal {
        // Calculate daily inflation (3.69% annual)
        uint256 allocSupply = totalSupply() + totalStaked;
        // dailyInterestRate = exp(log(1 + 3.69%) / 365) - 1 ≈ 0.000099553011616349
        // For gas efficiency: allocSupply * 10000 / 100448995
        uint256 payoutTotal = Math.mulDiv(allocSupply, 10000, 100448995);
        
        // Add penalties from previous day
        if (stakePenaltyTotal > 0) {
            payoutTotal += stakePenaltyTotal;
            stakePenaltyTotal = 0;
        }
        
        dailyData[day].dayPayoutTotal = uint72(payoutTotal);
        dailyData[day].dayStakeSharesTotal = uint72(totalStakeShares);
        
        emit DailyDataUpdate(day, day + 1, true);
    }
    
    function dailyDataUpdate(uint256 beforeDay) external {
        uint256 currentDayNum = _currentDay();
        if (beforeDay == 0) {
            beforeDay = currentDayNum;
        }
        require(beforeDay <= currentDayNum, "future");
        
        uint256 day = dailyDataCount;
        while (day < beforeDay) {
            _dailyRoundCalcAndStore(day);
            day++;
        }
        
        dailyDataCount = day;
        emit DailyDataUpdate(dailyDataCount, beforeDay, false);
    }
    
    // ============ VIEWS ============
    
    function stakeCount(address stakerAddr) external view returns (uint256) {
        return stakeLists[stakerAddr].length;
    }
    
    function stakeInfo(address stakerAddr, uint256 stakeIndex) external view returns (Stake memory) {
        return stakeLists[stakerAddr][stakeIndex];
    }
    
    function allocatedSupply() external view returns (uint256) {
        return totalSupply() + totalStaked;
    }
    
    // ============ ADMIN ============
    
    function withdraw() external onlyOwner nonReentrant {
        require(block.timestamp >= phaseEndTs(PHASE_COUNT - 1), "not ended");
        uint256 bal = address(this).balance;
        require(bal > 0, "no eth");
        (bool ok, ) = payable(owner()).call{value: bal}("");
        require(ok, "withdraw");
    }
}

