'use client';

import { useMemo, useRef } from 'react';
import { useReadContract, useReadContracts, useBlockNumber } from 'wagmi';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES } from '../lib/wagmi';
import { PHASES, TOTAL_BLOCKS } from '../app/constants';
import { parseAbi } from 'viem';

// Use parseAbi from Viem to convert human-readable ABI to proper format
// Updated for MMM_Unified contract
const CONTRACT_ABI = parseAbi([
  // ERC20
  'function totalSupply() view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  // Phase functions
  'function getCurrentPhase() view returns (uint256)',
  'function launchBlock() view returns (uint256)',
  'function LAUNCH_TIMESTAMP() view returns (uint256)',
  'function PHASE_COUNT() view returns (uint256)',
  'function PHASE_DURATION() view returns (uint256)',
  'function PHASE_0_DURATION() view returns (uint256)',
  'function MIN_CONTRIBUTION_WEI() view returns (uint256)',
  'function phaseStartTs(uint256 phase) view returns (uint256)',
  'function phaseEndTs(uint256 phase) view returns (uint256)',
  'function phaseAllocation(uint256 phase) view returns (uint256)',
  'function totalContributions(uint256 phase) view returns (uint256)',
  'function contributions(uint256 phase, address user) view returns (uint256)',
  'function hasMinted(uint256 phase, address user) view returns (bool)',
  'function getPhaseContributors(uint256 phase) view returns (address[])',
  // Staking
  'function totalStaked() view returns (uint256)',
  'function allocatedSupply() view returns (uint256)',
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
  // Schedule/completion
  isLaunchComplete: boolean;
  // Block-based (legacy MMM_01)
  blockNumber: number;
  launchBlock: number;
  // Time-based (MMM_02)
  isTimeBased: boolean;
  launchTimestamp?: number;
  phaseCount?: number;
  phaseDuration?: number;
  minContributionEth?: string;
  currentPhaseStartTs?: number;
  currentPhaseEndTs?: number;
  scheduleEndTs?: number;
  // Next phase info
  nextPhase?: number | null;
  nextPhaseStartTs?: number;
  nextPhaseEndTs?: number;
  nextPhaseAllocation?: bigint;
  // Token metadata
  tokenName: string;
  tokenSymbol: string;
  // Status
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
  
  // Use a ref to persist isTimeBased once determined (prevents flickering)
  const isTimeBasedRef = useRef<boolean | null>(null);

  // Get current block number for calculations with real-time polling
  const { data: blockNumber } = useBlockNumber({
    watch: true,
    cacheTime: 1000, // Very fast cache time for real-time feel
    query: {
      refetchInterval: 10000, // Reduced from 2000 - less frequent to prevent flickering
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
      refetchInterval: 10000, // Reduced from 3000 - less frequent to prevent flickering
      staleTime: 5000, // Increased from 1000 - data stays fresh longer
      retry: 3, // Retry failed requests
      retryDelay: 1000, // 1 second retry delay
      placeholderData: keepPreviousData, // Keep previous data during refetches
    },
  });

  // Extract basic data (needed for time-based reads that depend on currentPhase)
  const currentPhase = contractReads?.[0]?.result ? Number(contractReads[0].result) : 0;
  const totalSupply = contractReads?.[1]?.result || BigInt(0);
  const launchBlock = contractReads?.[2]?.result ? Number(contractReads[2].result) : 0;
  const tokenName = contractReads?.[3]?.result || 'MrManMan';
  const tokenSymbol = contractReads?.[4]?.result || 'MMM';

  // Optional time-based reads (MMM_Unified). These may fail on legacy contracts; handle gracefully.
  const { data: timeReads } = useReadContracts({
    contracts: [
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'LAUNCH_TIMESTAMP' },
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'PHASE_COUNT' },
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'PHASE_DURATION' },
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'PHASE_0_DURATION' },
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'MIN_CONTRIBUTION_WEI' },
      // Phase-relative bounds for current phase
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'phaseStartTs', args: [BigInt(currentPhase)] },
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'phaseEndTs', args: [BigInt(currentPhase)] },
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'phaseAllocation', args: [BigInt(currentPhase)] },
    ],
    query: {
      enabled: !!contractReads && currentPhase >= 0,
      refetchInterval: 10000, // Reduced from 3000 - less frequent updates to prevent flickering
      staleTime: 5000, // Increased from 1000 - data stays fresh longer
      placeholderData: keepPreviousData, // Keep previous data during refetches
    },
  });

  // Optional time-based values (MMM_Unified)
  const launchTimestamp = timeReads?.[0]?.result ? Number(timeReads[0].result) : (timeReads ? 0 : undefined);
  const phaseCount = timeReads?.[1]?.result ? Number(timeReads[1].result) : (timeReads ? 0 : undefined);
  const phaseDuration = timeReads?.[2]?.result ? Number(timeReads[2].result) : (timeReads ? 0 : undefined);
  const phase0Duration = timeReads?.[3]?.result ? Number(timeReads[3].result) : 0;
  const minContributionWei = timeReads?.[4]?.result ? (timeReads[4].result as bigint) : 0n;
  const currentPhaseStartTs = timeReads?.[5]?.result ? Number(timeReads[5].result) : 0;
  let currentPhaseEndTs = timeReads?.[6]?.result ? Number(timeReads[6].result) : 0;
  const phaseAllocationRaw = timeReads?.[7]?.result ? (timeReads[7].result as bigint) : null;
  
  // Fix for Phase 0: ensure phaseEndTs correctly uses PHASE_0_DURATION
  // The contract's phaseEndTs might use PHASE_DURATION instead of PHASE_0_DURATION for Phase 0
  // So we verify and fix if needed
  if (currentPhase === 0 && launchTimestamp !== undefined && launchTimestamp > 0 && phase0Duration > 0) {
    const expectedEndTs = launchTimestamp + phase0Duration;
    // If the fetched endTs doesn't match expected (using wrong duration), use calculated value
    if (currentPhaseEndTs === 0 || Math.abs(currentPhaseEndTs - expectedEndTs) > 1) {
      currentPhaseEndTs = expectedEndTs;
    }
  }
  
  // Fetch last phase end time for scheduleEndTs calculation
  const { data: lastPhaseEndTs } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'phaseEndTs',
    args: phaseCount !== undefined && phaseCount > 0 ? [BigInt(phaseCount - 1)] : undefined,
    query: {
      enabled: !!contractReads && phaseCount !== undefined && phaseCount > 0,
      refetchInterval: 10000, // Less frequent for last phase (doesn't change often)
      staleTime: 5000,
    },
  });
  
  // Fetch next phase info for display
  const nextPhase = phaseCount !== undefined && currentPhase < phaseCount - 1 ? currentPhase + 1 : null;
  const { data: nextPhaseStartTs } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'phaseStartTs',
    args: nextPhase !== null ? [BigInt(nextPhase)] : undefined,
    query: {
      enabled: !!contractReads && nextPhase !== null && phaseCount !== undefined && phaseCount > 0,
      refetchInterval: 5000,
      staleTime: 2000,
    },
  });
  
  const { data: nextPhaseEndTs } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'phaseEndTs',
    args: nextPhase !== null ? [BigInt(nextPhase)] : undefined,
    query: {
      enabled: !!contractReads && nextPhase !== null && phaseCount !== undefined && phaseCount > 0,
      refetchInterval: 5000,
      staleTime: 2000,
    },
  });
  
  const { data: nextPhaseAllocation } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'phaseAllocation',
    args: nextPhase !== null ? [BigInt(nextPhase)] : undefined,
    query: {
      enabled: !!contractReads && nextPhase !== null && phaseCount !== undefined && phaseCount > 0,
      refetchInterval: 10000, // Less frequent (allocation doesn't change)
      staleTime: 5000,
    },
  });
  
  // Calculate scheduleEndTs from last phase end (MMM_Unified doesn't have totalScheduleEndTs)
  const scheduleEndTs = lastPhaseEndTs ? Number(lastPhaseEndTs) : 
    (currentPhaseEndTs && phaseCount !== undefined && phaseCount > 0 && currentPhase === phaseCount - 1
      ? currentPhaseEndTs
      : (launchTimestamp !== undefined && phaseCount !== undefined && phaseDuration !== undefined ? launchTimestamp + phaseCount * phaseDuration : 0));

  const nowTs = Math.floor(Date.now() / 1000);
  // CRITICAL: Stable isTimeBased check - once determined, NEVER change it
  // This prevents ALL flickering by making the determination permanent
  const isTimeBased = useMemo(() => {
    // Check if we have valid time-based data (all values > 0)
    const hasTimeData = launchTimestamp !== undefined && phaseCount !== undefined && phaseDuration !== undefined &&
                        launchTimestamp > 0 && phaseCount > 0 && phaseDuration > 0;
    
    if (hasTimeData) {
      // We have confirmed time-based data - SET IT PERMANENTLY
      isTimeBasedRef.current = true;
      return true;
    }
    
    // CRITICAL: If we previously determined it's time-based, ALWAYS keep that value
    // This prevents flickering when values temporarily become 0/undefined during refetches
    // NEVER flip back to false once we know it's time-based
    if (isTimeBasedRef.current === true) {
      return true;
    }
    
    // If data is still loading (undefined), return false (will be set when data loads)
    // Only return false if we're certain it's block-based (all values are 0 and not loading)
    if (launchTimestamp === undefined || phaseCount === undefined || phaseDuration === undefined) {
      // Still loading, return false for now
      return false;
    }
    
    // Confirmed block-based (all values are 0 and we've never seen time-based data)
    return false;
  }, [launchTimestamp, phaseCount, phaseDuration]);

  // Calculate derived values
  const currentBlockNumber = blockNumber ? Number(blockNumber) : 0;
  const isLaunchCompleteBlocks = launchBlock > 0 && currentBlockNumber >= launchBlock + TOTAL_BLOCKS;
  const isLaunchCompleteTime = isTimeBased && scheduleEndTs > 0 ? nowTs >= scheduleEndTs : false;
  // IMPORTANT: For time-based contracts, ignore block-based completion
  const isLaunchComplete = isTimeBased ? isLaunchCompleteTime : isLaunchCompleteBlocks;

  const totalTokensThisPhase = isTimeBased && phaseAllocationRaw !== null
    ? ethers.formatEther(phaseAllocationRaw)
    : PHASES[currentPhase]?.amount || '0';

  const minContributionEth = minContributionWei > 0n ? ethers.formatEther(minContributionWei) : undefined;




  // Fetch phase contributions in parallel (dynamic length)
  const phaseCountForReads = (isTimeBased && phaseCount !== undefined && phaseCount > 0) ? phaseCount : PHASES.length;
  const phaseContractCalls = Array.from({ length: phaseCountForReads }, (_, index) => ({
    address: contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'totalContributions' as const,
    args: [BigInt(index)],
  }));

  const { data: phaseContributions, isLoading: isPhaseLoading } = useReadContracts({
    contracts: phaseContractCalls,
    query: {
      enabled: !!contractReads && !isContractLoading,
      refetchInterval: 10000, // Reduced from 5000 - less frequent to prevent flickering
      staleTime: 5000, // Increased from 2000 - data stays fresh longer
      retry: 2,
      retryDelay: 500,
      placeholderData: keepPreviousData, // Keep previous data during refetches
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
      refetchInterval: 10000, // Reduced from 4000 - less frequent to prevent flickering
      staleTime: 5000, // Increased from 2000 - data stays fresh longer
      retry: 2,
      placeholderData: keepPreviousData, // Keep previous data during refetches
    },
  });

  // Skip heavy global contributors fetch to reduce RPC load
  const allPhaseContributors: undefined | [] = undefined;
  const isAllContributorsLoading = false;

  // Calculate participant counts
  const participantsCount = Array.isArray(currentPhaseParticipants) ? currentPhaseParticipants.length : 0;

  // Global contributors data skipped to keep reads lightweight
  const totalParticipantsData: PieData[] = [];

  const isLoading = isContractLoading || isPhaseLoading || isAllContributorsLoading;
  const error = contractError;
  const hasBasicData = !!contractReads && currentPhase >= 0;
  const hasPhaseData = !!phaseContributions;
  const hasGlobalData = !!allPhaseContributors && totalParticipantsData.length > 0;
  // If the contract is time-based (MMM_02), ignore errors from legacy-only reads like launchBlock
  const isValidated = !isLoading && hasBasicData && hasPhaseData && (!error || isTimeBased);

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
    isTimeBased,
    launchTimestamp,
    phaseCount,
    phaseDuration,
    minContributionEth,
    currentPhaseStartTs,
    currentPhaseEndTs,
    scheduleEndTs,
    nextPhase: nextPhase ?? null,
    nextPhaseStartTs: nextPhaseStartTs ? Number(nextPhaseStartTs) : undefined,
    nextPhaseEndTs: nextPhaseEndTs ? Number(nextPhaseEndTs) : undefined,
    nextPhaseAllocation: nextPhaseAllocation || undefined,
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

/* eslint-disable @typescript-eslint/no-unused-vars */

// Hook for user-specific data (stubbed; page implements its own optimized flow)
export function useUserContractData(_userAddress?: string, _chainId?: number) {
  return {
    userContributions: [] as string[],
    mintablePhases: [] as number[],
    isLoading: false,
    error: null as unknown,
    isValidated: true,
  };
}
