// Re-export constants from the main page for component compatibility
import { sepolia } from 'wagmi/chains';
import { CONTRACT_ADDRESSES } from '../lib/wagmi';

// Use Sepolia as default for components
export const CONTRACT_ADDRESS = CONTRACT_ADDRESSES[sepolia.id];

// Constants from main page
export const TOTAL_BLOCKS = 1337;
export const TOTAL_SUPPLY = 1000000;
export const PRE_MINT_PERCENT = 0.25;
export const DYNAMIC_MINT_AMOUNT = TOTAL_SUPPLY * (1 - PRE_MINT_PERCENT);

export const PHASES = [
  { start: 0, end: 200, amount: (DYNAMIC_MINT_AMOUNT * 0.1).toString() },
  ...Array.from({ length: 11 }, (_, i) => ({
    start: 200 + i * 100,
    end: 200 + (i + 1) * 100,
    amount: (DYNAMIC_MINT_AMOUNT * 0.075).toString(),
  })),
  { start: 1300, end: 1337, amount: (DYNAMIC_MINT_AMOUNT * 0.075).toString() },
];

export const CONTRACT_ABI = [
  "function getCurrentPhase() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function launchBlock() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalContributions(uint256 phase) view returns (uint256)",
  "function contributions(uint256 phase, address user) view returns (uint256)",
  "function getUserContributions(address user) view returns (uint256[])",
  "function getUserMintablePhases(address user) view returns (uint256[])",
  "function hasMinted(uint256 phase, address user) view returns (bool)",
  "function getPhaseContributors(uint256 phase) view returns (address[])",
  "function phases(uint256) view returns (uint256, uint256, uint256)",
  "function withdraw()",
  "function getEligibleTokens(uint256 phase, address user) view returns (uint256)",
  "function mintUserShare(uint256 phase)",
  "function mintMultipleUserShares()",
];
