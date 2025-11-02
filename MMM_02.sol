// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";


/// @title MrManMan V2 (configurable phases + time-based schedule)
/// @notice Parameterized daily phase emissions with optional per‑phase allocations.
///         Backwards-compatible read methods are kept where possible. Staking and
///         HEX-like penalty mechanics will be added in a subsequent iteration.
contract MrManManV2 is ERC20, Ownable, ReentrancyGuard {
    // Immutable configuration (set at deploy)
    uint256 public immutable TOTAL_SUPPLY;
    uint256 public immutable PRE_MINT_BPS; // 0..10000 (basis points)
    uint256 public immutable PRE_MINT_AMOUNT;
    uint256 public immutable DYNAMIC_MINT_AMOUNT;
    address public immutable PREMINT_RECIPIENT;

    // Time-based schedule
    uint256 public immutable LAUNCH_TIMESTAMP; // unix timestamp at deployment
    uint256 public immutable PHASE_COUNT;      // e.g., 365
    uint256 public immutable PHASE_DURATION;   // seconds per phase, e.g., 1 days
    uint256 public immutable PHASE_0_DURATION; // seconds for the first phase, e.g., 1 hour


    // Block reference (for UI compatibility with existing front-end)
    uint256 public immutable launchBlock;

    // Optional partial custom allocations:
    // Use per-phase mapping so deployer can specify only selected phases.
    mapping(uint256 => uint256) private _customAllocOf; // phase => allocation
    mapping(uint256 => bool) private _isCustomPhase;    // phase => is custom
    uint256 private _totalCustomAlloc;
    uint256 private _customPhaseCount;
    // Default baseline distribution: first 10 days = 10% of dynamic supply
    uint256 public constant BASELINE_FIRST_N_DAYS = 10;
    uint256 public constant BASELINE_FIRST_SHARE_BPS = 1000; // 10% in basis points
    uint256 private constant WEIGHT_SCALE = 1e12;
    uint256 public immutable BASELINE_TOTAL_WEIGHT;

    // Soft cap to prevent unbounded growth of contributor arrays (UI convenience only)
    uint256 public constant MAX_CONTRIBUTORS_PER_PHASE = 5000;



    // Minimum contribution (in wei)
    uint256 public immutable MIN_CONTRIBUTION_WEI;

    // Contribution accounting
    mapping(uint256 => mapping(address => uint256)) public contributions; // phase => user => wei
    mapping(uint256 => uint256) public totalContributions;                // phase => wei
    mapping(uint256 => mapping(address => bool)) public hasMinted;        // phase => user => bool

    // Optional contributor list per phase (UI convenience)
    mapping(uint256 => address[]) public phaseContributors;
    mapping(uint256 => mapping(address => bool)) private _contributorAdded;
    bool public recordContributors = true;

    // Events
    event ContributionReceived(address indexed contributor, uint256 indexed phase, uint256 amount);
    event TokensMinted(address indexed user, uint256 indexed phase, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        address premintRecipient_,
        uint256 totalSupply_,
        uint256[3] memory premintInfo_,         // [premintBps, premintAmountAbsolute, _]
        uint256 phaseCount_,
        uint256[2] memory phaseDurations_,      // [phase0DurationSec, phaseDurationSec]
        uint256 minContributionWei_,
        uint256[2][] memory customAllocs_       // [[phaseIdx, allocation], ...]
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _basicChecks(premintRecipient_, premintInfo_[0], phaseCount_, phaseDurations_[0], phaseDurations_[1]);

        PREMINT_RECIPIENT = premintRecipient_;
        TOTAL_SUPPLY = totalSupply_;
        PRE_MINT_BPS = premintInfo_[0];
        PRE_MINT_AMOUNT = _computePremintAmount(TOTAL_SUPPLY, PRE_MINT_BPS, premintInfo_[1]);
        require(PRE_MINT_AMOUNT <= TOTAL_SUPPLY, "premint > supply");
        DYNAMIC_MINT_AMOUNT = TOTAL_SUPPLY - PRE_MINT_AMOUNT;

        PHASE_COUNT = phaseCount_;
        PHASE_0_DURATION = phaseDurations_[0];
        PHASE_DURATION = phaseDurations_[1];
        MIN_CONTRIBUTION_WEI = minContributionWei_;

        LAUNCH_TIMESTAMP = block.timestamp;
        launchBlock = block.number;

        uint256 sumAlloc = 0;
        if (customAllocs_.length > 0) {
            sumAlloc = _applyCustomAllocationsPairs(PHASE_COUNT, customAllocs_);
        }
        require(sumAlloc <= DYNAMIC_MINT_AMOUNT, "alloc sum");
        _totalCustomAlloc = sumAlloc;
        // Precompute baseline total weight once
        BASELINE_TOTAL_WEIGHT = _precomputeBaselineTotalWeightInternal();

        // Premint
        _mint(PREMINT_RECIPIENT, PRE_MINT_AMOUNT);
    }

    // ======== Phase helpers ========

    function phaseStartTs(uint256 phase) public view returns (uint256) {
        require(phase < PHASE_COUNT, "phase");
        if (phase == 0) return LAUNCH_TIMESTAMP;
        return LAUNCH_TIMESTAMP + PHASE_0_DURATION + (phase - 1) * PHASE_DURATION;
    }

    function phaseEndTs(uint256 phase) public view returns (uint256) {
        require(phase < PHASE_COUNT, "phase");
        if (phase == 0) return LAUNCH_TIMESTAMP + PHASE_0_DURATION;
        return LAUNCH_TIMESTAMP + PHASE_0_DURATION + phase * PHASE_DURATION;
    }

    function isLaunchComplete() external view returns (bool) {
        return block.timestamp >= totalScheduleEndTs();
    }

    function totalScheduleEndTs() public view returns (uint256) {
        if (PHASE_COUNT == 0) return LAUNCH_TIMESTAMP;
        return LAUNCH_TIMESTAMP + PHASE_0_DURATION + (PHASE_COUNT - 1) * PHASE_DURATION;
    }

    // ======== Internal helpers to reduce constructor stack depth ========
    function _basicChecks(address r, uint256 bps, uint256 pc, uint256 d0, uint256 dn) internal pure {
        require(r != address(0), "premint recipient");
        require(bps <= 10_000, "premint bps");
        require(pc > 0 && pc <= 1000, "phase count");
        require(d0 > 0 && dn > 0, "duration");
    }

    function _computePremintAmount(uint256 totalSupply, uint256 premintBps, uint256 premintAbsolute) internal pure returns (uint256) {
        if (premintAbsolute > 0) return premintAbsolute;
        return (totalSupply * premintBps) / 10_000;
    }

    function _applyCustomAllocationsPairs(
        uint256 phaseCount,
        uint256[2][] memory pairs
    ) internal returns (uint256 sum) {
        for (uint256 i = 0; i < pairs.length; i++) {
            uint256 p = pairs[i][0];
            uint256 a = pairs[i][1];
            require(p < phaseCount, "phase idx");
            sum += a;
            require(!_isCustomPhase[p], "dup phase");
            _isCustomPhase[p] = true;
            _customAllocOf[p] = a;
            _customPhaseCount++;
        }
    }

    function _precomputeBaselineTotalWeightInternal() internal view returns (uint256 sumW) {
        uint256 firstN = BASELINE_FIRST_N_DAYS < PHASE_COUNT ? BASELINE_FIRST_N_DAYS : PHASE_COUNT;
        for (uint256 i = 0; i < PHASE_COUNT; i++) {
            if (!_isCustomPhase[i]) {
                sumW += _baselineWeightScaled(i, firstN);
            }
        }
    }


    function getCurrentPhase() public view returns (uint256) {
        if (block.timestamp <= LAUNCH_TIMESTAMP) return 0;
        uint256 elapsed = block.timestamp - LAUNCH_TIMESTAMP;
        if (elapsed < PHASE_0_DURATION) return 0;
        uint256 rem = elapsed - PHASE_0_DURATION;
        uint256 idx = 1 + (rem / PHASE_DURATION);
        if (idx >= PHASE_COUNT) {
            return PHASE_COUNT - 1; // clamp after schedule
        }
        return idx;
    }

    function phaseAllocation(uint256 phase) public view returns (uint256) {
        require(phase < PHASE_COUNT, "phase");
        if (_isCustomPhase[phase]) {
            return _customAllocOf[phase];
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
            // All phases equal
            return WEIGHT_SCALE; // constant weight per phase
        }
        if (phase < m) {
            return (BASELINE_FIRST_SHARE_BPS * WEIGHT_SCALE) / m;
        } else {
            uint256 others = PHASE_COUNT - m;
            return ((10_000 - BASELINE_FIRST_SHARE_BPS) * WEIGHT_SCALE) / others;
        }
    }


    // ======== Receive contributions ========
    receive() external payable nonReentrant {
        require(block.timestamp < totalScheduleEndTs(), "ended");
        require(msg.value >= MIN_CONTRIBUTION_WEI, "min contrib");

        uint256 phase = getCurrentPhase();

        // If we are recording contributors and this address is new for the phase,
        // enforce the cap before accepting the contribution to avoid UX surprises.
        if (recordContributors && !_contributorAdded[phase][msg.sender]) {
            address[] storage list = phaseContributors[phase];
            require(list.length < MAX_CONTRIBUTORS_PER_PHASE, "contributors full");
        }

        // Effects
        contributions[phase][msg.sender] += msg.value;
        totalContributions[phase] += msg.value;

        // Record contributor after effects
        if (recordContributors && !_contributorAdded[phase][msg.sender]) {
            phaseContributors[phase].push(msg.sender);
            _contributorAdded[phase][msg.sender] = true;
        }

        emit ContributionReceived(msg.sender, phase, msg.value);
    }

    // ======== Mint user share ========
    function _phaseEnded(uint256 phase) internal view returns (bool) {
        return block.timestamp >= phaseEndTs(phase);
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

        uint256 allocation = phaseAllocation(phase);
        uint256 userShare = Math.mulDiv(userContribution, allocation, phaseTotal);
        require(totalSupply() + userShare <= TOTAL_SUPPLY, "exceeds supply");

        hasMinted[phase][msg.sender] = true;
        _mint(msg.sender, userShare);
        emit TokensMinted(msg.sender, phase, userShare);
    }

    function mintMultipleUserShares() external nonReentrant {
        require(msg.sender != address(0), "zero addr");
        uint256 mintedCount;
        for (uint256 i = 0; i < PHASE_COUNT; i++) {
            if (_phaseEnded(i) && !hasMinted[i][msg.sender]) {
                uint256 userContribution = contributions[i][msg.sender];
                if (userContribution == 0) continue;
                uint256 phaseTotal = totalContributions[i];
                if (phaseTotal == 0) continue;

                uint256 allocation = phaseAllocation(i);
                uint256 userShare = Math.mulDiv(userContribution, allocation, phaseTotal);
                if (userShare == 0) continue;

                require(totalSupply() + userShare <= TOTAL_SUPPLY, "exceeds supply");
                hasMinted[i][msg.sender] = true;
                _mint(msg.sender, userShare);
                emit TokensMinted(msg.sender, i, userShare);
                mintedCount++;
            }
        }
        require(mintedCount > 0, "none");
    }
    function mintUserSharesRange(uint256 start, uint256 count) external nonReentrant {
        require(msg.sender != address(0), "zero addr");
        require(start < PHASE_COUNT, "start");
        uint256 end = start + count;
        if (end > PHASE_COUNT) end = PHASE_COUNT;
        uint256 mintedCount;
        for (uint256 i = start; i < end; i++) {
            if (_phaseEnded(i) && !hasMinted[i][msg.sender]) {
                uint256 userContribution = contributions[i][msg.sender];
                if (userContribution == 0) continue;
                uint256 phaseTotal = totalContributions[i];
                if (phaseTotal == 0) continue;

                uint256 allocation = phaseAllocation(i);
                uint256 userShare = Math.mulDiv(userContribution, allocation, phaseTotal);
                if (userShare == 0) continue;

                require(totalSupply() + userShare <= TOTAL_SUPPLY, "exceeds supply");
                hasMinted[i][msg.sender] = true;
                _mint(msg.sender, userShare);
                emit TokensMinted(msg.sender, i, userShare);
                mintedCount++;
            }
        }
        require(mintedCount > 0, "none");
    }


    // View helper similar to previous version
    function getEligibleTokens(uint256 phase, address user) external view returns (uint256) {
        if (phase >= PHASE_COUNT || !_phaseEnded(phase)) return 0;
        if (hasMinted[phase][user]) return 0;
        uint256 userContribution = contributions[phase][user];
        if (userContribution == 0) return 0;
        uint256 phaseTotal = totalContributions[phase];
        if (phaseTotal == 0) return 0;
        uint256 allocation = phaseAllocation(phase);
        return Math.mulDiv(userContribution, allocation, phaseTotal);
    }

    function getPhaseContributors(uint256 phase) external view returns (address[] memory) {
        return phaseContributors[phase];
    }

    function getPhaseContributorsSlice(uint256 phase, uint256 start, uint256 count) external view returns (address[] memory) {
        address[] storage list = phaseContributors[phase];
        if (start >= list.length) return new address[](0);
        uint256 end = start + count;
        if (end > list.length) end = list.length;
        uint256 outLen = end - start;
        address[] memory out = new address[](outLen);
        for (uint256 i = 0; i < outLen; i++) {
            out[i] = list[start + i];
        }
        return out;
    }
    // Admin toggle to allow contributions without recording addresses (avoids cap reverts)
    function setRecordContributors(bool on) external onlyOwner {
        recordContributors = on;
    }



    // Owner can withdraw contributed ETH only after schedule ends
    function withdraw() external onlyOwner nonReentrant {
        require(block.timestamp >= totalScheduleEndTs(), "not ended");
        uint256 bal = address(this).balance;
        require(bal > 0, "no eth");
        (bool ok, ) = payable(owner()).call{value: bal}("");
        require(ok, "withdraw");
    }
}

