'use client';

import { useMemo, useRef, useEffect } from 'react';
import { useReadContract, useReadContracts, useBlockNumber } from 'wagmi';
import { keepPreviousData } from '@tanstack/react-query';
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
  calculatedCurrentPhase: number; // Consistent phase calculation
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
  error: unknown;
  isValidated: boolean;
  hasBasicData: boolean;
  hasPhaseData: boolean;
  hasGlobalData: boolean;
}

// Hook for optimized parallel contract data fetching
export function useOptimizedContractData(chainId: number): OptimizedContractData {
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  const contractAddressRef = useRef<string | undefined>(contractAddress);
  
  // Use a ref to persist isTimeBased once determined (prevents flickering)
  // Reset when contract address changes
  const isTimeBasedRef = useRef<boolean | null>(null);
  
  // Reset isTimeBased ref when contract address changes
  useEffect(() => {
    if (contractAddressRef.current !== contractAddress) {
      contractAddressRef.current = contractAddress;
      isTimeBasedRef.current = null;
    }
  }, [contractAddress]);

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
  const contractReportedPhase = contractReads?.[0]?.result ? Number(contractReads[0].result) : 0;
  const totalSupply = contractReads?.[1]?.result || BigInt(0);
  const launchBlock = contractReads?.[2]?.result ? Number(contractReads[2].result) : 0;
  const tokenName = contractReads?.[3]?.result || 'MrManMan';
  const tokenSymbol = contractReads?.[4]?.result || 'MMM';

  // Optional time-based reads (MMM_Unified). These may fail on legacy contracts; handle gracefully.
  // First, fetch basic time info to calculate actual current phase
  const { data: timeReadsBasic, error: timeReadsError, isLoading: isTimeReadsLoading } = useReadContracts({
    contracts: [
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'LAUNCH_TIMESTAMP' },
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'PHASE_COUNT' },
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'PHASE_DURATION' },
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'PHASE_0_DURATION' },
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'MIN_CONTRIBUTION_WEI' },
    ],
    query: {
      enabled: !!contractReads,
      refetchInterval: 30000, // Less aggressive - every 30 seconds
      staleTime: 20000, // Keep data fresh for 20 seconds
      placeholderData: keepPreviousData,
    },
  });

  // Calculate actual current phase from timestamps if we have time-based data
  // This fixes cases where getCurrentPhase() returns wrong value (e.g., stuck at 0)
  const calculatedCurrentPhase = useMemo(() => {
    const launchTs = timeReadsBasic?.[0]?.result !== undefined && timeReadsBasic?.[0]?.result !== null
      ? Number(timeReadsBasic[0].result)
      : undefined;
    const phaseCount = timeReadsBasic?.[1]?.result !== undefined && timeReadsBasic?.[1]?.result !== null
      ? Number(timeReadsBasic[1].result)
      : undefined;
    const phase0Duration = timeReadsBasic?.[3]?.result ? Number(timeReadsBasic[3].result) : 900;

    if (!launchTs || !phaseCount || launchTs === 0) return contractReportedPhase;

    const nowTs = Math.floor(Date.now() / 1000);
    const elapsed = nowTs - launchTs;

    if (elapsed < 0) return 0;

    // Get phase 0 duration
    const phase0DurationActual = timeReadsBasic?.[3]?.result ? Number(timeReadsBasic[3].result) : 900;

    if (elapsed < phase0DurationActual) return 0;

    // Calculate phase from elapsed time (same logic as main page)
    let calculatedPhase = 0;
    let cumulative = phase0DurationActual;

    // Phases 0-10: 15 min each (900s)
    for (let i = 1; i <= 10; i++) {
      cumulative += 900;
      if (elapsed < cumulative) {
        calculatedPhase = i;
        break;
      }
    }

    // Phases 11-20: 30 min each (1800s)
    if (calculatedPhase === 0 && elapsed >= cumulative) {
      for (let i = 11; i <= 20; i++) {
        cumulative += 1800;
        if (elapsed < cumulative) {
          calculatedPhase = i;
          break;
        }
      }
    }

    // Rest: 1 hour each (3600s)
    if (calculatedPhase === 0 && elapsed >= cumulative) {
      const defaultDuration = 3600;
      for (let i = 21; i < phaseCount; i++) {
        cumulative += defaultDuration;
        if (elapsed < cumulative) {
          calculatedPhase = i;
          break;
        }
      }
      if (calculatedPhase === 0) {
        calculatedPhase = phaseCount - 1;
      }
    }

    return calculatedPhase;
  }, [contractReportedPhase, timeReadsBasic]);

  // Now fetch phase-specific data using calculated phase
  const { data: timeReads } = useReadContracts({
    contracts: [
      // Phase-relative bounds for calculated current phase
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'phaseStartTs', args: [BigInt(calculatedCurrentPhase)] },
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'phaseEndTs', args: [BigInt(calculatedCurrentPhase)] },
      { address: contractAddress as `0x${string}`, abi: CONTRACT_ABI, functionName: 'phaseAllocation', args: [BigInt(calculatedCurrentPhase)] },
    ],
    query: {
      enabled: !!contractReads && calculatedCurrentPhase >= 0,
      refetchInterval: 10000, // Reduced from 3000 - less frequent updates to prevent flickering
      staleTime: 5000, // Increased from 1000 - data stays fresh longer
      placeholderData: keepPreviousData, // Keep previous data during refetches
    },
  });

  // Optional time-based values (MMM_Unified)
  // Extract from timeReadsBasic (basic info) and timeReads (phase-specific)
  const launchTimestamp = timeReadsBasic?.[0]?.result !== undefined && timeReadsBasic?.[0]?.result !== null 
    ? Number(timeReadsBasic[0].result) 
    : undefined;
  const phaseCount = timeReadsBasic?.[1]?.result !== undefined && timeReadsBasic?.[1]?.result !== null
    ? Number(timeReadsBasic[1].result)
    : undefined;
  const phaseDuration = timeReadsBasic?.[2]?.result !== undefined && timeReadsBasic?.[2]?.result !== null
    ? Number(timeReadsBasic[2].result)
    : undefined;
  const phase0Duration = timeReadsBasic?.[3]?.result ? Number(timeReadsBasic[3].result) : 0;
  const minContributionWei = timeReadsBasic?.[4]?.result ? (timeReadsBasic[4].result as bigint) : 0n;
  const currentPhaseStartTs = timeReads?.[0]?.result ? Number(timeReads[0].result) : 0;
  let currentPhaseEndTs = timeReads?.[1]?.result ? Number(timeReads[1].result) : 0;
  const phaseAllocationRaw = timeReads?.[2]?.result ? (timeReads[2].result as bigint) : null;
  
  // Fix for Phase 0: ensure phaseEndTs correctly uses PHASE_0_DURATION
  // The contract's phaseEndTs might use PHASE_DURATION instead of PHASE_0_DURATION for Phase 0
  // So we verify and fix if needed
  if (calculatedCurrentPhase === 0 && launchTimestamp !== undefined && launchTimestamp > 0 && phase0Duration > 0) {
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
  const nextPhase = phaseCount !== undefined && calculatedCurrentPhase < phaseCount - 1 ? calculatedCurrentPhase + 1 : null;
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
    (currentPhaseEndTs && phaseCount !== undefined && phaseCount > 0 && calculatedCurrentPhase === phaseCount - 1
      ? currentPhaseEndTs
      : (launchTimestamp !== undefined && phaseCount !== undefined && phaseDuration !== undefined ? launchTimestamp + phaseCount * phaseDuration : 0));

  const nowTs = Math.floor(Date.now() / 1000);
  // CRITICAL: Stable isTimeBased check - once determined, NEVER change it
  // This prevents ALL flickering by making the determination permanent
  const isTimeBased = useMemo(() => {
    // PRIMARY CHECK: If we have phaseCount > 0, it's definitely time-based
    // This is the most reliable indicator (legacy contracts don't have PHASE_COUNT)
    if (phaseCount !== undefined && phaseCount > 0) {
      isTimeBasedRef.current = true;
      return true;
    }
    
    // SECONDARY CHECK: If we have launchTimestamp > 0 AND phaseDuration > 0, it's time-based
    const hasTimeData = launchTimestamp !== undefined && launchTimestamp > 0 &&
                        phaseDuration !== undefined && phaseDuration > 0;
    
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
    
    // If timeReads exists (contract supports time-based functions), assume it's time-based
    // even if values haven't loaded yet (they will load soon)
    if (timeReads && timeReads.length > 0 && !isTimeReadsLoading && !timeReadsError) {
      // Contract has time-based functions and we're not loading/erroring
      // Wait a moment for values, but if we've seen phaseCount before, trust it
      // For now, if any time-based read succeeded, assume time-based
      const hasAnyTimeData = timeReads.some((read, idx) => 
        idx < 3 && read?.result !== undefined && read?.result !== null && Number(read.result) > 0
      );
      if (hasAnyTimeData) {
        isTimeBasedRef.current = true;
        return true;
      }
    }
    
    // If data is still loading (undefined), return false (will be set when data loads)
    // Only return false if we're certain it's block-based (all values are 0 and not loading)
    if (phaseCount === undefined && launchTimestamp === undefined && phaseDuration === undefined) {
      // Still loading, return false for now
      return false;
    }
    
    // Confirmed block-based (all values are 0 and we've never seen time-based data)
    return false;
  }, [launchTimestamp, phaseCount, phaseDuration, timeReads, isTimeReadsLoading, timeReadsError]);

  // Calculate derived values
  const currentBlockNumber = blockNumber ? Number(blockNumber) : 0;
  const isLaunchCompleteBlocks = launchBlock > 0 && currentBlockNumber >= launchBlock + TOTAL_BLOCKS;
  const isLaunchCompleteTime = isTimeBased && scheduleEndTs > 0 ? nowTs >= scheduleEndTs : false;
  // IMPORTANT: For time-based contracts, ignore block-based completion
  const isLaunchComplete = isTimeBased ? isLaunchCompleteTime : isLaunchCompleteBlocks;

  const totalTokensThisPhase = isTimeBased && phaseAllocationRaw !== null
    ? ethers.formatEther(phaseAllocationRaw)
    : PHASES[calculatedCurrentPhase]?.amount || '0';

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

  const currentPhaseContributions = phaseContributions?.[calculatedCurrentPhase]?.result
    ? BigInt(phaseContributions[calculatedCurrentPhase].result as bigint)
    : BigInt(0);

  // Fetch participant counts for current phase
  const { data: currentPhaseParticipants } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'getPhaseContributors',
    args: [BigInt(calculatedCurrentPhase)],
    query: {
      enabled: !!contractReads && !isContractLoading && calculatedCurrentPhase >= 0,
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
  const totalParticipantsData = useMemo<PieData[]>(() => [], []);

  const isLoading = isContractLoading || isPhaseLoading || isAllContributorsLoading;
  const error = contractError;
  const hasBasicData = !!contractReads && calculatedCurrentPhase >= 0;
  const hasPhaseData = !!phaseContributions;
  const hasGlobalData = !!allPhaseContributors && totalParticipantsData.length > 0;
  // If the contract is time-based (MMM_02), ignore errors from legacy-only reads like launchBlock
  const isValidated = !isLoading && hasBasicData && hasPhaseData && (!error || isTimeBased);

  // Memoize the view model to avoid re-renders from new object identities
  const model = useMemo<OptimizedContractData>(() => ({
    currentPhase: calculatedCurrentPhase,
    calculatedCurrentPhase, // Export calculated phase for consistency
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
  }), [
    calculatedCurrentPhase,
    totalSupply,
    totalContributions,
    currentPhaseContributions,
    totalTokensThisPhase,
    participantsCount,
    totalParticipantsData,
    isLaunchComplete,
    currentBlockNumber,
    launchBlock,
    isTimeBased,
    launchTimestamp,
    phaseCount,
    phaseDuration,
    minContributionEth,
    currentPhaseStartTs,
    currentPhaseEndTs,
    scheduleEndTs,
    nextPhase,
    nextPhaseStartTs,
    nextPhaseEndTs,
    nextPhaseAllocation,
    tokenName,
    tokenSymbol,
    isLoading,
    error,
    isValidated,
    hasBasicData,
    hasPhaseData,
    hasGlobalData,
  ]);

  return model;
}

// Hook for user-specific data
export function useUserContractData(userAddress?: string, chainId?: number) {
  const address = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];

  // Early outs
  const enabledUser = Boolean(address && userAddress);

  // Discover phaseCount (time-based) to know how many phases to read
  const { data: phaseCountRead } = useReadContract({
    address: address as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'PHASE_COUNT',
    query: {
      enabled: enabledUser,
      refetchInterval: 15000,
      staleTime: 8000,
    },
  });

  const phaseCount = phaseCountRead ? Number(phaseCountRead as bigint) : undefined;
  const phaseCountForReads = phaseCount && phaseCount > 0 ? phaseCount : 0;

  // Batch user contributions across all phases
  const contributionCalls = useMemo(() => {
    if (!enabledUser || phaseCountForReads === 0) return [];
    return Array.from({ length: phaseCountForReads }, (_, i) => ({
      address: address as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'contributions' as const,
      args: [BigInt(i), userAddress as `0x${string}`],
    }));
  }, [enabledUser, address, userAddress, phaseCountForReads]);

  const { data: userContribReads, isLoading: isUserContribLoading } = useReadContracts({
    contracts: contributionCalls,
    query: {
      enabled: contributionCalls.length > 0,
      refetchInterval: 12000,
      staleTime: 8000,
      placeholderData: keepPreviousData,
    },
  });

  // Batch hasMinted across all phases
  const hasMintedCalls = useMemo(() => {
    if (!enabledUser || phaseCountForReads === 0) return [];
    return Array.from({ length: phaseCountForReads }, (_, i) => ({
      address: address as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'hasMinted' as const,
      args: [BigInt(i), userAddress as `0x${string}`],
    }));
  }, [enabledUser, address, userAddress, phaseCountForReads]);

  const { data: hasMintedReads, isLoading: isHasMintedLoading } = useReadContracts({
    contracts: hasMintedCalls,
    query: {
      enabled: hasMintedCalls.length > 0,
      refetchInterval: 12000,
      staleTime: 8000,
      placeholderData: keepPreviousData,
    },
  });

  // Derive phases with user contribution and not minted
  const phasesWithContrib = useMemo(() => {
    if (!userContribReads || !hasMintedReads) return [] as number[];
    const out: number[] = [];
    for (let i = 0; i < userContribReads.length; i++) {
      const contrib = (userContribReads[i]?.result as bigint) || 0n;
      const minted = (hasMintedReads[i]?.result as boolean) || false;
      if (contrib > 0n && !minted) out.push(i);
    }
    return out;
  }, [userContribReads, hasMintedReads]);

  // Batch eligible tokens only for contributed, unminted phases
  const eligibleCalls = useMemo(() => {
    if (!enabledUser || phasesWithContrib.length === 0) return [];
    return phasesWithContrib.map((phase) => ({
      address: address as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'getEligibleTokens' as const,
      args: [BigInt(phase), userAddress as `0x${string}`],
    }));
  }, [enabledUser, address, userAddress, phasesWithContrib]);

  const { data: eligibleReads, isLoading: isEligibleLoading } = useReadContracts({
    contracts: eligibleCalls,
    query: {
      enabled: eligibleCalls.length > 0,
      refetchInterval: 12000,
      staleTime: 8000,
      placeholderData: keepPreviousData,
    },
  });

  // Process user model
  const model = useMemo(() => {
    if (!enabledUser || phaseCountForReads === 0) {
      return {
        phaseContributions: [] as string[],
        totalUserContributions: '0',
        mintablePhases: [] as number[],
        mintedPhases: [] as number[],
        phaseEligibleTokens: {} as Record<number, string>,
        isLoading: false,
        error: null as unknown,
      };
    }

    const phaseContributions: string[] = Array(phaseCountForReads).fill('0');
    const mintedPhases: number[] = [];
    let totalUserContrib = 0n;

    for (let i = 0; i < phaseCountForReads; i++) {
      const contrib = (userContribReads?.[i]?.result as bigint) || 0n;
      const minted = (hasMintedReads?.[i]?.result as boolean) || false;
      phaseContributions[i] = ethers.formatEther(contrib);
      if (contrib > 0n) totalUserContrib += contrib;
      if (minted) mintedPhases.push(i);
    }

    const phaseEligibleTokens: Record<number, string> = {};
    const mintablePhases: number[] = [];
    if (eligibleReads && phasesWithContrib.length > 0) {
      phasesWithContrib.forEach((phase, idx) => {
        const val = (eligibleReads[idx]?.result as bigint) || 0n;
        if (val > 0n) {
          phaseEligibleTokens[phase] = ethers.formatEther(val);
          mintablePhases.push(phase);
        }
      });
    }

    return {
      phaseContributions,
      totalUserContributions: ethers.formatEther(totalUserContrib),
      mintablePhases,
      mintedPhases,
      phaseEligibleTokens,
      isLoading: false,
      error: null as unknown,
    };
  }, [enabledUser, phaseCountForReads, userContribReads, hasMintedReads, eligibleReads, phasesWithContrib]);

  const isLoading = isUserContribLoading || isHasMintedLoading || isEligibleLoading;

  return {
    ...model,
    isLoading,
    isValidated: !isLoading,
  };
}
