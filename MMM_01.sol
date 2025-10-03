// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MrManMan is ERC20, Ownable {
    uint256 public constant TOTAL_SUPPLY = 1000000 * 10**18;
    uint256 public constant PRE_MINT_AMOUNT = (TOTAL_SUPPLY * 25) / 100;
    uint256 public constant DYNAMIC_MINT_AMOUNT = TOTAL_SUPPLY - PRE_MINT_AMOUNT;
    address public constant MINTER_ADDRESS = 0xe7C4640F90c40E157A64F714783E7B6576622190;

    uint256 public constant TOTAL_BLOCKS = 1337;

    struct Phase {
        uint256 start;      // offset from launchBlock (in blocks)
        uint256 end;        // offset from launchBlock (in blocks)
        uint256 allocation; // token allocation for this phase (in token units)
    }
    Phase[] public phases;

    uint256 public launchBlock;
    uint256 public lastMintBlock;

    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(uint256 => uint256) public totalContributions;
    mapping(uint256 => mapping(address => bool)) public hasMinted;
    // New: Track contributors per phase
    mapping(uint256 => address[]) public phaseContributors;
    mapping(uint256 => mapping(address => bool)) private contributorAdded;

    event ContributionReceived(address indexed contributor, uint256 phase, uint256 amount);
    event TokensMinted(address indexed user, uint256 phase, uint256 amount);

    constructor() ERC20("MrManMan", "MMM") Ownable(msg.sender) {
        _mint(MINTER_ADDRESS, PRE_MINT_AMOUNT);
        launchBlock = block.number;
        lastMintBlock = launchBlock;

        phases.push(Phase({ start: 0, end: 200, allocation: (DYNAMIC_MINT_AMOUNT * 10) / 100 }));
        uint256 perPhaseAllocation = (DYNAMIC_MINT_AMOUNT * 80) / (100 * 11);
        for (uint256 i = 0; i < 11; i++) {
            phases.push(Phase({ start: 200 + i * 100, end: 300 + i * 100, allocation: perPhaseAllocation }));
        }
        phases.push(Phase({ start: 1300, end: 1337, allocation: (DYNAMIC_MINT_AMOUNT * 10) / 100 }));
    }

    receive() external payable {
        require(block.number < launchBlock + TOTAL_BLOCKS, "Contribution period ended");
        require(msg.value >= 0.001 ether, "Minimum 0.001 ETH required");

        uint256 phase = getCurrentPhase();
        contributions[phase][msg.sender] += msg.value;
        totalContributions[phase] += msg.value;

        // Add contributor to phaseContributors if not already added
        if (!contributorAdded[phase][msg.sender]) {
            phaseContributors[phase].push(msg.sender);
            contributorAdded[phase][msg.sender] = true;
        }

        emit ContributionReceived(msg.sender, phase, msg.value);
    }

    function getCurrentPhase() public view returns (uint256) {
        if (block.number < launchBlock + 200) return 0;
        if (block.number >= launchBlock + 1300) return phases.length - 1;
        return ((block.number - launchBlock - 200) / 100) + 1;
    }

    function mintUserShare(uint256 phase) external {
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
        uint256[] memory mintedPhases = new uint256[](phases.length);
        uint256 mintedCount = 0;

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

                mintedPhases[mintedCount] = i;
                mintedCount++;
            }
        }

        assembly {
            mstore(mintedPhases, mintedCount)
        }

        require(totalMinted > 0, "No eligible phases to mint");
        emit TokensMinted(msg.sender, mintedPhases[mintedCount - 1], totalMinted); // Simplified event emission
    }

    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    // New: Get all contributors for a phase
    function getPhaseContributors(uint256 phase) external view returns (address[] memory) {
        return phaseContributors[phase];
    }

    // New: Get the number of tokens a user is eligible to mint for a specific phase
    function getEligibleTokens(uint256 phase, address user) public view returns (uint256) {
        require(phase < phases.length, "Invalid phase");
        if (block.number <= launchBlock + phases[phase].end || hasMinted[phase][user] || contributions[phase][user] == 0) {
            return 0; // No tokens eligible if phase not ended, already minted, or no contribution
        }

        uint256 phaseTotal = totalContributions[phase];
        require(phaseTotal > 0, "No contributions in phase");
        uint256 allocation = phases[phase].allocation;
        return (contributions[phase][user] * allocation) / phaseTotal;
    }
}