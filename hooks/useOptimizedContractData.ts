'use client';

import { useMemo } from 'react';
import { useReadContract, useReadContracts, useBlockNumber } from 'wagmi';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES } from '../lib/wagmi';
import { PHASES, TOTAL_BLOCKS } from '../app/constants';
import { parseAbi } from 'viem';

// Use parseAbi from Viem to convert human-readable ABI to proper format
const CONTRACT_ABI = parseAbi([
  'function getCurrentPhase() view returns (uint256)',
  'function totalSupply() view returns (uint256)', 
  'function launchBlock() view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalContributions(uint256 phase) view returns (uint256)',
  'function contributions(uint256 phase, address user) view returns (uint256)',
  'function getUserContributions(address user) view returns (uint256[])',
  'function getUserMintablePhases(address user) view returns (uint256[])',
  'function hasMinted(uint256 phase, address user) view returns (bool)',
  'function getPhaseContributors(uint256 phase) view returns (address[])',
]);

// Types
// PieData interface for chart data
interface PieData {
  name: string;
  address: string;
  value: number;
}

export interface OptimizedContractData {
  currentPhase: number;
  totalMinted: string;
  totalContributions: string;
  currentPhaseContributions: string;
  totalTokensThisPhase: string;
  participantsCount: number;
  totalParticipants: number;
  totalParticipantsData: PieData[];
  isLaunchComplete: boolean;
  blockNumber: number;
  launchBlock: number;
  tokenName: string;
  tokenSymbol: string;
  isLoading: boolean;
  error: any;
  isValidated: boolean;
  hasBasicData: boolean;
  hasPhaseData: boolean;
  hasGlobalData: boolean;
}

