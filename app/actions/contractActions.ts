'use server';

import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, PHASES, TOTAL_BLOCKS } from '../constants';

// Types for server actions
export interface ServerContractData {
  currentPhase: number;
  totalMinted: string;
  totalContributions: string;
  currentPhaseContributions: string;
  totalTokensThisPhase: number;
  isLaunchComplete: boolean;
  blockNumber: number;
  launchBlock: number;
  tokenName: string;
  tokenSymbol: string;
  phaseContributions: string[];
  totalParticipants: number;
  historicalPhaseProgress: Array<{
    phase: number;
    progress: number;
    blocksPassed: number;
    totalBlocks: number;
  }>;
}

// Get RPC URL based on network
function getRpcUrl(chainId: number): string {
  switch (chainId) {
    case 11155111: // Sepolia
      return process.env.INFURA
        ? `https://sepolia.infura.io/v3/${process.env.INFURA}`
        : 'https://rpc.sepolia.org';
    case 17000: // Holesky
      return process.env.INFURAHOLESKY
        ? `https://holesky.infura.io/v3/${process.env.INFURAHOLESKY}`
        : 'https://rpc.holesky.ethpandaops.io';
    case 1: // Mainnet
      return process.env.INFURA
        ? `https://mainnet.infura.io/v3/${process.env.INFURA}`
        : 'https://eth.llamarpc.com';
    default:
      return 'https://rpc.sepolia.org';
  }
}

// Server action to fetch basic contract data
export async function fetchBasicContractData(chainId: number = 11155111): Promise<ServerContractData | null> {
  try {
    const rpcUrl = getRpcUrl(chainId);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

    // Parallel fetch of basic data
    const [
      currentPhaseResult,
      totalSupplyResult,
      launchBlockResult,
      blockNumberResult,
      tokenNameResult,
      tokenSymbolResult,
    ] = await Promise.all([
      contract.getCurrentPhase().catch(() => 0),
      contract.totalSupply().catch(() => BigInt(0)),
      contract.launchBlock().catch(() => 0),
      provider.getBlockNumber().catch(() => 0),
      contract.name().catch(() => ''),
      contract.symbol().catch(() => ''),
    ]);

    const currentPhase = Number(currentPhaseResult);
    const totalMinted = ethers.formatEther(totalSupplyResult);
    const launchBlock = Number(launchBlockResult);
    const blockNumber = blockNumberResult;
    const tokenName = tokenNameResult;
    const tokenSymbol = tokenSymbolResult;

    // Check if launch is complete
    const isLaunchComplete = launchBlock > 0 && blockNumber >= launchBlock + TOTAL_BLOCKS;

    // Fetch phase contributions in parallel
    const phaseContributionsPromises = PHASES.map((_, index) =>
      contract.totalContributions(index).catch(() => BigInt(0))
    );
    const phaseContributionsResults = await Promise.all(phaseContributionsPromises);

    const phaseContributions = phaseContributionsResults.map(result =>
      ethers.formatEther(result)
    );

    const totalContributions = phaseContributionsResults
      .reduce((acc, contrib) => acc + contrib, BigInt(0));

    const currentPhaseContributions = phaseContributionsResults[currentPhase] || BigInt(0);

    // Calculate historical phase progress
    const historicalPhaseProgress = PHASES.map((_, index) => {
      if (index >= currentPhase) {
        return {
          phase: index,
          progress: 0,
          blocksPassed: 0,
          totalBlocks: 100,
        };
      }

      return {
        phase: index,
        progress: 100,
        blocksPassed: 100,
        totalBlocks: 100,
      };
    });

    // Calculate total participants (simplified - in real implementation you'd track unique addresses)
    const totalParticipants = phaseContributionsResults.reduce((count, contrib) => {
      return contrib > BigInt(0) ? count + 1 : count;
    }, 0);

    return {
      currentPhase: isLaunchComplete ? PHASES.length - 1 : currentPhase,
      totalMinted,
      totalContributions: ethers.formatEther(totalContributions),
      currentPhaseContributions: ethers.formatEther(currentPhaseContributions),
      totalTokensThisPhase: parseFloat(PHASES[currentPhase]?.amount || "0"),
      isLaunchComplete,
      blockNumber,
      launchBlock,
      tokenName,
      tokenSymbol,
      phaseContributions,
      totalParticipants,
      historicalPhaseProgress,
    };

  } catch (error) {
    console.error('Failed to fetch basic contract data:', error);
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-unused-vars */
// Server action to fetch user-specific data (lightweight stub; client computes details)
export async function fetchUserContractData(
  _userAddress: string,
  _chainId?: number
): Promise<{
  userContributions: string[];
  mintablePhases: number[];
  totalUserContributions: string;
} | null> {
  try {
    // For now, return empty arrays to avoid heavy RPC usage server-side.
    // The client page computes per-phase details efficiently and merges pending txs.
    return {
      userContributions: [],
      mintablePhases: [],
      totalUserContributions: '0',
    };
  } catch (error) {
    console.error('Failed to fetch user contract data:', error);
    return null;
  }
/* eslint-enable @typescript-eslint/no-unused-vars */

}

// Server action to get network status
export async function getNetworkStatus(chainId: number): Promise<{
  isValid: boolean;
  blockNumber: number;
  chainId: number;
} | null> {
  try {
    const rpcUrl = getRpcUrl(chainId);
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const [network, blockNumber] = await Promise.all([
      provider.getNetwork(),
      provider.getBlockNumber(),
    ]);

    return {
      isValid: Number(network.chainId) === chainId,
      blockNumber,
      chainId: Number(network.chainId),
    };

  } catch (error) {
    console.error('Failed to get network status:', error);
    return null;
  }
}
