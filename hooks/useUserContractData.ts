'use client';

import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { keepPreviousData } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES } from '../lib/wagmi';
import { parseAbi } from 'viem';
import { useAccount } from 'wagmi';
import type { OptimizedContractData } from './useOptimizedContractData';

const CONTRACT_ABI = parseAbi([
  'function contributions(uint256 phase, address user) view returns (uint256)',
  'function totalContributions(uint256 phase) view returns (uint256)',
  'function hasMinted(uint256 phase, address user) view returns (bool)',
  'function getEligibleTokens(uint256 phase, address user) view returns (uint256)',
  'function phaseAllocation(uint256 phase) view returns (uint256)',
  'function getPhaseContributors(uint256 phase) view returns (address[])',
  'function totalSupply() view returns (uint256)',
]);

interface PieData {
  name: string;
  value: number;
  address?: string;
  tokens?: number;
  isPending?: boolean;
  phase?: number;
  txHash?: string;
}

export interface UserContractData {
  // User contributions per phase
  phaseContributions: string[];
  // Total user contributions across all phases
  totalUserContributions: string;
  // Mintable phases (phases user can mint)
  mintablePhases: number[];
  // Phases user has already minted
  mintedPhases: number[];
  // Eligible tokens per phase
  phaseEligibleTokens: Record<number, string>;
  // Current phase user contribution
  userCurrentPhaseContributions: string;
  // Estimated reward for current phase
  estimatedReward: string;
  // Historical data
  historicalData: Array<{ phase: string; contributions: number; minted: number }>;
  // Loading state
  isLoading: boolean;
  error: Error | null;
}

/**
 * Optimized hook for fetching user-specific contract data in parallel batches
 * Eliminates waterfall effects by batching all phase calls together
 */
export function useUserContractData(
  chainId: number,
  account: `0x${string}` | undefined,
  optimizedData: OptimizedContractData
): UserContractData {
  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  const phaseCount = optimizedData.phaseCount || 100;
  const currentPhase = optimizedData.currentPhase;
  const isTimeBased = optimizedData.isTimeBased;

  // Batch fetch all user contributions across all phases in parallel
  const contributionCalls = useMemo(() => {
    if (!account || !contractAddress) return [];
    return Array.from({ length: phaseCount }, (_, i) => ({
      address: contractAddress as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'contributions' as const,
      args: [BigInt(i), account],
    }));
  }, [account, contractAddress, phaseCount]);

  const { data: userContributions, isLoading: isContributionsLoading } = useReadContracts({
    contracts: contributionCalls,
    query: {
      enabled: !!account && contributionCalls.length > 0,
      refetchInterval: 45000, // Much less frequent - every 45 seconds
      staleTime: 30000, // Keep data for 30 seconds
      placeholderData: keepPreviousData,
    },
  });

  // Batch fetch all hasMinted statuses in parallel
  const hasMintedCalls = useMemo(() => {
    if (!account || !contractAddress) return [];
    return Array.from({ length: phaseCount }, (_, i) => ({
      address: contractAddress as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'hasMinted' as const,
      args: [BigInt(i), account],
    }));
  }, [account, contractAddress, phaseCount]);

  const { data: hasMintedData, isLoading: isMintedLoading } = useReadContracts({
    contracts: hasMintedCalls,
    query: {
      enabled: !!account && hasMintedCalls.length > 0,
      refetchInterval: 45000,
      staleTime: 30000,
      placeholderData: keepPreviousData,
    },
  });

  // Find phases user contributed to and batch fetch eligible tokens
  const phasesWithContributions = useMemo(() => {
    if (!userContributions || !hasMintedData) return [];
    const phases: number[] = [];
    for (let i = 0; i < userContributions.length; i++) {
      const contrib = userContributions[i]?.result as bigint | undefined;
      const minted = hasMintedData[i]?.result as boolean | undefined;
      if (contrib && contrib > 0n && !minted) {
        phases.push(i);
      }
    }
    return phases;
  }, [userContributions, hasMintedData]);

  // Batch fetch eligible tokens only for phases user contributed to
  const eligibleTokensCalls = useMemo(() => {
    if (!account || !contractAddress || phasesWithContributions.length === 0) return [];
    return phasesWithContributions.map((phase) => ({
      address: contractAddress as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'getEligibleTokens' as const,
      args: [BigInt(phase), account],
    }));
  }, [account, contractAddress, phasesWithContributions]);

  const { data: eligibleTokensData, isLoading: isEligibleLoading } = useReadContracts({
    contracts: eligibleTokensCalls,
    query: {
      enabled: !!account && eligibleTokensCalls.length > 0,
      refetchInterval: 45000,
      staleTime: 30000,
      placeholderData: keepPreviousData,
    },
  });

  // Process all data in a single memoized computation
  const processedData = useMemo(() => {
    if (!userContributions || !hasMintedData) {
      return {
        phaseContributions: Array(phaseCount).fill('0'),
        totalUserContributions: '0',
        mintablePhases: [],
        mintedPhases: [],
        phaseEligibleTokens: {} as Record<number, string>,
        userCurrentPhaseContributions: '0',
        estimatedReward: '0',
        historicalData: [],
      };
    }

    const phaseContributions: string[] = [];
    let totalUserContrib = BigInt(0);
    const mintablePhases: number[] = [];
    const mintedPhases: number[] = [];
    const phaseEligibleTokens: Record<number, string> = {};

    // Process contributions and minted status
    for (let i = 0; i < userContributions.length; i++) {
      const contrib = (userContributions[i]?.result as bigint) || 0n;
      const minted = (hasMintedData[i]?.result as boolean) || false;
      const contribStr = ethers.formatEther(contrib);
      phaseContributions.push(contribStr);
      
      if (contrib > 0n) {
        totalUserContrib += contrib;
        if (minted) {
          mintedPhases.push(i);
        }
      }
    }

    // Process eligible tokens
    if (eligibleTokensData && phasesWithContributions.length > 0) {
      eligibleTokensData.forEach((result, idx) => {
        const phase = phasesWithContributions[idx];
        const tokens = (result?.result as bigint) || 0n;
        if (tokens > 0n) {
          mintablePhases.push(phase);
          phaseEligibleTokens[phase] = ethers.formatEther(tokens);
        }
      });
    }

    // Calculate current phase contribution and estimated reward
    const currentPhaseContrib = phaseContributions[currentPhase] || '0';
    const currentPhaseContribBigInt = ethers.parseEther(currentPhaseContrib || '0');
    
    // Historical data
    const historicalData = phaseContributions.map((contrib, idx) => ({
      phase: idx.toString(),
      contributions: parseFloat(contrib),
      minted: mintedPhases.includes(idx) ? parseFloat(phaseEligibleTokens[idx] || '0') : 0,
    }));

    return {
      phaseContributions,
      totalUserContributions: ethers.formatEther(totalUserContrib),
      mintablePhases,
      mintedPhases,
      phaseEligibleTokens,
      userCurrentPhaseContributions: currentPhaseContrib,
      estimatedReward: '0', // Will be calculated in page component using phase allocation
      historicalData,
    };
  }, [userContributions, hasMintedData, eligibleTokensData, phasesWithContributions, currentPhase, phaseCount]);

  const isLoading = isContributionsLoading || isMintedLoading || isEligibleLoading;

  return {
    ...processedData,
    isLoading,
    error: null,
  };
}