// Hook for optimized parallel contract data fetching
export function useOptimizedContractData(chainId: number): OptimizedContractData {
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];

  // Get current block number for calculations with real-time polling
  const { data: blockNumber } = useBlockNumber({
    watch: true,
    cacheTime: 1000, // Very fast cache time for real-time feel
    query: {
      refetchInterval: 2000, // Poll every 2 seconds for real-time block updates
    },
  });

  // Parallel fetch of core contract data with aggressive caching
  const { data: contractReads, isLoading: isContractLoading, error: contractError } = useReadContracts({
    contracts: [
      {
        address: contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'getCurrentPhase',
      },
      {
        address: contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'totalSupply',
      },
      {
        address: contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'launchBlock',
      },
      {
        address: contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'name',
      },
      {
        address: contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'symbol',
      },
    ],
    query: {
      refetchInterval: 5000, // Real-time refresh every 5 seconds
      staleTime: 2000, // Consider data stale after 2 seconds for faster updates
      retry: 3, // Retry failed requests
      retryDelay: 1000, // 1 second retry delay
      placeholderData: keepPreviousData,
    },
  });

  // Extract basic data
  const currentPhase = contractReads?.[0]?.result ? Number(contractReads[0].result) : 0;
  const totalSupply = contractReads?.[1]?.result || BigInt(0);
  const launchBlock = contractReads?.[2]?.result ? Number(contractReads[2].result) : 0;
  const tokenName = contractReads?.[3]?.result || 'MrManMan';
  const tokenSymbol = contractReads?.[4]?.result || 'MMM';

  // Calculate derived values
  const currentBlockNumber = blockNumber ? Number(blockNumber) : 0;
  const isLaunchComplete = launchBlock > 0 && currentBlockNumber >= launchBlock + TOTAL_BLOCKS;
  const totalTokensThisPhase = PHASES[currentPhase]?.amount || '0';

  // Fetch phase contributions in parallel
  const phaseContractCalls = PHASES.map((_, index) => ({
    address: contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'totalContributions' as const,
    args: [BigInt(index)],
  }));

  const { data: phaseContributions, isLoading: isPhaseLoading } = useReadContracts({
    contracts: phaseContractCalls,
    query: {
      enabled: !!contractReads && !isContractLoading,
      refetchInterval: 8000, // Faster refresh
      staleTime: 4000, // Shorter stale time
      retry: 2,
      retryDelay: 500,
      placeholderData: keepPreviousData,
    },
  });

  // Calculate total contributions
  const totalContributions = phaseContributions?.reduce((sum, contrib) => {
    return sum + (contrib.result ? BigInt(contrib.result as bigint) : BigInt(0));
  }, BigInt(0)) || BigInt(0);

  const currentPhaseContributions = phaseContributions?.[currentPhase]?.result 
    ? BigInt(phaseContributions[currentPhase].result as bigint) 
    : BigInt(0);

  // Fetch participant counts for current phase
  const { data: currentPhaseParticipants } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getPhaseContributors',
    args: [BigInt(currentPhase)],
    query: {
      enabled: !!contractReads && !isContractLoading && currentPhase >= 0,
      refetchInterval: 6000, // Real-time refresh for current phase
      staleTime: 3000, // Shorter stale time for real-time feel
      retry: 2,
      placeholderData: keepPreviousData,
    },
  });

  // Fetch all phase contributors for global data (parallel fetching)
  const allPhaseContributorCalls = PHASES.map((_, index) => ({
    address: contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getPhaseContributors' as const,
    args: [BigInt(index)],
  }));

  const { data: allPhaseContributors, isLoading: isAllContributorsLoading } = useReadContracts({
    contracts: allPhaseContributorCalls,
    query: {
      enabled: !!contractReads && !isContractLoading,
      refetchInterval: 15000, // Slower for this heavy data
      staleTime: 10000,
      retry: 1,
      placeholderData: keepPreviousData,
    },
  });

  // Calculate participant counts
  const participantsCount = Array.isArray(currentPhaseParticipants) ? currentPhaseParticipants.length : 0;

  // Process global contributors data for charts
  const totalParticipantsData = useMemo(() => {
    if (!allPhaseContributors || !phaseContributions) return [];

    const allContributors = new Map<string, { name: string; address: string; value: number; }>();

    allPhaseContributors.forEach((phaseResult, phaseIndex) => {
      if (phaseResult.status === 'success' && phaseResult.result) {
        const contributors = phaseResult.result as string[];
        const phaseContrib = phaseContributions[phaseIndex];

        if (phaseContrib?.status === 'success' && phaseContrib.result) {
          const totalPhaseContrib = Number(ethers.formatEther(phaseContrib.result as bigint));
          const contributorShare = totalPhaseContrib / contributors.length; // Simplified - equal share

          contributors.forEach((addr) => {
            const existing = allContributors.get(addr);
            if (existing) {
              existing.value += contributorShare;
            } else {
              allContributors.set(addr, {
                name: `${addr.slice(0, 6)}...${addr.slice(-4)}`,
                address: addr,
                value: contributorShare,
              });
            }
          });
        }
      }
    });

    return Array.from(allContributors.values()).filter(d => d.value > 0);
  }, [allPhaseContributors, phaseContributions]);

  const isLoading = isContractLoading || isPhaseLoading || isAllContributorsLoading;
  const error = contractError;
  const hasBasicData = !!contractReads && currentPhase >= 0;
  const hasPhaseData = !!phaseContributions;
  const hasGlobalData = !!allPhaseContributors && totalParticipantsData.length > 0;
  const isValidated = !isLoading && !error && hasBasicData && hasPhaseData;

  return {
    currentPhase,
    totalMinted: ethers.formatEther(totalSupply),
    totalContributions: ethers.formatEther(totalContributions),
    currentPhaseContributions: ethers.formatEther(currentPhaseContributions),
    totalTokensThisPhase,
    participantsCount,
    totalParticipants: totalParticipantsData.length,
    totalParticipantsData, // For Global Contributions and Top Contributors
    isLaunchComplete,
    blockNumber: currentBlockNumber,
    launchBlock,
    tokenName,
    tokenSymbol,
    isLoading,
    error,
    isValidated,
    hasBasicData,
    hasPhaseData,
    hasGlobalData,
  };
}

// Hook for user-specific data
export function useUserContractData(userAddress: string | undefined, chainId: number) {
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];

  const { data: userReads, isLoading, error } = useReadContracts({
    contracts: userAddress ? [
      {
        address: contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'getUserContributions',
        args: [userAddress as `0x${string}`],
      },
      {
        address: contractAddress as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'getUserMintablePhases',
        args: [userAddress as `0x${string}`],
      },
    ] : [],
    query: {
      enabled: !!userAddress,
      refetchInterval: 15000,
      staleTime: 10000,
      placeholderData: keepPreviousData,
    },
  });

  const userContributions = userReads?.[0]?.result as bigint[] || [];
  const mintablePhases = userReads?.[1]?.result as bigint[] || [];

  return {
    userContributions: userContributions.map(c => ethers.formatEther(c)),
    mintablePhases: mintablePhases.map(p => Number(p)),
    isLoading,
    error,
    isValidated: !isLoading && !error,
  };
}
