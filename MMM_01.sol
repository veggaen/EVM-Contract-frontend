// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MrManMan is ERC20, Ownable {
    uint256 public constant TOTAL_SUPPLY = 1000000 * 10**18; // 1M tokens with 18 decimals
    uint256 public constant PRE_MINT_AMOUNT = (TOTAL_SUPPLY * 25) / 100; // 25% pre-minted
    uint256 public constant DYNAMIC_MINT_AMOUNT = TOTAL_SUPPLY - PRE_MINT_AMOUNT;
    address public constant MINTER_ADDRESS = 0xe7C4640F90c40E157A64F714783E7B6576622190;

    // Adjustable total blocks for the launch period
    uint256 public constant TOTAL_BLOCKS = 130037; // Example: ~6 months at 12s/block

    struct Phase {
        uint256 start;      // Offset from launchBlock (in blocks)
        uint256 end;        // Offset from launchBlock (in blocks)
        uint256 allocation; // Token allocation for this phase (in token units)
    }
    Phase[] public phases;

    uint256 public launchBlock;
    uint256 public lastMintBlock;

    mapping(uint256 => mapping(address => uint256)) public contributions; // phase => user => amount
    mapping(uint256 => uint256) public totalContributions; // phase => total ETH
    mapping(uint256 => mapping(address => bool)) public hasMinted; // phase => user => minted
    mapping(uint256 => address[]) public phaseContributors; // phase => contributors list
    mapping(uint256 => mapping(address => bool)) private contributorAdded; // phase => user => added

    event ContributionReceived(address indexed contributor, uint256 phase, uint256 amount);
    event TokensMinted(address indexed user, uint256 phase, uint256 amount);

    constructor() ERC20("MrManMan", "MMM") Ownable(msg.sender) {
        _mint(MINTER_ADDRESS, PRE_MINT_AMOUNT);
        launchBlock = block.number;
        lastMintBlock = launchBlock;

        // Dynamic phase configuration (15 phases as an example)
        uint256 phaseCount = 15;
        uint256 startPhaseDuration = 2000; // First phase: 2000 blocks
        uint256 endPhaseDuration = 2000;   // Last phase: 2000 blocks
        uint256 midPhaseDuration = (TOTAL_BLOCKS - startPhaseDuration - endPhaseDuration) / (phaseCount - 2);

        // Phase 0: Start phase
        phases.push(Phase({
            start: 0,
            end: startPhaseDuration,
            allocation: (DYNAMIC_MINT_AMOUNT * 10) / 100 // 10% of dynamic amount
        }));

        // Middle phases (13 phases)
        uint256 perPhaseAllocation = (DYNAMIC_MINT_AMOUNT * 80) / (100 * (phaseCount - 2));
        for (uint256 i = 0; i < phaseCount - 2; i++) {
            phases.push(Phase({
                start: startPhaseDuration + i * midPhaseDuration,
                end: startPhaseDuration + (i + 1) * midPhaseDuration,
                allocation: perPhaseAllocation
            }));
        }

        // Last phase
        phases.push(Phase({
            start: TOTAL_BLOCKS - endPhaseDuration,
            end: TOTAL_BLOCKS,
            allocation: (DYNAMIC_MINT_AMOUNT * 10) / 100 // 10% of dynamic amount
        }));
    }

    receive() external payable {
        require(block.number < launchBlock + TOTAL_BLOCKS, "Contribution period ended");
        require(msg.value >= 0.001 ether, "Minimum 0.001 ETH required");

        uint256 phase = getCurrentPhase();
        contributions[phase][msg.sender] += msg.value;
        totalContributions[phase] += msg.value;

        if (!contributorAdded[phase][msg.sender]) {
            phaseContributors[phase].push(msg.sender);
            contributorAdded[phase][msg.sender] = true;
        }

        emit ContributionReceived(msg.sender, phase, msg.value);
    }

    function getCurrentPhase() public view returns (uint256) {
        if (block.number <= launchBlock) return 0;
        if (block.number >= launchBlock + TOTAL_BLOCKS) return phases.length - 1;
        for (uint256 i = 0; i < phases.length; i++) {
            if (block.number >= launchBlock + phases[i].start && block.number <= launchBlock + phases[i].end) {
                return i;
            }
        }
        revert("Phase calculation error");
    }

    function mintUserShare(uint256 phase) external {
        require(phase < phases.length, "Invalid phase");
        require(block.number > launchBlock + phases[phase].end, "Phase not ended");
        require(!hasMinted[phase][msg.sender], "Already minted for this phase");
        uint256 userContribution = contributions[phase][msg.sender];
        require(userContribution > 0, "No contribution in this phase");

        uint256 phaseTotal = totalContributions[phase];
        uint256 allocation = phases[phase].allocation;
        uint256 userShare = (userContribution * allocation) / phaseTotal;

        uint256 currentSupply = totalSupply();
        require(currentSupply + userShare <= TOTAL_SUPPLY, "Would exceed total supply");

        hasMinted[phase][msg.sender] = true;
        _mint(msg.sender, userShare);
        emit TokensMinted(msg.sender, phase, userShare);
    }

    function mintMultipleUserShares() external {
        uint256 totalMinted = 0;
        for (uint256 i = 0; i < phases.length; i++) {
            if (block.number > launchBlock + phases[i].end && !hasMinted[i][msg.sender] && contributions[i][msg.sender] > 0) {
                uint256 phaseTotal = totalContributions[i];
                require(phaseTotal > 0, "No contributions in phase");
                uint256 allocation = phases[i].allocation;
                uint256 userShare = (contributions[i][msg.sender] * allocation) / phaseTotal;

                uint256 currentSupply = totalSupply();
                require(currentSupply + userShare <= TOTAL_SUPPLY, "Would exceed total supply");

                hasMinted[i][msg.sender] = true;
                _mint(msg.sender, userShare);
                totalMinted += userShare;
            }
        }
        require(totalMinted > 0, "No eligible phases to mint");
        emit TokensMinted(msg.sender, phases.length - 1, totalMinted);
    }

    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    // View functions for frontend
    function getPhaseContributors(uint256 phase) external view returns (address[] memory) {
        return phaseContributors[phase];
    }

    function getEligibleTokens(uint256 phase, address user) public view returns (uint256) {
        require(phase < phases.length, "Invalid phase");
        if (block.number <= launchBlock + phases[phase].end || hasMinted[phase][user] || contributions[phase][user] == 0) {
            return 0;
        }
        uint256 phaseTotal = totalContributions[phase];
        require(phaseTotal > 0, "No contributions in phase");
        uint256 allocation = phases[phase].allocation;
        return (contributions[phase][user] * allocation) / phaseTotal;
    }

    function getPhaseCount() external view returns (uint256) {
        return phases.length;
    }

    function getPhaseDetails(uint256 phase) external view returns (uint256 start, uint256 end, uint256 allocation) {
        require(phase < phases.length, "Invalid phase");
        Phase memory p = phases[phase];
        return (p.start, p.end, p.allocation);
    }

    function getTotalBlocks() external pure returns (uint256) {
    return TOTAL_BLOCKS;
    }

}