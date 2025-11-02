// app/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { FaEthereum, FaChartLine, FaCoins, FaUsers, FaChevronDown, FaChevronUp, FaStream, FaLock } from "react-icons/fa";
import Navbar from "@/components/Navbar";
import {
  useAccount,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
  useSendTransaction,
} from "wagmi";
import { sepolia, mainnet, holesky } from "wagmi/chains";
import { parseEther } from "viem";
import { CONTRACT_ADDRESSES, STAKING_ADDRESSES } from "../lib/wagmi";
import { PieChart, Pie, Sector, ResponsiveContainer, Cell, Legend, LineChart, Line, XAxis, Tooltip } from "recharts";
import { motion } from "framer-motion";

// Import new modular components
// import ParticipateCard from "../components/ParticipateCard"; // TODO: Integrate next
import ProjectStats from "../components/ProjectStats";
import PhaseProgress from "../components/PhaseProgress";
import { useOptimizedContractData } from "../hooks/useOptimizedContractData";
// import { useUserContractData } from "../hooks/useOptimizedContractData"; // TODO: Integrate user data

// Import loading and responsive components
import {
  PhaseParticipantsLoading,
  MintTokensLoading,
  ChartLoading,
} from "../components/LoadingStates";
import { ResponsiveGrid } from "../components/ResponsiveLayout";

import Section from "../components/Section";
import StakingInterface from "../components/StakingInterface";
import { ErrorBoundary } from "../components/ErrorBoundary";

// Types

// Flash-on-change helper
function useFlashOnChange<T>(value: T, normalize?: (v: T) => unknown, durationMs = 700) {
  const [flash, setFlash] = React.useState(false);
  const prev = React.useRef<unknown>(normalize ? normalize(value) : value);
  React.useEffect(() => {
    const current = normalize ? normalize(value) : value;
    if (!Object.is(prev.current, current)) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), durationMs);
      prev.current = current;
      return () => clearTimeout(t);
    }
  }, [value, normalize, durationMs]);
  return flash;
}

type ChainId = 1 | 11155111 | 17000;
interface PieData { name: string; value: number; address?: string; tokens?: number; isPending?: boolean; phase?: number; txHash?: string }
interface HistoricalData { phase: string; contributions: number; minted: number }
interface ActiveShapeProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  fill: string;
  payload: PieData;
  percent: number;
  value: number;
}
type EIP1193Provider = { request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown> };


// Constants
const MINIMUM_ETH_FALLBACK = "0.001";
const TOTAL_BLOCKS = 1337;
const TOTAL_SUPPLY = 1000000;
const PRE_MINT_PERCENT = 0.25;

const DYNAMIC_MINT_AMOUNT = TOTAL_SUPPLY * (1 - PRE_MINT_PERCENT);
const MAX_PIE_SLICES = 5;
const BASE_GAS_LIMIT = 100000;

const PHASES = [
  { start: 0, end: 200, amount: (DYNAMIC_MINT_AMOUNT * 0.1).toString() },
  ...Array.from({ length: 11 }, (_, i) => ({
    start: 200 + i * 100,
    end: 300 + i * 100,
    amount: Math.floor((DYNAMIC_MINT_AMOUNT * 0.8) / 11).toString(),
  })),
  { start: 1300, end: 1337, amount: (DYNAMIC_MINT_AMOUNT * 0.1).toString() },
];

// ABI for MMM_Unified (Token + Staking)
const ABI = [
  // ERC20 essentials
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  // Phase functions
  "function launchBlock() view returns (uint256)",
  "function LAUNCH_TIMESTAMP() view returns (uint256)",
  "function PHASE_COUNT() view returns (uint256)",
  "function PHASE_DURATION() view returns (uint256)",
  "function PHASE_0_DURATION() view returns (uint256)",
  "function getCurrentPhase() view returns (uint256)",
  "function phaseStartTs(uint256 phase) view returns (uint256)",
  "function phaseEndTs(uint256 phase) view returns (uint256)",
  "function phaseAllocation(uint256 phase) view returns (uint256)",
  "function contributions(uint256 phase, address user) view returns (uint256)",
  "function totalContributions(uint256 phase) view returns (uint256)",
  "function hasMinted(uint256 phase, address user) view returns (bool)",
  "function getPhaseContributors(uint256 phase) view returns (address[])",
  "function getEligibleTokens(uint256 phase, address user) view returns (uint256)",
  "function mintUserShare(uint256 phase)",
  // Admin
  "function withdraw()",
  // Events
  "event ContributionReceived(address indexed contributor, uint256 indexed phase, uint256 amount)",
  "event TokensMinted(address indexed user, uint256 indexed phase, uint256 amount)"
] as const;

// Staking ABI for MMM_Unified (staking is integrated in the same contract)
const STAKING_ABI = [
  // Staking functions
  "function stakeStart(uint256 newStakedDrops, uint256 newStakedDays)",
  "function stakeEnd(uint256 stakeIndex, uint40 stakeIdParam)",
  "function stakeCount(address stakerAddr) view returns (uint256)",
  "function stakeInfo(address stakerAddr, uint256 stakeIndex) view returns (tuple(uint40 stakeId, uint72 stakedDrops, uint72 stakeShares, uint16 lockedDay, uint16 stakedDays, uint16 unlockedDay, bool isAutoStake))",
  "function totalStaked() view returns (uint256)",
  "function totalStakeShares() view returns (uint256)",
  "function allocatedSupply() view returns (uint256)",
  // Staking configuration
  "function MIN_STAKE_DAYS() view returns (uint256)",
  "function MAX_STAKE_DAYS() view returns (uint256)",
  "function GRACE_PERIOD_SEC() view returns (uint256)",
  "function EARLY_PENALTY_MAX_BPS() view returns (uint256)",
  "function LATE_PENALTY_RATE_PER_DAY_BPS() view returns (uint256)",
  "function LATE_PENALTY_MAX_BPS() view returns (uint256)",
  "function PENALTY_RECEIVER() view returns (address)",
  "function STAKER_REWARD_BPS() view returns (uint256)",
  "function PENALTY_RECEIVER_BPS() view returns (uint256)",
  // Daily data
  "function dailyDataUpdate(uint256 beforeDay)",
  "function dailyData(uint256) view returns (uint72 dayPayoutTotal, uint72 dayStakeSharesTotal)",
  // Events
  "event StakeStart(uint40 indexed stakeId, uint256 stakedDrops, uint256 stakeShares, uint256 stakedDays, bool isAutoStake)",
  "event StakeEnd(uint40 indexed stakeId, uint256 stakedDrops, uint256 stakeShares, uint256 payout, uint256 penalty, uint256 servedDays)"
] as const;

type UserStakeView = {
  id: number;
  amountWei: bigint;
  amount: string;
  startTs: number;
  lockDays: number;
  closed: boolean;
  closeTs: number;
  maturityTs: number;
  graceEndTs: number;
  pendingRewardsWei: bigint;
  pendingRewards: string;
  status: "ACTIVE" | "IN_GRACE" | "LATE" | "CLOSED";
};

// Utility Functions
const abbreviateNumber = (num: number): string => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
};

const ToggleDecimals = ({ value, decimals = 4 }: { value: string; decimals?: number }) => {
  const [showFull, setShowFull] = useState(false);
  const numericValue = Number(value ?? 0);
  const compact = Number.isFinite(numericValue) ? numericValue.toFixed(decimals) : value;
  const displayValue = showFull ? value : compact;

  return (
    <span
      onClick={() => setShowFull(!showFull)}
      className="cursor-pointer text-indigo-400 hover:text-indigo-300 transition-colors font-semibold text-sm"
    >
      {displayValue}
    </span>
  );
};


// Explorer helpers
const getExplorerBase = (chainId: ChainId): string => {
  switch (chainId) {
    case 1: return "https://etherscan.io";
    case 11155111: return "https://sepolia.etherscan.io";
    case 17000: return "https://holesky.etherscan.io";
    default: return "https://etherscan.io";
  }
};


const getPendingContributions = (address: string): PieData[] => {
  if (typeof window === "undefined") return []; // Prevent SSR access
  const data = localStorage.getItem(`pendingContributions_${address}`);
  return data ? JSON.parse(data) : [];
};

const setPendingContributions = (address: string, contributions: PieData[]) => {
  if (typeof window === "undefined") return; // Prevent SSR access
  localStorage.setItem(`pendingContributions_${address}`, JSON.stringify(contributions));
};

const renderActiveShape = (props: unknown): JSX.Element => {
  const {
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    percent,
    value,
  } = props as ActiveShapeProps;
  const RADIAN = Math.PI / 180;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 15) * cos;
  const my = cy + (outerRadius + 15) * sin;
  const ex = cx + (outerRadius + 20) * cos;
  const ey = cy + (outerRadius + 20) * sin;
  const textAnchor = cos >= 0 ? "start" : "end";

  const copyAddress = () =>
    payload.address && navigator.clipboard.writeText(payload.address).then(() => alert(`Copied: ${payload.address}`));
  const displayValue = value < 1 ? value.toFixed(5) : value.toFixed(2);
  const displayTokens = payload.isPending ? "Pending" : payload.tokens ? abbreviateNumber(payload.tokens) : "0";
  const displayEth = payload.value ? abbreviateNumber(payload.value) : "0";

  return (
    <g>
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill="#fff" className="font-semibold text-sm">
        {payload.name}
      </text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 10}
        fill={fill}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text
        x={ex + (cos >= 0 ? 1 : -1) * 12}
        y={ey}
        textAnchor={textAnchor}
        fill="#fff"
        className="text-sm cursor-pointer hover:underline max-w-[150px] truncate"
        onClick={copyAddress}
      >
        {payload.address ? `${payload.address.slice(0, 6)}...${payload.address.slice(-4)}` : `${displayValue} ${payload.name.includes("Realized") || payload.name.includes("Unrealized") ? "MMM" : "ETH"}`}
      </text>
      {payload.address && (
        <>
          <text
            x={ex + (cos >= 0 ? 1 : -1) * 12}
            y={ey}
            dy={14}
            textAnchor={textAnchor}
            fill="#fff"
            className="text-xs"
          >
            {displayTokens} MMM
          </text>
          <text
            x={ex + (cos >= 0 ? 1 : -1) * 12}
            y={ey}
            dy={28}
            textAnchor={textAnchor}
            fill="#fff"
            className="text-xs"
          >
            {displayEth} ETH
          </text>
          <text
            x={ex + (cos >= 0 ? 1 : -1) * 12}
            y={ey}
            dy={42}
            textAnchor={textAnchor}
            fill="#999"
            className="text-xs"
          >
            {`(${Math.round(percent * 100)}%)`}
          </text>
        </>
      )}
      {!payload.address && (
        <text
          x={ex + (cos >= 0 ? 1 : -1) * 12}
          y={ey}
          dy={14}
          textAnchor={textAnchor}
          fill="#999"
          className="text-xs"
        >
          {`(${Math.round(percent * 100)}%)`}
        </text>
      )}
    </g>
  );
};

const aggregatePieData = (data: PieData[], maxSlices: number): PieData[] => {
  if (data.length <= maxSlices) return data;
  const sortedData = [...data].sort((a, b) => b.value - a.value);
  const topData = sortedData.slice(0, maxSlices - 1);
  const others = sortedData.slice(maxSlices - 1).reduce(
    (acc, curr) => ({
      name: "Others",
      value: acc.value + curr.value,
      tokens: (acc.tokens || 0) + (curr.tokens || 0),
      isPending: acc.isPending || curr.isPending,
    }),
    { name: "Others", value: 0, tokens: 0, isPending: false } as PieData
  );
  return [...topData, others];
};

// Components
const PieChartCard = ({
  title,
  icon,
  data,
  totalTokens,
  currentPhase,
  colors = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#d1d5db"],
  extraText,
}: {
  title: string;
  icon: React.ReactNode;
  data: PieData[];
  totalTokens?: string;
  currentPhase?: number;
  colors?: string[];
  extraText?: string;
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const aggregatedData = useMemo(() => aggregatePieData(data, MAX_PIE_SLICES), [data]);

  return (
    <motion.div
      className="glass p-6 ring-white/10 hover:shadow-2xl transition-shadow duration-300"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-xl font-semibold mb-4 flex items-center" style={{ color: 'var(--primary)' }}>
        {icon}
        <span className="ml-2">{title} {currentPhase !== undefined ? `Phase ${currentPhase}` : ""}</span>
      </h3>
      {extraText && <p className="text-gray-300 text-sm mb-4">{extraText}</p>}
      {data.length === 0 && currentPhase !== undefined ? (
        <div className="text-center text-gray-400 text-sm h-[250px] flex flex-col justify-center">
          <p className="text-indigo-300 font-medium">No participants in this phase.</p>
          <p className="mt-2">Phase {currentPhase} has no contributions yet.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              data={aggregatedData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={70}
              dataKey="value"
              onMouseEnter={(_, index) => setActiveIndex(index)}
            >
              {aggregatedData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
              {totalTokens && (
                <text x="50%" y="50%" textAnchor="middle" fill="#fff" className="text-sm font-bold">
                  {abbreviateNumber(parseFloat(totalTokens))} MMM
                </text>
              )}
            </Pie>
            <Legend wrapperStyle={{ color: "#fff", fontSize: "12px" }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  );
};

const MintedTokensChart = ({ data }: { data: HistoricalData[] }) => {
  const formattedData = useMemo(() => data.map(item => ({
    phase: item.phase === "0" ? "Phase 0" : `Phase ${item.phase}`,
    minted: item.minted,
  })), [data]);
  const [chartData, setChartData] = useState(formattedData);
  useEffect(() => {
    const t = setTimeout(() => setChartData(formattedData), 250);
    return () => clearTimeout(t);
  }, [formattedData]);

  return (
    <motion.div
      className="glass p-6 ring-white/10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-xl font-semibold text-white mb-4">Your Minted Tokens</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <XAxis dataKey="phase" tick={{ fontSize: 12, fill: "#fff" }} />
          <Line type="monotone" dataKey="minted" stroke="#10b981" strokeWidth={2} dot={{ fill: "#6ee7b7" }} name="Minted (MMM)" />
          <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", color: "#fff" }} />
          <Legend wrapperStyle={{ color: "#fff", fontSize: "12px" }} />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

const ContributionsChart = ({ data }: { data: HistoricalData[] }) => {
  const formattedData = useMemo(() => data.map(item => ({
    phase: item.phase === "0" ? "Phase 0" : `Phase ${item.phase}`,
    contributions: item.contributions,
  })), [data]);
  const [chartData, setChartData] = useState(formattedData);
  useEffect(() => {
    const t = setTimeout(() => setChartData(formattedData), 250);
    return () => clearTimeout(t);
  }, [formattedData]);

  return (
    <motion.div
      className="glass p-6 ring-white/10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-xl font-semibold text-white mb-4">Your Contributions</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <XAxis dataKey="phase" tick={{ fontSize: 12, fill: "#fff" }} />
          <Line type="monotone" dataKey="contributions" stroke="#4f46e5" strokeWidth={2} dot={{ fill: "#818cf8" }} name="Contributions (ETH)" />
          <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", color: "#fff" }} />
          <Legend wrapperStyle={{ color: "#fff", fontSize: "12px" }} />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

const HistoricalPhaseCard = ({
  phase,
  progress,
  blocksPassed,
  totalBlocks,
  totalTokens,
  participants,
  isTimeBased,
}: {
  phase: number;
  progress: number;
  blocksPassed: number;
  totalBlocks: number;
  totalTokens: string;
  participants: PieData[];
  isTimeBased?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const phasePartFlash = useFlashOnChange(participants.length);

  return (
    <motion.div
      className="glass p-6 ring-white/10"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h2 className="text-2xl font-bold mb-4 flex items-center justify-between" style={{ color: 'var(--primary)' }}>
        <span>Phase {phase} (Completed)</span>
        <button onClick={() => setIsExpanded(!isExpanded)} className="text-gray-300 hover:text-white">
          {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
        </button>
      </h2>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-300">
            Progress: {Math.round(progress)}% ({blocksPassed} / {totalBlocks} {isTimeBased ? 'days' : 'blocks'})
          </p>
          <div className="bg-gray-700 h-3 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(to right, var(--primary), var(--accent))` }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1 }}
              />
          </div>
        </div>
        <div className="flex flex-col gap-3 items-center justify-center">
          <div className="rounded border border-white/10 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-3 w-full">
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <FaCoins className="text-indigo-300" />
              <span>Total Tokens</span>
            </div>
            <div className="mt-1.5 font-mono text-white"><ToggleDecimals value={totalTokens} /> MMM</div>
          </div>
          <div className="rounded border border-white/10 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 p-3 w-full">
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <FaUsers className="text-blue-300" />
              <span>Participants</span>
            </div>
            <div className={`mt-1.5 font-mono text-white ${phasePartFlash ? 'flash-text' : ''}`}>{participants.length}</div>
          </div>
          <div className="rounded border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-indigo-500/10 p-3 w-full">
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <FaStream className="text-fuchsia-300" />
              <span>{isTimeBased ? 'Days' : 'Blocks'}</span>
            </div>
            <div className="mt-1.5 font-mono text-white">{blocksPassed} / {totalBlocks}</div>
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold text-white mb-2">Participants</h3>
          {participants.length > 0 ? (
            <ul className="text-sm text-gray-300 space-y-2 max-h-40 overflow-y-auto">
              {participants.map((p, index) => (
                <li key={index} className="truncate">
                  {p.address}: {abbreviateNumber(p.tokens || 0)} MMM ({p.value.toFixed(4)} ETH)
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400">No participants in this phase.</p>
          )}
          <PieChartCard
            title=""
            icon={<></>}
            data={participants}
            totalTokens={totalTokens}
            currentPhase={phase}
          />
        </div>
      )}
    </motion.div>
  );
};

// Main Component
function Dashboard() {

  const [ethAmount, setEthAmount] = useState("0.001");
  const [isSending, setIsSending] = useState(false);
  const [isMinting, setIsMinting] = useState<Map<number, boolean>>(new Map());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [hasInitialLoad, setHasInitialLoad] = useState(false);
  const [activeNetwork, setActiveNetwork] = useState<ChainId>(sepolia.id);
  const [publicProvider, setPublicProvider] = useState<ethers.JsonRpcProvider | null>(null);
  const { address: account, isConnected } = useAccount();

  // Use optimized contract data fetching with Wagmi
  const optimizedData = useOptimizedContractData(activeNetwork);
  // const userData = useUserContractData(account, activeNetwork); // TODO: Integrate user data

  // Enhanced validation that prioritizes optimized data
  // Use a ref to prevent flickering during refetches - be more aggressive about persistence
  const hasOptimizedDataRef = useRef<boolean>(false);
  const hasOptimizedData = useMemo(() => {
    const result = optimizedData.isValidated && !optimizedData.isLoading;
    // If we have valid data, store it permanently
    if (result) {
      hasOptimizedDataRef.current = true;
      return true;
    }
    // If we're loading OR if data temporarily becomes invalid during refetch,
    // keep the previous value to prevent flickering
    // Only reset if we've never had valid data and we're sure it's invalid
    if (optimizedData.isLoading) {
      return hasOptimizedDataRef.current;
    }
    // If we previously had valid data, keep it during temporary refetch failures
    if (hasOptimizedDataRef.current && optimizedData.hasBasicData) {
      return true;
    }
    // Only reset if we're certain it's invalid and never was valid
    if (!optimizedData.hasBasicData && !hasOptimizedDataRef.current) {
      return false;
    }
    // Default: keep previous value
    return hasOptimizedDataRef.current;
  }, [optimizedData.isValidated, optimizedData.isLoading, optimizedData.hasBasicData]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);


  useEffect(() => {

    if (typeof window === 'undefined') return;
    // Prefer the wallet's provider when connected to guarantee network parity
    try {
      const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
      if (eth && isConnected) {
        const bp = new ethers.BrowserProvider(eth);
        setPublicProvider(bp as unknown as ethers.JsonRpcProvider);
        return;
      }
    } catch {}

    let rpcUrl: string;
    switch (activeNetwork) {
      case sepolia.id:
        rpcUrl = process.env.INFURA ? `https://sepolia.infura.io/v3/${process.env.INFURA}` : 'https://rpc.sepolia.org';
        break;
      case holesky.id:
        rpcUrl = process.env.INFURAHOLESKY ? `https://holesky.infura.io/v3/${process.env.INFURAHOLESKY}` : 'https://rpc.holesky.ethpandaops.io';
        break;
      case mainnet.id:
        rpcUrl = process.env.INFURAMAIN ? `https://mainnet.infura.io/v3/${process.env.INFURAMAIN}` : 'https://ethereum.publicnode.com';
        break;
      default:
        setErrorMessage('Unsupported network selected.');
        return;
    }
    setPublicProvider(new ethers.JsonRpcProvider(rpcUrl));
  }, [activeNetwork, isConnected]);
  const [contractData, setContractData] = useState({
    currentPhase: 0,
    totalMinted: "0",
    blockNumber: 0,
    launchBlock: 0,
    userContributions: "0",
    totalContributions: "0",
    mintablePhases: [] as number[],
    mintedPhases: [] as number[],
    phaseEligibleTokens: {} as Record<number, string>, // Store eligible tokens from contract for each phase
    estimatedReward: "0",
    phaseContributions: Array(PHASES.length).fill("0"),
    participantsCount: 0,
    totalParticipants: 0,
    currentPhaseContributions: "0",
    userCurrentPhaseContributions: "0",
    totalTokensThisPhase: PHASES[0]?.amount || '0',
    phaseParticipants: [] as PieData[],
    totalParticipantsData: [] as PieData[],
    pendingPhaseParticipants: [] as PieData[],
    historicalData: [] as HistoricalData[],
    historicalPhaseTokens: [] as string[],
    historicalPhaseParticipants: [] as PieData[][],
    historicalPhaseProgress: [] as { phase: number; progress: number; blocksPassed: number; totalBlocks: number }[],
    isLaunchComplete: false,
    codeSize: 0,
    providerChainId: 0,
    tokenName: "",
    tokenSymbol: "",
  });
  const [gracePeriodSec, setGracePeriodSec] = useState<number>(30 * 86400);
  const [userStakes, setUserStakes] = useState<UserStakeView[]>([]);
  const [isFetchingStakes, setIsFetchingStakes] = useState<boolean>(false);
  const [totalStakedStr, setTotalStakedStr] = useState<string>("0");
  const [stakingParams, setStakingParams] = useState<{ stakerRewardBps?: number; holderRewardBps?: number; earlyPenaltyMaxBps?: number; latePenaltyRatePerDayBps?: number; latePenaltyMaxBps?: number; minLockDays?: number; maxLockDays?: number; penaltyReceiver?: string; penaltyReceiverBps?: number; }>({});

  const [showStakeRefreshing, setShowStakeRefreshing] = useState<boolean>(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (isFetchingStakes) {
      t = setTimeout(() => setShowStakeRefreshing(true), 400);
    } else {
      setShowStakeRefreshing(false);
    }
    return () => { if (t) clearTimeout(t); };
  }, [isFetchingStakes]);

  const totalPendingRewardsWei = useMemo(() => {
    try {
      return userStakes.reduce((acc, s) => acc + (s.pendingRewardsWei ?? 0n), 0n as bigint);
    } catch {
      return 0n as bigint;
    }
  }, [userStakes]);
  const totalPendingRewards = useMemo(() => ethers.formatUnits(totalPendingRewardsWei, 18), [totalPendingRewardsWei]);

  // Throttling & flicker controls for stakes refresh
  const MIN_STAKES_REFRESH_MS = 12000;
  const suppressStakeSpinnerRef = useRef(false);
  const stakesFetchInFlightRef = useRef(false);
  const lastStakesFetchMsRef = useRef(0);

  // Additional user stake stats
  const openUserStakedWei = useMemo(
    () => userStakes.filter(s => !s.closed).reduce((acc, s) => acc + (s.amountWei ?? 0n), 0n as bigint),
    [userStakes]
  );
  const openUserStaked = useMemo(() => ethers.formatUnits(openUserStakedWei, 18), [openUserStakedWei]);

  const avgLockDays = useMemo(() => {
    const arr = userStakes.filter(s => !s.closed);
    if (arr.length === 0) return 0;
    const sum = arr.reduce((acc, s) => acc + s.lockDays, 0);
    return Math.round(sum / arr.length);
  }, [userStakes]);


  const statusCounts = useMemo(() => {
    const c = { ACTIVE: 0, IN_GRACE: 0, LATE: 0, CLOSED: 0 } as Record<UserStakeView["status"], number> & { [k: string]: number };
    for (const s of userStakes) c[s.status] = (c[s.status] || 0) + 1;
    return c as { ACTIVE: number; IN_GRACE: number; LATE: number; CLOSED: number };
  }, [userStakes]);

  const nextMaturityTs = useMemo(() => {
    const active = userStakes.filter(s => s.status === 'ACTIVE');
    if (active.length === 0) return null as number | null;
    return Math.min(...active.map(s => s.maturityTs));
  }, [userStakes]);

  // Relative time helpers for stake dates
  const formatRelative = useCallback((ts: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = ts - now; // >0 future, <0 past
    const abs = Math.abs(diff);
    if (abs < 45) return 'now';
    const days = Math.floor(abs / 86400);
    if (days > 0) return diff >= 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'} ago`;
    const hours = Math.floor((abs % 86400) / 3600);
    if (hours > 0) return diff >= 0 ? `in ${hours} hour${hours === 1 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const mins = Math.floor((abs % 3600) / 60);
    return diff >= 0 ? `in ${mins} min` : `${mins} min ago`;
  }, []);

  const relativeLabel = useCallback((base: 'starts' | 'maturity' | 'grace ends', ts: number) => {
    const rel = formatRelative(ts);
    if (base === 'starts') {
      if (rel === 'now') return 'starts now';
      if (rel.startsWith('in ')) return `starts ${rel}`;
      return `started ${rel}`;
    }
    if (rel === 'now') return `${base} now`;
    return `${base} ${rel}`;


  }, [formatRelative]);



  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [hasInitialUserFetch, setHasInitialUserFetch] = useState(false);

  const [hasPublicLight, setHasPublicLight] = useState(false);
  const [hasPublicDetails, setHasPublicDetails] = useState(false);
  const [hasValidatedData, setHasValidatedData] = useState(false);
  const [showMoreTop, setShowMoreTop] = useState(false);

  const isFetchingPublicRef = useRef(false);
  const isFetchingUserRef = useRef(false);

  const [stakingContract, setStakingContract] = useState<ethers.Contract | null>(null);






  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const { data: walletClient } = useWalletClient();
  const { sendTransaction, isSuccess, error: rawTxError, data: txData } = useSendTransaction();
  const txError = rawTxError as Error | null;


  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);

  // MMM wallet balance (ERC20)
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [tokenBalanceWei, setTokenBalanceWei] = useState<bigint>(0n);
  const tokenBalance = useMemo(() => {
    try { return ethers.formatUnits(tokenBalanceWei || 0n, tokenDecimals); } catch { return "0"; }
  }, [tokenBalanceWei, tokenDecimals]);

  const fetchTokenBalance = useCallback(async () => {
    if (!account || !contract) { setTokenBalanceWei(0n); return; }
    try {
      try {
        const d: number | bigint = await contract.decimals();


        const dn = Number(d);
        if (dn && dn !== tokenDecimals) setTokenDecimals(dn);
      } catch {}
      const bal: bigint = await contract.balanceOf(account);
      setTokenBalanceWei(bal);
    } catch (e) {
      console.warn("fetchTokenBalance failed", e);
    }
  }, [account, contract, tokenDecimals]);

  useEffect(() => {
    if (account && contract) fetchTokenBalance();
  }, [account, contract, fetchTokenBalance]);


  // Flash triggers for frequently changing values
  const estRewardFlash = useFlashOnChange(contractData.estimatedReward, v => Number(v as unknown as string || 0).toFixed(4));
  const shareNow = (() => { const total = parseFloat(contractData.totalTokensThisPhase) || 0; const est = parseFloat(contractData.estimatedReward) || 0; return total > 0 ? ((est / total) * 100).toFixed(1) : ""; })();
  const shareFlash = useFlashOnChange(shareNow);
  const participantsFlash = useFlashOnChange(contractData.participantsCount);

  const userContribFlash = useFlashOnChange(contractData.userCurrentPhaseContributions, v => Number(v as unknown as string || 0).toFixed(4));
  const totalParticipantsFlash = useFlashOnChange(contractData.totalParticipants);

  // Stable data logic - use optimized data when available, fallback to old data
  // Add debouncing to prevent rapid flickering
  const hasStableData = useMemo(() => {
    return hasOptimizedData && optimizedData.hasBasicData && optimizedData.currentPhase >= 0;
  }, [hasOptimizedData, optimizedData.hasBasicData, optimizedData.currentPhase]);

  // CRITICAL: When optimized data is available, completely override contractData to prevent mixed states
  const stableContractData = hasStableData ? {
    currentPhase: optimizedData.currentPhase,
    totalMinted: optimizedData.totalMinted,
    totalContributions: optimizedData.totalContributions,
    participantsCount: optimizedData.participantsCount || contractData.participantsCount,
    totalParticipantsData: (optimizedData.totalParticipantsData && optimizedData.totalParticipantsData.length > 0)
      ? optimizedData.totalParticipantsData
      : contractData.totalParticipantsData,
    totalParticipants: ((optimizedData.totalParticipantsData && optimizedData.totalParticipantsData.length > 0)
      ? optimizedData.totalParticipantsData.length
      : contractData.totalParticipantsData.length),
    totalTokensThisPhase: optimizedData.totalTokensThisPhase,
    currentPhaseContributions: optimizedData.currentPhaseContributions,
    isLaunchComplete: optimizedData.isLaunchComplete,
    blockNumber: optimizedData.blockNumber,
    launchBlock: optimizedData.launchBlock,

    tokenName: optimizedData.tokenName,
    tokenSymbol: optimizedData.tokenSymbol,
    // Time-based schedule (MMM_02)
    isTimeBased: optimizedData.isTimeBased,
    launchTimestamp: optimizedData.launchTimestamp,
    phaseCount: optimizedData.phaseCount,
    phaseDuration: optimizedData.phaseDuration,
    currentPhaseStartTs: optimizedData.currentPhaseStartTs,
    currentPhaseEndTs: optimizedData.currentPhaseEndTs,
    scheduleEndTs: optimizedData.scheduleEndTs,
    // Preserve user-specific data from contractData
    userCurrentPhaseContributions: contractData.userCurrentPhaseContributions,
    estimatedReward: contractData.estimatedReward,
    pendingPhaseParticipants: contractData.pendingPhaseParticipants,
    phaseContributions: contractData.phaseContributions,
    phaseParticipants: contractData.phaseParticipants,
    historicalData: contractData.historicalData,
    historicalPhaseParticipants: contractData.historicalPhaseParticipants,
    historicalPhaseProgress: contractData.historicalPhaseProgress,
    codeSize: contractData.codeSize,
    providerChainId: contractData.providerChainId,
  } : contractData;


  // Holders leaderboard (beta)
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [holders, setHolders] = useState<Array<{ address: string; balance: bigint }>>([]);
  const [holdersTotalSupply, setHoldersTotalSupply] = useState<bigint>(0n);

  const shortAddr = useCallback((a: string) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ''), []);

  const fetchHolders = useCallback(async () => {
    if (!publicProvider) return;
    try {
      setHoldersLoading(true);
      const fromBlock = Math.max(0, (stableContractData.launchBlock || 0) - 1);
      const toBlock = await publicProvider.getBlockNumber();
      const topic0 = ethers.id('Transfer(address,address,uint256)');
      const logs = await publicProvider.getLogs({
        address: CONTRACT_ADDRESSES[activeNetwork],
        fromBlock,
        toBlock,
        topics: [topic0]
      });
      const iface = new ethers.Interface([
        'event Transfer(address indexed from, address indexed to, uint256 value)'
      ]);
      const balances = new Map<string, bigint>();
      const ZERO = '0x0000000000000000000000000000000000000000';
      for (const log of logs) {
        try {
          const parsed = iface.parseLog({ topics: log.topics, data: log.data });
          if (!parsed) continue;
          const args = parsed.args as unknown as { from: string; to: string; value: bigint };
          const from = args.from;
          const to = args.to;
          const value = args.value;
          if (from && from !== ZERO) balances.set(from, (balances.get(from) || 0n) - value);
          if (to && to !== ZERO) balances.set(to, (balances.get(to) || 0n) + value);
        } catch {}
      }
      const entries = Array.from(balances.entries())
        .map(([address, balance]) => ({ address, balance }))
        .filter((e) => e.balance > 0n)
        .sort((a, b) => (a.balance < b.balance ? 1 : -1));
      setHolders(entries);
      try {
        const publicC = new ethers.Contract(CONTRACT_ADDRESSES[activeNetwork], ABI, publicProvider);
        const ts: bigint = await publicC.totalSupply();
        setHoldersTotalSupply(ts);
      } catch {}
    } finally {
      setHoldersLoading(false);
    }
  }, [publicProvider, activeNetwork, stableContractData.launchBlock]);

  // Use a stable reference to prevent flickering: use optimizedData.isTimeBased directly
  // The hook now handles persistence internally
  const isTimeBased = useMemo(() => {
    // Trust the hook's stable value
    return !!optimizedData.isTimeBased;
  }, [optimizedData.isTimeBased]);
  const minContributionEth = optimizedData.minContributionEth || MINIMUM_ETH_FALLBACK;

  const nowTs = Math.floor(Date.now() / 1000);
  let blocksSinceLaunch = 0; // seconds if time-based, blocks if block-based
  const userParticipated = parseFloat(contractData.userCurrentPhaseContributions) > 0 || contractData.pendingPhaseParticipants.length > 0;
  let phaseStartBlock = 0;
  let phaseEndBlock = 0;
  let blocksInPhase = 0;
  let blocksPassedInPhase = 0;
  let launchPhaseEndProgress = 0;

  if (isTimeBased && optimizedData.launchTimestamp) {
    const launchTs = optimizedData.launchTimestamp || 0;
    const scheduleEndTs = optimizedData.scheduleEndTs || (launchTs && optimizedData.phaseCount && optimizedData.phaseDuration
      ? launchTs + optimizedData.phaseCount * optimizedData.phaseDuration
      : 0);
    if (launchTs > 0 && scheduleEndTs > launchTs) {
      const elapsed = Math.max(0, nowTs - launchTs);
      blocksSinceLaunch = elapsed;
    }
    const startTs = optimizedData.currentPhaseStartTs || 0;
    const endTs = optimizedData.currentPhaseEndTs || 0;
    // Ensure we have valid phase times and endTs > startTs
    if (startTs > 0 && endTs > startTs && endTs > nowTs) {
      const elapsedIn = Math.max(0, Math.min(nowTs - startTs, endTs - startTs));
      const totalSecsInPhase = endTs - startTs;
      if (totalSecsInPhase > 0) {
        launchPhaseEndProgress = Math.min((elapsedIn / totalSecsInPhase) * 100, 100);
      } else {
        launchPhaseEndProgress = 0;
      }
      blocksInPhase = Math.max(1, Math.round(totalSecsInPhase / 86400)); // Convert to days for display
      blocksPassedInPhase = Math.floor(elapsedIn / 86400); // Convert to days for display
    } else if (startTs > 0 && endTs > startTs && nowTs >= endTs) {
      // Phase has ended
      launchPhaseEndProgress = 100;
      const totalSecsInPhase = endTs - startTs;
      blocksInPhase = Math.max(1, Math.round(totalSecsInPhase / 86400));
      blocksPassedInPhase = Math.floor(totalSecsInPhase / 86400);
    } else {
      // Phase data not loaded yet - set defaults
      launchPhaseEndProgress = 0;
      blocksInPhase = 0;
      blocksPassedInPhase = 0;
    }
  } else {
    blocksSinceLaunch =
      stableContractData.launchBlock > 0
        ? Math.min(Math.max(0, stableContractData.blockNumber - stableContractData.launchBlock), TOTAL_BLOCKS)
        : 0;

    const idx = stableContractData.currentPhase;
    if (idx >= 0 && idx < PHASES.length) {
      phaseStartBlock = stableContractData.launchBlock + PHASES[idx].start;
      phaseEndBlock = stableContractData.launchBlock + PHASES[idx].end;
      blocksInPhase = phaseEndBlock - phaseStartBlock;
      blocksPassedInPhase = Math.max(0, Math.min(stableContractData.blockNumber - phaseStartBlock, blocksInPhase));
      launchPhaseEndProgress = blocksInPhase > 0 ? (blocksPassedInPhase / blocksInPhase) * 100 : 0;
    }
  }

  // Calculate total progress based on PHASE COUNT, not time
  // For Phase X out of Y, progress should be approximately X/Y * 100%
  const currentPhaseNum = stableContractData.currentPhase || 0;
  const totalPhases = optimizedData.phaseCount || PHASES.length;
  const totalProgressBasedOnPhases = totalPhases > 0 ? Math.min((currentPhaseNum / totalPhases) * 100, 100) : 0;
  
  // Derived flashes after phase block math is available
  // For time-based: calculate seconds left, convert to days for display
  const blocksLeftNum = isTimeBased && optimizedData.currentPhaseEndTs && optimizedData.currentPhaseEndTs > 0
    ? Math.max(0, Math.floor((optimizedData.currentPhaseEndTs - nowTs) / 86400)) // Days left
    : Math.max(0, blocksInPhase - blocksPassedInPhase);
  const blocksLeftFlash = useFlashOnChange(blocksLeftNum);
  // For display: show relative time for time-based, or number for block-based
  const blocksLeftDisplay = isTimeBased && optimizedData.currentPhaseEndTs && optimizedData.currentPhaseEndTs > 0
    ? formatRelative(optimizedData.currentPhaseEndTs)
    : (isTimeBased && optimizedData.currentPhaseEndTs === 0 && optimizedData.launchTimestamp 
      ? 'Loading...' // Show loading text when phase end time isn't fetched yet
      : blocksLeftNum.toString());
  const containerFlash = estRewardFlash || shareFlash || blocksLeftFlash;
  const totalProgFlash = useFlashOnChange(Math.round(totalProgressBasedOnPhases));
  const phaseProgFlash = useFlashOnChange(Math.round(launchPhaseEndProgress));

  const uniqueContributors = useMemo(() => {
    const arr = stableContractData.totalParticipantsData || [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const d of arr) {
      const addr = (d.address || d.name || "").toString();
      if (addr && !seen.has(addr)) { seen.add(addr); out.push(addr); }
    }
    return out;
  }, [stableContractData.totalParticipantsData]);

  const pieData = useMemo(
    () =>
      contractData.phaseContributions
        .map((contrib, i) => {
          const userContrib = parseFloat(contrib);
          const totalContrib = contractData.historicalData[i]?.contributions || 0;

          const phaseTokens = parseFloat(PHASES[i]?.amount || contractData.historicalPhaseTokens[i] || '0');

          const tokens =
            totalContrib > 0 && contractData.mintedPhases.includes(i)
              ? (userContrib / totalContrib) * phaseTokens
              : i === contractData.currentPhase && !stableContractData.isLaunchComplete
              ? parseFloat(contractData.estimatedReward)
              : 0;
          return { name: `Phase ${i}`, value: userContrib, tokens };
        })
        .filter((item) => item.value > 0),
    [contractData.phaseContributions, contractData.historicalData, contractData.mintedPhases, contractData.currentPhase, contractData.estimatedReward, contractData.historicalPhaseTokens, stableContractData.isLaunchComplete]
  );

  const totalUserContributions = useMemo(() => {
    return contractData.phaseContributions.reduce((sum, contrib) => sum + parseFloat(contrib), 0);
  }, [contractData.phaseContributions]);

  // Debounce pie data to avoid visible twitch on quick successive updates
  const [stablePieData, setStablePieData] = useState(pieData);
  useEffect(() => {
    const t = setTimeout(() => setStablePieData(pieData), 250);
    return () => clearTimeout(t);
  }, [pieData]);


  const totalMintableTokens = useMemo(() => {
    const usingTimeUI = Boolean(optimizedData.isTimeBased && optimizedData.launchTimestamp && optimizedData.phaseDuration && typeof stableContractData.currentPhase === 'number');
    const safePhases = contractData.mintablePhases.filter((p) => usingTimeUI ? p < stableContractData.currentPhase : true);
    return safePhases.reduce((sum, phase) => {
      // Use contract's getEligibleTokens result if available (source of truth), otherwise fallback to calculation
      const eligibleFromContract = contractData.phaseEligibleTokens[phase];
      if (eligibleFromContract !== undefined) {
        return sum + parseFloat(eligibleFromContract);
      }
      // Fallback calculation (shouldn't happen if data is fetched correctly)
      const userContrib = parseFloat(contractData.phaseContributions[phase]);
      const totalContrib = contractData.historicalData[phase]?.contributions || 1;
      const phaseTokens = parseFloat(contractData.historicalPhaseTokens[phase] || (PHASES[phase]?.amount ?? '0'));
      return sum + (userContrib / totalContrib) * phaseTokens;
    }, 0);
  }, [contractData.mintablePhases, contractData.phaseEligibleTokens, contractData.phaseContributions, contractData.historicalData, contractData.historicalPhaseTokens, optimizedData.isTimeBased, optimizedData.launchTimestamp, optimizedData.phaseDuration, stableContractData.currentPhase]);

  // AppKit handles connection via <w3m-button />

  const fetchPublicContractData = useCallback(async () => {
    if (!publicProvider || isFetchingPublicRef.current) return;
    isFetchingPublicRef.current = true;

    // Reset validation state to prevent showing stale data
    setHasValidatedData(false);
    try {
      // Resolve network, block and contract code first to validate address/network
      const net0 = await publicProvider.getNetwork();
      const providerChainId0 = Number((net0 as { chainId: number | bigint }).chainId);
      const block0 = await publicProvider.getBlockNumber();
      const code0 = await publicProvider.getCode(CONTRACT_ADDRESSES[activeNetwork]);
      const codeSize0 = code0 && code0 !== "0x" ? Math.floor((code0.length - 2) / 2) : 0;
      const monotonicBlockPublic0 = Math.max(contractData.blockNumber, block0);

      // If provider chain doesn't match selected network, surface it clearly and stop
      if (providerChainId0 !== activeNetwork) {
        setContractData((prev) => ({
          ...prev,
          providerChainId: providerChainId0,
          blockNumber: monotonicBlockPublic0,
          launchBlock: 0,
          codeSize: codeSize0,
          isLaunchComplete: false,
        }));
        setHasValidatedData(true); // Set validation even for error states
        setHasPublicLight(true);
        setHasPublicDetails(false);
        setErrorMessage(`Public RPC is on chain ${providerChainId0}, but UI is set to ${activeNetwork}. Please switch networks.`);
        return;
      }

      if (!code0 || code0 === "0x") {
        // No contract at this address on selected network
        setContractData((prev) => ({
          ...prev,
          providerChainId: providerChainId0,
          blockNumber: monotonicBlockPublic0,
          codeSize: 0,
          launchBlock: 0,
          currentPhase: 0,
          totalMinted: prev.totalMinted,
          totalTokensThisPhase: PHASES[0]?.amount || '0',
          currentPhaseContributions: "0",
          totalContributions: "0",
          isLaunchComplete: false,
        }));
        setHasValidatedData(true); // Set validation even for error states
        setHasPublicLight(true);
        setHasPublicDetails(false);
        setErrorMessage("No contract code at this address on the selected network.");
        return;
      }

      const publicContract = new ethers.Contract(CONTRACT_ADDRESSES[activeNetwork], ABI, publicProvider);

      // Fetch minimal fast fields first and surface them immediately
      const launch0 = Number(await publicContract.launchBlock()) || 0;
      // Derive current phase quickly so the UI title doesn't briefly show Phase 0
      let derivedPhase = 0;
      if (optimizedData.isTimeBased && optimizedData.launchTimestamp && optimizedData.phaseDuration && optimizedData.phaseCount) {
        const nowTs = Math.floor(Date.now() / 1000);
        const sinceTs = Math.max(0, nowTs - Number(optimizedData.launchTimestamp));
        const pc = Number(optimizedData.phaseCount);
        const pd = Number(optimizedData.phaseDuration);
        derivedPhase = Math.min(pc - 1, Math.floor(sinceTs / pd));
      } else if (launch0 > 0 && block0 >= launch0) {
        const since = Number(block0 - launch0);
        if (since >= TOTAL_BLOCKS) {
          derivedPhase = PHASES.length - 1;
        } else {
          for (let i = 0; i < PHASES.length; i++) {
            if (since >= PHASES[i].start && since < PHASES[i].end) { derivedPhase = i; break; }
          }
        }
      }
      const isLaunchCompleteQuick = optimizedData.isTimeBased && optimizedData.launchTimestamp && optimizedData.phaseDuration && optimizedData.phaseCount
        ? (Math.floor(Date.now() / 1000) >= (Number(optimizedData.launchTimestamp) + Number(optimizedData.phaseCount) * Number(optimizedData.phaseDuration)))
        : (launch0 > 0 && block0 >= launch0 + TOTAL_BLOCKS);
      setContractData((prev) => ({
        ...prev,
        providerChainId: providerChainId0,
        blockNumber: monotonicBlockPublic0,
        launchBlock: launch0,
        codeSize: codeSize0,
        currentPhase: derivedPhase,
        totalTokensThisPhase: optimizedData.isTimeBased ? (prev.historicalPhaseTokens?.[derivedPhase] || prev.totalTokensThisPhase) : (PHASES[derivedPhase]?.amount || prev.totalTokensThisPhase || '0'),
        isLaunchComplete: isLaunchCompleteQuick,
      }));
      // Don't set hasPublicLight yet - wait for complete data

      // Parallelize critical data fetching for speed (dynamic by contract)
      const phaseCountForFetch = (optimizedData.isTimeBased && optimizedData.phaseCount)
        ? Number(optimizedData.phaseCount)
        : PHASES.length;

      const [
        phase,
        minted,
        phaseTotals0,
        tokenIdentity,
        phaseAllocationsRaw
      ] = await Promise.all([
        publicContract.getCurrentPhase().then(p => Number(p) || 0),
        publicContract.totalSupply(),
        Promise.all(Array.from({ length: phaseCountForFetch }, (_, i) => publicContract.totalContributions(i))),
        // Token identity (best-effort)
        Promise.all([
          publicContract.name().catch(() => ""),
          publicContract.symbol().catch(() => "")
        ]),
        optimizedData.isTimeBased
          ? Promise.all(Array.from({ length: phaseCountForFetch }, (_, i) => publicContract.phaseAllocation(i).catch(() => BigInt(0))))
          : Promise.resolve([])
      ]);

      const [tokenName0, tokenSymbol0] = tokenIdentity;
      const nowSec0 = Math.floor(Date.now() / 1000);
      const isLaunchComplete0 = optimizedData.isTimeBased && (optimizedData.scheduleEndTs || 0) > 0
        ? (nowSec0 >= Number(optimizedData.scheduleEndTs))
        : (launch0 > 0 && block0 >= launch0 + TOTAL_BLOCKS);
      const phaseAllocationsStr: string[] = optimizedData.isTimeBased
        ? (phaseAllocationsRaw as bigint[]).map(x => ethers.formatEther(x || 0n))
        : Array.from({ length: PHASES.length }, (_, i) => PHASES[i]?.amount || '0');

      const safePhase = Math.max(0, Math.min(phase, phaseCountForFetch - 1));
      const currentPhaseTotalContrib = phaseTotals0[safePhase] || BigInt(0);
      const totalContribAcross = phaseTotals0.reduce((acc, c) => acc + BigInt(c), BigInt(0));

      setContractData((prev) => ({
        ...prev,
        providerChainId: providerChainId0,
        tokenName: tokenName0 || prev.tokenName,
        tokenSymbol: tokenSymbol0 || prev.tokenSymbol,
        currentPhase: isLaunchComplete0 ? phaseCountForFetch - 1 : safePhase,
        totalMinted: ethers.formatEther(minted),
        blockNumber: monotonicBlockPublic0,
        launchBlock: launch0,
        totalTokensThisPhase: phaseAllocationsStr[safePhase] || prev.totalTokensThisPhase,
        currentPhaseContributions: ethers.formatEther(currentPhaseTotalContrib),
        totalContributions: ethers.formatEther(totalContribAcross),
        isLaunchComplete: isLaunchComplete0,
        codeSize: codeSize0,
        historicalPhaseTokens: phaseAllocationsStr,
      }));

      // Only show data when we have validated, complete information
      setHasValidatedData(true);
      setHasPublicLight(true);

      const block = await publicProvider.getBlockNumber();
      const launch = Number(await publicContract.launchBlock()) || 0;
      const nowSecA = Math.floor(Date.now() / 1000);
      const isLaunchComplete = optimizedData.isTimeBased && (optimizedData.scheduleEndTs || 0) > 0
        ? (nowSecA >= Number(optimizedData.scheduleEndTs))
        : (launch > 0 && block >= launch + TOTAL_BLOCKS);

      let aggregatedTotalContrib = BigInt(0);
      const phaseContributions = Array(phaseCountForFetch).fill("0");
      const phaseParticipantsData: PieData[] = [];
      const historicalPhaseParticipants: PieData[][] = Array(phaseCountForFetch).fill([]);
      const historicalPhaseProgress: { phase: number; progress: number; blocksPassed: number; totalBlocks: number }[] = [];
      const allContributors: Map<string, PieData> = new Map();
      const historical: HistoricalData[] = [];

      // Fetch contributors for all phases in parallel
      const contributorLists = await Promise.all(
        Array.from({ length: phaseCountForFetch }, (_, i) => {
          const shouldFetch = (i === phase) || (isLaunchComplete && i < 3);
          return shouldFetch
            ? publicContract.getPhaseContributors(i).catch(() => [] as string[])
            : Promise.resolve([] as string[]);
        })
      );

      // Surface participant counts immediately (before per-address contribution reads)
      try {
        const totalSet = new Set<string>();
        contributorLists.forEach((list) => {
          (list as string[]).forEach((addr) => totalSet.add(addr));
        });
        const participantsCountQuick = (contributorLists[phase] as string[]).length;
        if (!isConnected) {
          setContractData(prev => ({
            ...prev,
            participantsCount: participantsCountQuick,
            totalParticipants: totalSet.size,
          }));
        }
      } catch {}


      for (let i = 0; i < phaseCountForFetch; i++) {
        const totalContrib = phaseTotals0[i];
        aggregatedTotalContrib += totalContrib;
        phaseContributions[i] = ethers.formatEther(totalContrib);

        const contributors: string[] = contributorLists[i] as string[];
        const phaseParticipants: PieData[] = [];

        // Track unique contributors across phases
        contributors.forEach((addr: string) => {
          if (!allContributors.has(addr)) {
            allContributors.set(addr, { name: `${addr.slice(0, 6)}...`, value: 0, address: addr, tokens: 0 });
          }
        });

        // Fetch per-address contributions in parallel for this phase
        const contribValues = await Promise.all(
          contributors.map((addr) => publicContract.contributions(i, addr))
        );
        const totalPhaseContrib = parseFloat(ethers.formatEther(totalContrib));

        contributors.forEach((addr, idx) => {
          const contrib = contribValues[idx];
          if (contrib > BigInt(0)) {
            const userShare = parseFloat(ethers.formatEther(contrib));
            const tokenShare =
              totalPhaseContrib > 0 && (i < phase || (!optimizedData.isTimeBased && block > (launch + PHASES[i].end)))
                ? (userShare / totalPhaseContrib) * parseFloat(phaseAllocationsStr[i] || '0')
                : 0;
            const existing = allContributors.get(addr)!;
            existing.value += userShare;
            existing.tokens = (existing.tokens || 0) + tokenShare;

            if (i === phase && !isLaunchComplete) {
              const phaseTokenShare = totalPhaseContrib > 0 ? (userShare / totalPhaseContrib) * parseFloat(phaseAllocationsStr[i] || '0') : 0;
              phaseParticipantsData.push({
                name: `${addr.slice(0, 6)}...`,
                value: userShare,
                address: addr,
                tokens: phaseTokenShare,
              });
            } else if ((optimizedData.isTimeBased && i < phase) || (!optimizedData.isTimeBased && block > (launch + PHASES[i].end))) {
              phaseParticipants.push({
                name: `${addr.slice(0, 6)}...`,
                value: userShare,
                address: addr,
                tokens: tokenShare,
              });
            }
          }
        });

        historicalPhaseParticipants[i] = phaseParticipants;
        // Progress (time-based vs block-based)
        if (optimizedData.isTimeBased && optimizedData.launchTimestamp && optimizedData.phaseDuration) {
          const launchTs = Number(optimizedData.launchTimestamp || 0);
          const dur = Number(optimizedData.phaseDuration || 0);
          const phaseStartTs = launchTs + i * dur;
          const phaseEndTs = launchTs + (i + 1) * dur;
          const nowTs = Math.floor(Date.now() / 1000);
          const secsInPhase = Math.max(1, phaseEndTs - phaseStartTs);
          const secsPassed = Math.max(0, Math.min(nowTs - phaseStartTs, secsInPhase));
          const progress = (secsPassed / secsInPhase) * 100;
          const daysPassed = Math.floor(secsPassed / 86400);
          const totalDays = Math.max(1, Math.round(secsInPhase / 86400));
          historicalPhaseProgress.push({ phase: i, progress, blocksPassed: daysPassed, totalBlocks: totalDays });
        } else {
          const phaseStart = launch + PHASES[i].start;
          const phaseEnd = launch + PHASES[i].end;
          const blocksInPhase = phaseEnd - phaseStart;
          const blocksPassed = Math.min(Math.max(0, block - phaseStart), blocksInPhase);
          const progress = blocksInPhase > 0 ? (blocksPassed / blocksInPhase) * 100 : 0;
          historicalPhaseProgress.push({ phase: i, progress, blocksPassed, totalBlocks: blocksInPhase });
        }

        historical.push({
          phase: i.toString(),
          contributions: parseFloat(ethers.formatEther(totalContrib)),
          minted: 0,
        });
      }

      const monotonicBlockPublic = Math.max(contractData.blockNumber, block);
      const code = await publicProvider.getCode(CONTRACT_ADDRESSES[activeNetwork]);
      const codeSize = code && code !== "0x" ? Math.floor((code.length - 2) / 2) : 0;
      const currentPhaseTotalContribNow = await publicContract.totalContributions(phase);

      setContractData((prev) => ({
        ...prev,
        currentPhase: isLaunchComplete ? PHASES.length - 1 : phase,
        totalMinted: ethers.formatEther(minted),
        blockNumber: monotonicBlockPublic,
        launchBlock: launch,
        totalContributions: ethers.formatEther(aggregatedTotalContrib),
        // When connected, do NOT overwrite user-specific arrays used by "Your" charts
        ...(isConnected ? {} : { phaseContributions }),
        // When not connected, set participants counts; when connected, leave for user fetch to augment with pending
        ...(isConnected ? {} : {
          participantsCount: phaseParticipantsData.length,
          totalParticipants: allContributors.size,
        }),
        currentPhaseContributions: ethers.formatEther(currentPhaseTotalContribNow),
        // Do not touch user-only fields when connected to avoid flicker
        ...(isConnected ? {} : { userCurrentPhaseContributions: "0", pendingPhaseParticipants: [] }),
        totalTokensThisPhase: optimizedData.isTimeBased ? (prev.historicalPhaseTokens?.[phase] || prev.totalTokensThisPhase) : (PHASES[phase]?.amount || prev.totalTokensThisPhase || '0'),
        // Participants pie: prefer user fetch when connected (includes pending)
        ...(isConnected ? {} : { phaseParticipants: phaseParticipantsData }),
        totalParticipantsData: Array.from(allContributors.values()).filter(d => d.value > 0),
        ...(isConnected ? {} : { historicalData: historical }),
        historicalPhaseParticipants,
        historicalPhaseProgress,
        isLaunchComplete,
        codeSize,
      }));
      setErrorMessage(null);

      setHasPublicDetails(true);

    } catch (error) {
      console.error("Failed to fetch public contract data:", error) ;
      // Set validation even on error to prevent infinite loading
      setHasValidatedData(true);
      // Only show error if this is the initial load, user is not connected, AND we don't have optimized data
      if (!hasPublicDetails || !isConnected) {
        // Don't show error if we have valid optimized data
        if (!hasOptimizedData) {
          setErrorMessage("Error fetching public blockchain data. Please try refreshing.");
        }
      }
    } finally {
      isFetchingPublicRef.current = false;
    }
  }, [activeNetwork, publicProvider, contractData.blockNumber, isConnected, hasPublicDetails, hasOptimizedData, optimizedData.isTimeBased, optimizedData.launchTimestamp, optimizedData.phaseDuration, optimizedData.phaseCount, optimizedData.scheduleEndTs]);

  const fetchUserContractData = useCallback(async () => {
    if (!contract || !provider || !account || isFetchingUserRef.current) return;
    isFetchingUserRef.current = true;
    try {
      const blockProvider = publicProvider ?? provider;
      // Resolve network + block + code fast to populate diagnostics if public fetch hasn't yet
      const net1 = await blockProvider.getNetwork().catch(() => ({ chainId: 0 } as unknown as { chainId: number | bigint }));
      const providerChainId1 = Number((net1 as { chainId: number | bigint }).chainId ?? 0);
      const block1 = Number(await blockProvider.getBlockNumber().catch(() => 0));
      const contractAddressOnNet = (CONTRACT_ADDRESSES as unknown as Record<number, string>)[activeNetwork];
      const code1 = contractAddressOnNet ? await blockProvider.getCode(contractAddressOnNet).catch(() => "0x") : "0x";
      const codeSize1 = code1 && code1 !== "0x" ? Math.floor((code1.length - 2) / 2) : 0;

      const launch = optimizedData.isTimeBased
        ? 0
        : await contract.launchBlock().then((v) => Number(v as number | bigint | string) || 0).catch(() => 0);
      const phase = await contract.getCurrentPhase().then((v) => Number(v as number | bigint | string) || 0).catch(() => 0);
      const minted = await contract.totalSupply().catch(() => 0n);
      const nowSecB = Math.floor(Date.now() / 1000);
      const isLaunchComplete = optimizedData.isTimeBased && (optimizedData.scheduleEndTs || 0) > 0
        ? (nowSecB >= Number(optimizedData.scheduleEndTs))
        : (launch > 0 && block1 >= launch + TOTAL_BLOCKS);

      // Ensure diagnostics and light stats become visible
      setContractData(prev => ({
        ...prev,
        providerChainId: providerChainId1,
        blockNumber: Math.max(prev.blockNumber, block1),
        launchBlock: launch,
        codeSize: codeSize1 || prev.codeSize,
      }));
      setHasPublicLight(true);

      const phaseCountForUser = (optimizedData.isTimeBased && optimizedData.phaseCount)
        ? Number(optimizedData.phaseCount)
        : PHASES.length;
      const phaseAllocationsStr: string[] = optimizedData.isTimeBased
        ? (await Promise.all(Array.from({ length: phaseCountForUser }, (_, i) => contract.phaseAllocation(i).catch(() => 0n)))).map(x => ethers.formatEther((x as bigint) || 0n))
        : Array.from({ length: PHASES.length }, (_, i) => PHASES[i]?.amount || '0');

      let aggregatedUserContrib = BigInt(0);
      let aggregatedTotalContrib = BigInt(0);
      const mintable: number[] = [];
      const mintedPhases: number[] = [];
      const phaseContributions = Array(phaseCountForUser).fill("0");
      const phaseParticipantsData: PieData[] = [];
      const historicalPhaseParticipants: PieData[][] = Array(phaseCountForUser).fill([]);
      const historicalPhaseProgress: { phase: number; progress: number; blocksPassed: number; totalBlocks: number }[] = [];
      const allContributors: Map<string, PieData> = new Map();
      const historical: HistoricalData[] = [];
      const historicalPhaseTokens: string[] = Array(phaseCountForUser).fill("0");

      for (let i = 0; i < phaseCountForUser; i++) {
        const [userContrib, totalContrib, hasMintedPhase] = await Promise.all([
          contract.contributions(i, account).catch(() => 0n),
          contract.totalContributions(i).catch(() => 0n),
          contract.hasMinted(i, account).catch(() => false),
        ]);
        // Progress (time-based vs block-based)
        let blocksInPhase: number;
        let blocksPassed: number;
        let progress: number;
        if (optimizedData.isTimeBased && optimizedData.launchTimestamp && optimizedData.phaseDuration) {
          // Compute from contract constants instead of calling per-phase getters (lighter on RPC)
          const launchTs = Number(optimizedData.launchTimestamp || 0);
          const dur = Number(optimizedData.phaseDuration || 0);
          const phaseStartTs = launchTs + i * dur;
          const phaseEndTs = launchTs + (i + 1) * dur;
          const nowTs = Math.floor(Date.now() / 1000);
          const secsInPhase = Math.max(1, phaseEndTs - phaseStartTs);
          const secsPassed = Math.max(0, Math.min(nowTs - phaseStartTs, secsInPhase));
          blocksInPhase = Math.max(1, Math.round(secsInPhase / 86400));
          blocksPassed = Math.floor(secsPassed / 86400);
          progress = (secsPassed / secsInPhase) * 100;
        } else {
          const phaseStart = launch + PHASES[i].start;
          const phaseEnd = launch + PHASES[i].end;
          blocksInPhase = phaseEnd - phaseStart;
          blocksPassed = Math.min(Math.max(0, block1 - phaseStart), blocksInPhase);
          progress = blocksInPhase > 0 ? (blocksPassed / blocksInPhase) * 100 : 0;
        }

        // Time-based gating (MMM_02): at any moment, phases with index < current phase are ended; current/future are not.
        const usingTime = Boolean(optimizedData.isTimeBased && optimizedData.launchTimestamp && optimizedData.phaseDuration);
        const ended = usingTime ? (i < phase) : (block1 > (launch + PHASES[i].end));

        if (userContrib > 0 && ended && !hasMintedPhase) mintable.push(i);
        if (userContrib > 0 && hasMintedPhase) mintedPhases.push(i);
        aggregatedUserContrib += userContrib;
        aggregatedTotalContrib += totalContrib;
        phaseContributions[i] = ethers.formatEther(userContrib);
        
        // Store phase allocation for historical data
        historicalPhaseTokens[i] = phaseAllocationsStr[i] || '0';

        // Limit heavy contributors fetch to current phase, and up to 3 phases when launch is complete
        const shouldFetchContributors = (i === phase) || (isLaunchComplete && i < 3);
        const phaseParticipants: PieData[] = [];
        if (shouldFetchContributors) {
          const contributors: string[] = await contract.getPhaseContributors(i).catch(() => [] as string[]);
          // Cap per-phase addresses to avoid RPC overload
          const MAX_PER_PHASE = 100;
          const contributorsSlice = contributors.slice(0, MAX_PER_PHASE);

          contributorsSlice.forEach((addr: string) => {
            if (!allContributors.has(addr)) {
              allContributors.set(addr, { name: `${addr.slice(0, 6)}...`, value: 0, address: addr, tokens: 0 });
            }
          });

          const contribValues = await Promise.all(contributorsSlice.map((addr: string) => contract.contributions(i, addr).catch(() => 0n)));
          const totalPhaseContrib = parseFloat(ethers.formatEther(totalContrib));

          contributorsSlice.forEach((addr: string, idx: number) => {
            const contrib = contribValues[idx];
            if (contrib > BigInt(0)) {
              const userShare = parseFloat(ethers.formatEther(contrib));
              const tokenShare =
                totalPhaseContrib > 0 && (hasMintedPhase || ended)
                  ? (userShare / totalPhaseContrib) * parseFloat(phaseAllocationsStr[i] || '0')
                  : 0;
              const existing = allContributors.get(addr)!;
              existing.value += userShare;
              existing.tokens = (existing.tokens || 0) + tokenShare;

              if (i === phase && !isLaunchComplete) {
                const phaseTokenShare = totalPhaseContrib > 0 ? (userShare / totalPhaseContrib) * parseFloat(phaseAllocationsStr[i] || '0') : 0;
                phaseParticipantsData.push({
                  name: `${addr.slice(0, 6)}...`,
                  value: userShare,
                  address: addr,
                  tokens: phaseTokenShare,
                });
              } else if (ended) {
                phaseParticipants.push({
                  name: `${addr.slice(0, 6)}...`,
                  value: userShare,
                  address: addr,
                  tokens: tokenShare,
                });
              }
            }
          });
        }
        historicalPhaseParticipants[i] = phaseParticipants;
        historicalPhaseProgress.push({ phase: i, progress, blocksPassed, totalBlocks: blocksInPhase });

        historical.push({
          phase: i.toString(),
          contributions: parseFloat(ethers.formatEther(userContrib)),
          minted: hasMintedPhase && userContrib > 0 ? (parseFloat(ethers.formatEther(userContrib)) / parseFloat(ethers.formatEther(totalContrib))) * parseFloat(phaseAllocationsStr[i] || '0') : 0,
        });
      }

      // Fetch eligible tokens from contract for mintable phases (source of truth)
      const eligibleTokensMap: Record<number, string> = {};
      if (mintable.length > 0) {
        const eligibleTokensResults = await Promise.all(
          mintable.map((phaseIdx) =>
            contract.getEligibleTokens(phaseIdx, account).catch(() => 0n)
          )
        );
        mintable.forEach((phaseIdx, idx) => {
          eligibleTokensMap[phaseIdx] = ethers.formatEther(eligibleTokensResults[idx] || 0n);
        });
      }

      const [currentPhaseUserContrib, currentPhaseTotalContrib] = await Promise.all([
        contract.contributions(phase, account).catch(() => 0n),
        contract.totalContributions(phase).catch(() => 0n),
      ]);
      const totalTokensThisPhase = parseFloat(phaseAllocationsStr[phase] || '0');

      const storedPending = getPendingContributions(account);
      // Keep only active-phase pending; drop older-phase items
      let filteredPending = storedPending.filter((p) => {
        const phaseIndex = p.phase ?? phase;
        const usingTime = Boolean(optimizedData.isTimeBased && optimizedData.launchTimestamp && optimizedData.phaseDuration);
        let isPhaseActive = false;
        if (usingTime) {
          const endTs = Number(optimizedData.launchTimestamp || 0) + (phaseIndex + 1) * Number(optimizedData.phaseDuration || 0);
          const nowTsX = Math.floor(Date.now() / 1000);
          isPhaseActive = nowTsX <= endTs;
        } else {
          const phaseEnd = launch + PHASES[phaseIndex].end;
          isPhaseActive = block1 <= phaseEnd;
        }
        return isPhaseActive && p.value > 0;
      });

      // Reconcile: if a pending tx is already mined, drop it from local storage
      try {
        const receipts = await Promise.all(
          filteredPending.map((p) => (p.txHash ? provider.getTransactionReceipt(p.txHash).catch(() => null) : Promise.resolve(null)))
        );
        const stillPending: PieData[] = [];
        for (let i = 0; i < filteredPending.length; i++) {
          const r = receipts[i];
          if (!r) stillPending.push(filteredPending[i]);
        }
        if (stillPending.length !== filteredPending.length) {
          filteredPending = stillPending;
          setPendingContributions(account, filteredPending);
        }
      } catch {}

      // For current phase UI, compute totals including local pending for better estimate
      const currentPhasePending = filteredPending.filter(p => (p.phase ?? phase) === phase);
      const totalPendingContrib = currentPhasePending.reduce((sum, p) => sum + p.value, 0);
      const totalPhaseContrib = parseFloat(ethers.formatEther(currentPhaseTotalContrib));
      const totalPhaseContribWithPending = totalPhaseContrib + totalPendingContrib;
      const totalUserContrib = parseFloat(ethers.formatEther(currentPhaseUserContrib)) + totalPendingContrib;

      const updatedEstimatedReward = totalPhaseContribWithPending > 0
        ? (totalUserContrib / totalPhaseContribWithPending) * totalTokensThisPhase
        : 0;

      const updatedPhaseParticipants = phaseParticipantsData.map(p => {
        if (p.address === account) {
          return { ...p, value: totalUserContrib, tokens: updatedEstimatedReward };
        }
        return p;
      });
      if (!updatedPhaseParticipants.some(p => p.address === account) && totalPendingContrib > 0) {
        updatedPhaseParticipants.push({
          name: `${account.slice(0, 6)}...`,
          value: totalUserContrib,
          address: account,
          tokens: updatedEstimatedReward,
          isPending: true,
          phase,
        });
      }

      setContractData((prev) => ({
        ...prev,
        currentPhase: isLaunchComplete ? phaseCountForUser - 1 : phase,
        totalMinted: ethers.formatEther(minted),
        blockNumber: Math.max(prev.blockNumber, block1),
        launchBlock: launch,
        userContributions: ethers.formatEther(aggregatedUserContrib),
        totalContributions: ethers.formatEther(aggregatedTotalContrib),
        mintablePhases: mintable,
        mintedPhases,
        phaseEligibleTokens: eligibleTokensMap,
        estimatedReward: updatedEstimatedReward.toString(),
        phaseContributions,
        participantsCount: updatedPhaseParticipants.length,
        totalParticipants: allContributors.size,
        currentPhaseContributions: ethers.formatEther(currentPhaseTotalContrib),
        userCurrentPhaseContributions: ethers.formatEther(currentPhaseUserContrib),
        totalTokensThisPhase: phaseAllocationsStr[phase] || prev.totalTokensThisPhase,
        phaseParticipants: updatedPhaseParticipants,
        totalParticipantsData: Array.from(allContributors.values()).filter(d => d.value > 0),
        pendingPhaseParticipants: filteredPending,
        historicalData: historical,
        historicalPhaseTokens: historicalPhaseTokens,
        historicalPhaseParticipants,
        historicalPhaseProgress,
        isLaunchComplete,
        codeSize: codeSize1 || prev.codeSize,
      }));
      setPendingContributions(account, filteredPending);
      setHasInitialUserFetch(true);

      setErrorMessage(null);
    } catch (error) {
      console.error("Failed to fetch user contract data:", error);
      // Do not surface background refresh errors to the user; keep previous good data.
      // We only show explicit errors for user-triggered actions (e.g., send/mint).
    } finally {
      isFetchingUserRef.current = false;
      if (!hasInitialUserFetch) setHasInitialUserFetch(true);
    }
  }, [contract, provider, account, publicProvider, activeNetwork, optimizedData.isTimeBased, optimizedData.launchTimestamp, optimizedData.phaseDuration, optimizedData.phaseCount, optimizedData.scheduleEndTs, hasInitialUserFetch]);

  const [txMessage, setTxMessage] = useState<string | null>(null);

  const [lastContribution, setLastContribution] = useState<{ txHash: string; phase: number; amountEth: number; estReward: number; sharePct: number } | null>(null);

  const sendEth = useCallback(async () => {
    if (!isConnected || !signer || !account || !contract || stableContractData.isLaunchComplete) {
      setTxMessage(stableContractData.isLaunchComplete ? "Launch is complete, no more contributions accepted." : "Please connect your wallet!");
      return;
    }
    if (parseFloat(ethAmount) < parseFloat(minContributionEth)) {
      setTxMessage(`Minimum contribution is ${minContributionEth} ETH.`);
      return;
    }
    setIsSending(true);
    try {
      sendTransaction({
        to: CONTRACT_ADDRESSES[activeNetwork] as `0x${string}`,
        value: parseEther(ethAmount),
        chainId: activeNetwork,
      });
      setTxMessage("Waiting for wallet confirmation...");
    } catch (error) {
      console.error("Send ETH failed:", error);
      setTxMessage(`Transaction failed: ${(error as Error).message}`);
      setIsSending(false);
    }
  }, [isConnected, signer, account, ethAmount, activeNetwork, sendTransaction, contract, stableContractData.isLaunchComplete, minContributionEth]);

  const mintTokens = useCallback(
    async (phase: number) => {
      if (!contract || !account) return alert("Please connect your wallet!");
      setIsMinting(prev => new Map(prev).set(phase, true));
      try {
        const tx = await contract.mintUserShare(phase, { gasLimit: BASE_GAS_LIMIT });
        await tx.wait();
        await fetchUserContractData();
      } catch (error) {
        console.error("Minting failed:", error);
        alert(`Minting failed: ${(error as Error).message}`);
      } finally {
      setIsMinting(prev => new Map(prev).set(phase, false));
      }
    },
    [contract, account, fetchUserContractData]
  );

  const multiMint = useCallback(async () => {
    if (!contract || !account || contractData.mintablePhases.length === 0) return;
    setIsMinting(prev => new Map(prev).set(-1, true));
    try {
      // MMM_Unified doesn't have mintMultipleUserShares, mint phases one by one
      for (const phase of contractData.mintablePhases) {
        try {
          const tx = await contract.mintUserShare(phase, { gasLimit: BASE_GAS_LIMIT });
          await tx.wait();
        } catch (error) {
          console.error(`Failed to mint phase ${phase}:`, error);
          // Continue with other phases even if one fails
        }
      }
      await fetchUserContractData();
    } catch (error) {
      console.error("Multi-minting failed:", error);
      alert(`Multi-minting failed: ${(error as Error).message}`);
    } finally {
    setIsMinting(prev => new Map(prev).set(-1, false));
    }
  }, [contract, account, contractData.mintablePhases, fetchUserContractData]);

  const fetchUserStakes = useCallback(async () => {
    if (!stakingContract || !account) {
      setUserStakes([]);
      return;
    }
    if (stakesFetchInFlightRef.current) return;
    stakesFetchInFlightRef.current = true;
    const silent = suppressStakeSpinnerRef.current === true;
    if (!silent) setIsFetchingStakes(true);
    try {
      let gp = gracePeriodSec;
      try {
        const gpBn: bigint = await stakingContract.GRACE_PERIOD_SEC();
        const gpNum = Number(gpBn);
        if (gpNum > 0) {
          gp = gpNum;
          setGracePeriodSec(gpNum);
        }
      } catch {}
      const countBn: bigint = await stakingContract.stakeCount(account);
      const count = Number(countBn);
      const out: UserStakeView[] = [];
      for (let i = 0; i < count; i++) {
        const s = await stakingContract.stakeInfo(account, i);
        // MMM_Unified stake structure: (stakeId, stakedDrops, stakeShares, lockedDay, stakedDays, unlockedDay, isAutoStake)
        const amountWei: bigint = BigInt(s.stakedDrops);
        const stakeId: number = Number(s.stakeId);
        const lockedDay: number = Number(s.lockedDay);
        const stakedDays: number = Number(s.stakedDays);
        const unlockedDay: number = Number(s.unlockedDay);
        const closed: boolean = unlockedDay > 0;
        const closeTs: number = unlockedDay > 0 ? unlockedDay * 86400 : 0;
        
        // Calculate timestamps from days (lockedDay is day number, not timestamp)
        // Need LAUNCH_TIMESTAMP to convert day to timestamp
        let startTs = 0;
        try {
          const launchTs = await contract?.LAUNCH_TIMESTAMP();
          if (launchTs) startTs = Number(launchTs) + (lockedDay - 1) * 86400;
        } catch {}
        
        const maturityTs = startTs + stakedDays * 86400;
        const graceEndTs = maturityTs + gp;
        const nowTs = Math.floor(Date.now() / 1000);
        let status: UserStakeView["status"];
        if (closed) status = "CLOSED";
        else if (nowTs < maturityTs) status = "ACTIVE";
        else if (nowTs <= graceEndTs) status = "IN_GRACE";
        else status = "LATE";
        
        // Rewards are calculated on stakeEnd, no separate pendingRewards function
        const pendingRewardsWei: bigint = 0n;
        
        out.push({
          id: stakeId,
          amountWei,
          amount: ethers.formatUnits(amountWei, 18),
          startTs,
          lockDays: stakedDays,
          closed,
          closeTs,
          maturityTs,
          graceEndTs,
          pendingRewardsWei,
          pendingRewards: "0",
          status,
        });
      }
      setUserStakes(out);
    } catch (e) {
      console.error("fetchUserStakes failed", e);
    } finally {
      if (!silent) setIsFetchingStakes(false);
      stakesFetchInFlightRef.current = false;
    }
  }, [stakingContract, contract, account, gracePeriodSec]);

  const fetchTotalStaked = useCallback(async () => {
    if (!stakingContract) return;
    try {
      const ts: bigint = await stakingContract.totalStaked();
      setTotalStakedStr(ethers.formatUnits(ts, 18));
    } catch {}
  }, [stakingContract]);

  const onStake = useCallback(
    async (amount: string, lockDays: number) => {
      if (!isConnected || !account) return alert("Please connect your wallet!");
      if (!contract || !stakingContract) return alert("Staking is not available on this network.");
      try {
        const amountWei = ethers.parseUnits(amount || "0", 18);
        if (amountWei <= 0n) {
          alert("Enter a valid amount");
          return;
        }

        // Check balance before staking (MMM_Unified burns tokens directly)
        const balance = await contract.balanceOf(account);
        if (balance < amountWei) {
          alert(`Insufficient balance. You have ${ethers.formatEther(balance)} MMM, but need ${amount} MMM. Please mint tokens from a completed phase first.`);
          return;
        }

        // MMM_Unified burns tokens directly, no approval needed
        const stakeTx = await stakingContract.stakeStart(amountWei, lockDays);
        await stakeTx.wait();
        alert("Stake created successfully.");
        await fetchUserStakes();
        await fetchTokenBalance();
      } catch (error: unknown) {
        console.error("Stake failed:", error);
        // Try to extract a more user-friendly error message
        let errorMsg = "Unknown error";
        if (error && typeof error === 'object') {
          if ('message' in error && typeof error.message === 'string') {
            errorMsg = error.message;
          } else if ('data' in error && error.data && typeof error.data === 'object' && 'message' in error.data && typeof error.data.message === 'string') {
            errorMsg = error.data.message;
          } else if ('reason' in error && typeof error.reason === 'string') {
            errorMsg = error.reason;
          }
        } else if (typeof error === 'string') {
          errorMsg = error;
        }
        alert(`Stake failed: ${errorMsg}`);
      } finally {
        // Loading state handled by isMinting map
      }
    },
    [isConnected, account, contract, stakingContract, fetchUserStakes, fetchTokenBalance]
  );


  // Do not override activeNetwork from chainId to avoid flicker/mismatch on cold load
  // Navbar will set both activeNetwork and request wallet switch together

  useEffect(() => {
    if (isConnected && account && walletClient) {
      // Only show loading overlay on first load
      if (!hasInitialLoad) {
        setIsInitialLoading(true);
      }
      const init = async () => {
        try {
          // Do not auto-switch chains here to avoid flicker; Navbar will call switchChain
          const providerInstance = new ethers.BrowserProvider((window as unknown as { ethereum: EIP1193Provider }).ethereum);
          const signerInstance = await providerInstance.getSigner();
          const contractInstance = new ethers.Contract(CONTRACT_ADDRESSES[activeNetwork], ABI, signerInstance);
          setProvider(providerInstance);
          setSigner(signerInstance);
          setContract(contractInstance);
          try {
            const stakingAddr = STAKING_ADDRESSES[activeNetwork] as `0x${string}`;
            if (stakingAddr && stakingAddr !== "0x0000000000000000000000000000000000000000") {
              const stakingInstance = new ethers.Contract(stakingAddr, STAKING_ABI, signerInstance);
              setStakingContract(stakingInstance);
            }
          } catch (e) {
            console.warn("Staking contract init skipped:", e);
          }
          setErrorMessage(null);
          await fetchUserContractData();
          setTimeout(fetchUserContractData, 1500);
        } catch (error) {
          console.error("Failed to initialize wallet connection:", error);
          setErrorMessage("Failed to initialize wallet connection. Please try refreshing.");
        } finally {
          setIsInitialLoading(false);
          setHasInitialLoad(true);
        }
      };
      init();
    } else if (publicProvider) {
      // Only show loading overlay on first load
      if (!hasInitialLoad) {
        setIsInitialLoading(true);
      }
      // Only fetch with old method if optimized data is not available AND not loading
      if (!hasOptimizedData && !optimizedData.isLoading) {
        fetchPublicContractData().then(() => {
          setIsInitialLoading(false);
          setHasInitialLoad(true);
        }).catch(() => {
          setIsInitialLoading(false);
          setHasInitialLoad(true);
        });
      } else if (hasOptimizedData || optimizedData.isLoading) {
        // If we have optimized data or it's loading, skip old fetching
        setIsInitialLoading(false);
        setHasInitialLoad(true);
      }
    }
  }, [isConnected, walletClient, account, activeNetwork, switchChain, fetchUserContractData, fetchPublicContractData, publicProvider, hasInitialLoad, hasOptimizedData, optimizedData.isLoading]);

  // Ensure public data loads even before wallet client is ready (only if no optimized data)
  // Fetch global contributors data even when optimized data is available (optimized data skips this)
  useEffect(() => {
    if (!publicProvider) return;
    // Always fetch global data occasionally (every 30s) since optimized hook skips heavy global contributors fetch
    // This ensures we get global contributions, top contributors, and phase participant data
    if (!hasOptimizedData || !optimizedData.isLoading) {
      fetchPublicContractData();
    }
    const interval = setInterval(() => {
      // Always refresh global contributors data periodically (needed for Global Contributions and Top Contributors)
      fetchPublicContractData();
    }, 30000); // Fetch global contributors data every 30 seconds
    return () => clearInterval(interval);
  }, [publicProvider, fetchPublicContractData, hasOptimizedData, optimizedData.isLoading]);

  // Clear user error when disconnected
  useEffect(() => {
    if (!isConnected) {

      if (errorMessage && errorMessage.toLowerCase().includes("user blockchain")) {
        setErrorMessage(null);
      }
    }
  }, [isConnected, errorMessage]);

  // Auto-dismiss error messages after 10 seconds
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

// Auto-dismiss the confirmation banner when the participated phase finishes
useEffect(() => {
  if (!lastContribution) return;
  if (contractData.currentPhase !== lastContribution.phase) {
    setLastContribution(null);
  }
}, [contractData.currentPhase, lastContribution]);

  // Immediately clear user-only fields when disconnecting or when the account changes,
  // so we don't show stale pending/estimates from the previous account
  useEffect(() => {
    if (!isConnected || !account) {
      setContractData(prev => ({
        ...prev,
        userContributions: "0",
        userCurrentPhaseContributions: "0",
        estimatedReward: "0",
        mintablePhases: [],
        mintedPhases: [],
        phaseEligibleTokens: {},


        pendingPhaseParticipants: [],
      }));
      return;
    }


    // On account switch, re-seed pending from this account's storage immediately
    setContractData(prev => ({
      ...prev,
      pendingPhaseParticipants: getPendingContributions(account),
    }));
  }, [isConnected, account]);



// Clear last contribution banner when account/network/connection changes
useEffect(() => {
  setLastContribution(null);
}, [account, isConnected, activeNetwork]);

  useEffect(() => {
    if (isSuccess && txData && contract && provider && account && txData !== lastTxHash) {


      const newContribution = parseFloat(ethAmount);
      const totalPhaseContrib = parseFloat(contractData.currentPhaseContributions) || 0;
      const totalTokensThisPhase = parseFloat(contractData.totalTokensThisPhase);
      const totalPendingContrib = contractData.pendingPhaseParticipants
        .filter(p => p.phase === contractData.currentPhase)
        .reduce((sum, p) => sum + p.value, 0);
      const totalPhaseContribWithPending = totalPhaseContrib + totalPendingContrib + newContribution;
      const totalUserContrib = parseFloat(contractData.userCurrentPhaseContributions) + totalPendingContrib + newContribution;
      const estimatedReward = totalPhaseContribWithPending > 0
        ? (totalUserContrib / totalPhaseContribWithPending) * totalTokensThisPhase
        : 0;

      const sharePct = totalTokensThisPhase > 0 ? (estimatedReward / totalTokensThisPhase) * 100 : 0;
      setLastContribution({ txHash: txData, phase: contractData.currentPhase, amountEth: newContribution, estReward: estimatedReward, sharePct });

      const tempParticipant: PieData = {
        name: `${account.slice(0, 6)}...`,
        value: newContribution,
        address: account,
        tokens: estimatedReward,
        isPending: true,
        phase: contractData.currentPhase,
        txHash: txData,
      // Auto-dismiss banner when the participated phase finishes (currentPhase changes)
      // Runs once after success; ongoing check below in a separate effect

      };

      setContractData((prev) => {


        const existingPending = prev.pendingPhaseParticipants.filter(p => p.phase !== contractData.currentPhase);
        const currentPhasePending = prev.pendingPhaseParticipants.filter(p => p.phase === contractData.currentPhase);
        const updatedPending = [...existingPending, ...currentPhasePending, tempParticipant];
        setPendingContributions(account, updatedPending);

        const updatedPhaseParticipants = prev.phaseParticipants.map(p => {
          if (p.address === account) {
            return { ...p, value: totalUserContrib, tokens: estimatedReward, isPending: true };
          }
          return p;
        });
        if (!updatedPhaseParticipants.some(p => p.address === account)) {
          updatedPhaseParticipants.push({
            name: `${account.slice(0, 6)}...`,
            value: totalUserContrib,
            address: account,
            tokens: estimatedReward,
            isPending: true,
            phase: contractData.currentPhase,
          });
        }

        return {
          ...prev,
          pendingPhaseParticipants: updatedPending,
          phaseParticipants: updatedPhaseParticipants,
          estimatedReward: estimatedReward.toString(),
          participantsCount: updatedPhaseParticipants.length,
        };
      });

      setLastTxHash(txData);
      setIsSending(false);
      setErrorMessage(null);
      setTxMessage(null); // Clear the "Waiting for wallet confirmation..." message

      // CRITICAL: Only fetch with old method if we DON'T have optimized data
      if (!hasOptimizedData && !optimizedData.isLoading) {
        setTimeout(fetchUserContractData, 5000);
      }
    } else if (txError) {
      setIsSending(false);
      setTxMessage(`Transaction failed: ${txError.message || "Unknown error"}`);
    }
  }, [isSuccess, txError, txData, contract, provider, account, ethAmount, contractData, fetchUserContractData, lastTxHash, hasOptimizedData, optimizedData.isLoading]);

  useEffect(() => {
    // CRITICAL: Don't fetch with old method if we have optimized data - it causes flickering
    if (isConnected && !stableContractData.isLaunchComplete && !hasOptimizedData) {
      const interval = setInterval(() => {
        if (!hasOptimizedData && !optimizedData.isLoading) {
          fetchUserContractData();
        }
      }, 15000); // Increased from 6000 to 15000 - much less frequent
      return () => clearInterval(interval);
    }
  }, [isConnected, stableContractData.isLaunchComplete, fetchUserContractData, hasOptimizedData, optimizedData.isLoading]);

  // While the confirmation banner is visible, refresh user data more frequently
  // CRITICAL: Only do this if we DON'T have optimized data - optimized data handles its own refresh
  useEffect(() => {
    if (!isConnected || stableContractData.isLaunchComplete || !lastContribution || hasOptimizedData) return;
    let intervalId: number | undefined;

    const tick = () => {
      // Only fetch if we still don't have optimized data
      if (!hasOptimizedData && !optimizedData.isLoading) {
        // rely on isFetchingUserRef inside fetchUserContractData to avoid overlap
        fetchUserContractData();
      }
    };

    tick();
    intervalId = window.setInterval(tick, 10000); // Increased from 3000 to 10000 - much less frequent

    const onVisibility = () => {
      if (document.hidden) {
        if (intervalId) { clearInterval(intervalId); intervalId = undefined; }
      } else if (!intervalId && !hasOptimizedData) {
        tick();
        intervalId = window.setInterval(tick, 10000); // Increased from 3000 to 10000
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };


  }, [isConnected, stableContractData.isLaunchComplete, lastContribution, fetchUserContractData, hasOptimizedData, optimizedData.isLoading]);

  useEffect(() => {
    if (!stakingContract) return;
    // Try to read staking params; ignore if functions are missing
    (async () => {
      try {
        const val = await stakingContract.EARLY_PENALTY_MAX_BPS?.();
        if (val) setStakingParams(prev => ({ ...prev, earlyPenaltyMaxBps: Number(val) }));
      } catch {}
      try {
        const val = await stakingContract.LATE_PENALTY_RATE_PER_DAY_BPS?.();
        if (val) setStakingParams(prev => ({ ...prev, latePenaltyRatePerDayBps: Number(val) }));
      } catch {}
      try {
        const val = await stakingContract.LATE_PENALTY_MAX_BPS?.();
        if (val) setStakingParams(prev => ({ ...prev, latePenaltyMaxBps: Number(val) }));
      } catch {}
      try {
        const val = await stakingContract.MIN_STAKE_DAYS?.();
        if (val) setStakingParams(prev => ({ ...prev, minLockDays: Number(val) }));
      } catch {}
      try {
        const val = await stakingContract.MAX_STAKE_DAYS?.();
        if (val) setStakingParams(prev => ({ ...prev, maxLockDays: Number(val) }));
      } catch {}
      try {
        const addr = await stakingContract.PENALTY_RECEIVER?.();
        if (addr && addr !== ethers.ZeroAddress) setStakingParams(prev => ({ ...prev, penaltyReceiver: String(addr) }));
      } catch {}
      // MMM_Unified has STAKER_REWARD_BPS (99.5%) and PENALTY_RECEIVER_BPS (0.5%), no HOLDER_REWARD_BPS
      // These are constants, so they may not be callable. Use fallback values from contract.
      try {
        const val = await stakingContract.STAKER_REWARD_BPS?.();
        if (val) setStakingParams(prev => ({ ...prev, stakerRewardBps: Number(val) }));
      } catch {
        // Fallback: MMM_Unified constant value (99.5%)
        setStakingParams(prev => ({ ...prev, stakerRewardBps: 9950 }));
      }
      try {
        const val = await stakingContract.PENALTY_RECEIVER_BPS?.();
        if (val) setStakingParams(prev => ({ ...prev, penaltyReceiverBps: Number(val) }));
      } catch {
        // Fallback: MMM_Unified constant value (0.5%)
        setStakingParams(prev => ({ ...prev, penaltyReceiverBps: 50 }));
      }
    })();
    fetchTotalStaked();
  }, [stakingContract, fetchTotalStaked]);

  const fetchUserStakesSilent = useCallback(async () => {
    if (!stakingContract || !account) return;
    suppressStakeSpinnerRef.current = true;
    try {
      await fetchUserStakes();
    } finally {
      suppressStakeSpinnerRef.current = false;
    }
  }, [stakingContract, account, fetchUserStakes]);

  useEffect(() => {
    if (stakingContract && account) {
      fetchUserStakes();
    }
  }, [stakingContract, account, fetchUserStakes]);

  // Auto-refresh stakes on new blocks (throttled + silent)
  useEffect(() => {
    const p = publicProvider ?? provider;
    if (!p || !isConnected || !stakingContract || !account) return;

    const onBlock = () => {
      if (typeof document !== 'undefined' && document.hidden) return; // skip when tab hidden
      const now = Date.now();
      if (now - lastStakesFetchMsRef.current < MIN_STAKES_REFRESH_MS) return;
      lastStakesFetchMsRef.current = now;
      fetchUserStakesSilent();
      fetchTokenBalance();
      fetchTotalStaked();
    };

    try {
      p.on('block', onBlock);
    } catch {}

    return () => {
      try { p.off('block', onBlock); } catch {}
    };
  }, [publicProvider, provider, isConnected, stakingContract, account, fetchUserStakesSilent, fetchTokenBalance, fetchTotalStaked]);


  const handleUnstake = useCallback(
    async (stakeId: number) => {
      if (!stakingContract || !account) return;
      try {
        // Find stake index by stakeId
        const countBn: bigint = await stakingContract.stakeCount(account);
        const count = Number(countBn);
        let stakeIndex = -1;
        for (let i = 0; i < count; i++) {
          const s = await stakingContract.stakeInfo(account, i);
          if (Number(s.stakeId) === stakeId) {
            stakeIndex = i;
            break;
          }
        }
        if (stakeIndex === -1) {
          alert("Stake not found");
          return;
        }
        const tx = await stakingContract.stakeEnd(stakeIndex, stakeId);
        await tx.wait();
        await fetchUserStakes();
        await fetchTokenBalance();
        alert("Unstaked successfully.");
      } catch (e) {
        console.error("unstake failed", e);
        alert((e as Error)?.message || "Unstake failed");
      } finally {
        // Loading state handled by isMinting map
      }
    },
    [stakingContract, account, fetchUserStakes, fetchTokenBalance]
  );

  // Emergency exit is handled by stakeEnd in MMM_Unified (early exit with penalties)
  const handleEmergencyExit = useCallback(
    async (stakeId: number) => {
      if (!stakingContract || !account) return;
      try {
        // Find stake index by stakeId
        const countBn: bigint = await stakingContract.stakeCount(account);
        const count = Number(countBn);
        let stakeIndex = -1;
        for (let i = 0; i < count; i++) {
          const s = await stakingContract.stakeInfo(account, i);
          if (Number(s.stakeId) === stakeId) {
            stakeIndex = i;
            break;
          }
        }
        if (stakeIndex === -1) {
          alert("Stake not found");
          return;
        }
        // Early exit (with penalties) - same as unstake but before maturity
        const tx = await stakingContract.stakeEnd(stakeIndex, stakeId);
        await tx.wait();
        await fetchUserStakes();
        await fetchTokenBalance();
        alert("Early exit executed (penalties may apply).");
      } catch (e) {
        console.error("early exit failed", e);
        alert((e as Error)?.message || "Early exit failed");
      } finally {
        // Loading state handled by isMinting map
      }
    },
    [stakingContract, account, fetchUserStakes, fetchTokenBalance]
  );

  // Rewards are automatically distributed in MMM_Unified, no separate claim function
  const handleClaimRewards = useCallback(
    async () => {
      alert("Rewards are automatically distributed when you unstake. Use 'Unstake' to claim your rewards.");
    },
    []
  );

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {

    // render a safe placeholder that matches server-side output
    return <div className="min-h-screen text-white" />;
  }

  if (typeof window === "undefined") {
    return null; // Prevent SSR rendering entirely
  }


  return (
    <main role="main" className="min-h-screen text-white overflow-x-hidden pt-24 md:pt-28">
      <Navbar
        account={account}
        provider={provider}
        disconnectWallet={disconnect}
        activeNetwork={activeNetwork}
        setActiveNetwork={(id: number) => { setActiveNetwork(id as ChainId); switchChain({ chainId: id as ChainId }); }}
      />
      <div className="mx-auto max-w-7xl flex flex-col px-4 sm:px-6 lg:px-8 md:gap-2 lg:gap-3">
        {/* Only show full-screen loading overlay on first load when no data at all */}
        {isInitialLoading && !hasInitialLoad && !hasStableData && !hasOptimizedData && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="glass p-8 rounded-lg text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-lg" style={{ color: 'var(--foreground)' }}>Loading...</p>
            </div>
          </div>
        )}
        <motion.header
          className="text-center mb-12"
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <FaEthereum className="text-indigo-400 text-5xl mx-auto animate-bounce" />
          <h1
            className="text-4xl md:text-5xl font-extrabold mt-4 bg-clip-text text-transparent"
            style={{
              backgroundImage: `linear-gradient(to right, var(--primary), var(--accent), var(--secondary))`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text'
            }}
          >
            MrManMan (MMM) Token
          </h1>
          <p className="mt-2 text-gray-300 text-lg">Participate in a decentralized ecosystem</p>
        </motion.header>

        <div className="flex flex-col items-center gap-2">
          <div className="text-sm text-gray-300">
            Contract: <span className="font-mono text-white">{CONTRACT_ADDRESSES[activeNetwork]}</span>
          </div>
          <div className="flex gap-3">
            <a
              href={`${getExplorerBase(activeNetwork)}/address/${CONTRACT_ADDRESSES[activeNetwork]}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1 rounded-md text-sm transition-colors"
              style={{
                backgroundColor: 'var(--glass-bg)',
                border: `1px solid var(--glass-border)`,
                color: 'var(--primary)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary)';
                e.currentTarget.style.color = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--glass-border)';
                e.currentTarget.style.color = 'var(--primary)';
              }}
            >
              View on Etherscan
            </a>
          </div>
        </div>




        {hasStableData && stableContractData.isLaunchComplete && (
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-white mb-8">Launch History</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
              {contractData.historicalPhaseProgress.map((p) => (
                <HistoricalPhaseCard
                  key={p.phase}
                  phase={p.phase}
                  progress={p.progress}
                  blocksPassed={p.blocksPassed}
                  totalBlocks={p.totalBlocks}
                  totalTokens={contractData.historicalPhaseTokens[p.phase] || (PHASES[p.phase]?.amount ?? '0')}
                  participants={stableContractData.historicalPhaseParticipants[p.phase]}
                  isTimeBased={optimizedData.isTimeBased}
                />
              ))}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8 items-start justify-center">
          <div id="participate" className="glass w-full p-4 sm:p-6 lg:p-8 ring-white/10 space-y-8 h-full">

            <motion.div
              key="participate-section"
              className="pt-6 mt-6 border-t border-white/10 space-y-2"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              layout={false}
            >

        {isConnected && (
          <div className="mx-auto max-w-4xl grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <div className="glass p-3 rounded-lg border border-white/10">
              <div className="text-xs text-gray-300">Your MMM balance</div>
              <div className="mt-1 font-mono text-white text-sm">{tokenBalance} {stableContractData.tokenSymbol || 'MMM'}</div>
            </div>
          </div>
        )}

              <h2 className="text-2xl font-bold flex items-center" style={{ color: 'var(--primary)' }}>
                <FaEthereum className="mr-2" style={{ color: 'var(--primary)' }} /> Participate
              </h2>




	              {lastContribution && (
	                  <div className={`flex items-start justify-between p-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 backdrop-blur-xl ${containerFlash ? 'flash flash-emerald' : ''}`}>
	                    <div className="">
	                      <p className="text-emerald-300 font-semibold">Participation confirmed</p>
                          <div className="text-xs text-emerald-300/80">Phase {lastContribution.phase}</div>

	                      <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
	                        <div>
	                          <div className="text-gray-300">You sent</div>
	                          <div className="font-mono text-white"><ToggleDecimals value={lastContribution.amountEth.toString()} /> ETH</div>
	                        </div>
	                        <div>
	                          <div className="text-gray-300">Current est. reward</div>
	                          <div className={`font-mono text-white ${estRewardFlash ? 'flash-text' : ''}`}><ToggleDecimals value={contractData.estimatedReward} /> MMM</div>
	                        </div>
	                        <div>
	                          <div className="text-gray-300">Your share</div>
	                          <div className={`font-mono text-white ${shareFlash ? 'flash-text' : ''}`}>{(() => { const total = parseFloat(contractData.totalTokensThisPhase) || 0; const est = parseFloat(contractData.estimatedReward) || 0; return total > 0 ? `${((est / total) * 100).toFixed(1)}%` : "—"; })()}</div>
	                        </div>
	                        <div>
                          <div className="text-gray-300">{optimizedData.isTimeBased ? 'Time left' : 'Blocks left'}</div>
                          <div className={`font-mono text-white ${blocksLeftFlash ? 'flash-text' : ''}`}>
                            {blocksLeftDisplay}
                          </div>


	                        </div>
	                      </div>
	                      <a
	                        href={`${getExplorerBase(activeNetwork)}/tx/${lastContribution.txHash}`}
	                        target="_blank"
	                        className="mt-3 inline-block text-xs underline transition-colors"
                        style={{ color: 'var(--primary)' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--primary)'}
	                      >
	                        View transaction
	                      </a>
	                    </div>
	                    <button
	                      type="button"
	                      onClick={() => setLastContribution(null)}
	                      className="ml-4 text-emerald-300/70 hover:text-emerald-200 text-sm"
	                    >
	                      Dismiss
	                    </button>
	                  </div>
	              )}

              <input
                type="number"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                className="w-full p-3 rounded-lg text-white transition-all"
                style={{
                  backgroundColor: 'var(--glass-bg)',
                  border: `1px solid var(--glass-border)`,
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)'
                }}
                step="0.01"
                min={minContributionEth}
                placeholder={`Enter ETH amount (min ${minContributionEth})`}
                disabled={!isConnected || isSending || stableContractData.isLaunchComplete || !hasStableData}
              />
              <div className="mt-3 flex gap-2 flex-wrap">
                {[0.01, 0.05, 0.1].map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setEthAmount(v.toString())}
                    className="px-3 py-1.5 text-xs rounded-lg transition"
                    style={{
                      backgroundColor: 'var(--glass-bg)',
                      border: `1px solid var(--glass-border)`,
                      color: 'var(--foreground)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)'
                    }}
                    disabled={!isConnected || isSending || stableContractData.isLaunchComplete || !hasStableData}
                    title={!isConnected ? "Connect wallet to set amount" : (stableContractData.isLaunchComplete ? "Launch complete" : (!hasStableData ? "Waiting for validated blockchain data..." : undefined))}
                  >
                    {v} ETH
                  </button>
                ))}
              </div>

	              <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
	                <div className="grid grid-cols-2 gap-3 text-xs">
	                  <div className="text-gray-300">Current Contribution</div>
	                  <div className={`font-mono text-white ${userContribFlash ? 'flash-text' : ''}`}>
	                    {isInitialLoading && !hasInitialLoad ? (
	                      <span className="inline-block h-4 w-16 bg-gray-700/60 rounded animate-pulse" />
	                    ) : (
	                      <><ToggleDecimals value={contractData.userCurrentPhaseContributions} /> ETH</>
	                    )}
	                  </div>
	                  <div className="text-gray-300">Est. Reward Now</div>
	                  <div className={`font-mono text-white ${estRewardFlash ? 'flash-text' : ''}`}>
	                    {isInitialLoading && !hasInitialLoad ? (
	                      <span className="inline-block h-4 w-20 bg-gray-700/60 rounded animate-pulse" />
	                    ) : (
	                      <><ToggleDecimals value={contractData.estimatedReward} /> MMM</>
	                    )}
	                  </div>
	                  <div className="text-gray-300">Your Share</div>
	                  <div className={`font-mono text-white ${shareFlash ? 'flash-text' : ''}`}>
	                    {isInitialLoading && !hasInitialLoad ? (
	                      <span className="inline-block h-4 w-12 bg-gray-700/60 rounded animate-pulse" />
	                    ) : (
	                      (() => {
	                        const total = parseFloat(contractData.totalTokensThisPhase) || 0;
	                        const est = parseFloat(contractData.estimatedReward) || 0;
	                        return total > 0 ? `${((est / total) * 100).toFixed(1)}%` : "—";
	                      })()
	                    )}
	                  </div>
	                  <div className="text-gray-300">{optimizedData.isTimeBased ? 'Time left' : 'Blocks left'}</div>
	                  <div className={`font-mono text-white ${blocksLeftFlash ? 'flash-text' : ''}`}>
	                    {isInitialLoading && !hasInitialLoad ? (
	                      <span className="inline-block h-4 w-8 bg-gray-700/60 rounded animate-pulse" />
	                    ) : (
	                      blocksLeftDisplay
	                    )}
	                  </div>
	                </div>
	              </div>

              {(txMessage || errorMessage) && (
                <div className="mt-3 p-3 rounded-lg flex items-center justify-between" style={{
                  backgroundColor: txMessage?.includes("failed") || errorMessage?.includes("Error") ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                  border: `1px solid ${txMessage?.includes("failed") || errorMessage?.includes("Error") ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`
                }}>
                  <p className="text-sm" style={{
                    color: txMessage?.includes("failed") || errorMessage?.includes("Error") ? '#ef4444' : '#3b82f6'
                  }}>
                    {txMessage || errorMessage}
                  </p>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTxMessage(null);
                      setErrorMessage(null);
                    }}
                    className="ml-3 text-xs px-2 py-1 rounded transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{
                      backgroundColor: 'var(--glass-bg)',
                      border: `1px solid var(--glass-border)`,
                      color: 'var(--foreground)'
                    }}
                    type="button"
                  >
                    Dismiss
                  </button>
                </div>
              )}
              <button
                onClick={sendEth}
                disabled={!isConnected || isSending || stableContractData.isLaunchComplete || !hasStableData}
                title={!isConnected ? "Connect wallet to participate" : (stableContractData.isLaunchComplete ? "Launch complete" : (!hasStableData ? "Waiting for validated blockchain data..." : (isSending ? "Processing..." : undefined)))}
                className="mt-4 w-full py-3 rounded-lg disabled:bg-gray-600 transition-all font-semibold"
                style={{
                  background: (!isConnected || isSending || stableContractData.isLaunchComplete || !hasStableData)
                    ? '#6b7280'
                    : `linear-gradient(to right, var(--primary), var(--accent))`,
                  color: '#ffffff'
                }}
              >
                {isSending ? "Processing..." : "Send ETH"}
              </button>
              {isConnected && contractData.pendingPhaseParticipants.length > 0 && (
                <div className="mt-4 text-sm">
                  <p className="text-gray-300 font-semibold">Pending Contributions:</p>
                  {contractData.pendingPhaseParticipants.map((p, index) => (
                    <div key={p.txHash || index} className="mt-2">
                      <p>{p.address?.slice(0, 6)}...{p.address?.slice(-4)}</p>
                      <p>Contribution: <ToggleDecimals value={p.value.toString()} /> ETH</p>
                      <p>
                        Estimated Reward: <ToggleDecimals value={p.tokens!.toString()} /> MMM
                        {p.isPending && " (Pending)"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {hydrated && !isConnected && (
                <p className="mt-4 text-gray-400 text-sm">Connect wallet to participate.</p>
              )}
            </motion.div>
            {isConnected && (
              <motion.div
                key="mint-section"
                className="pt-6 mt-6 border-t border-white/10"
              >
                {(!hasStableData || !hasInitialUserFetch) && isConnected ? (
                  <MintTokensLoading />
                ) : (
                  <>
                    {contractData.mintablePhases.length === 0 && contractData.mintedPhases.length === 0 ? (
                      <>
                        <h2 className="text-2xl font-bold mb-4 flex items-center" style={{ color: 'var(--accent)' }}>
                          <FaCoins className="mr-2" style={{ color: 'var(--accent)' }} /> Mint Tokens
                        </h2>
                        {isConnected && (
                          <div className="mb-2 text-xs text-gray-300">
                            Wallet balance: <span className="font-mono text-white">{tokenBalance} {stableContractData.tokenSymbol || 'MMM'}</span>
                          </div>
                        )}
                        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
                          <div className="font-semibold mb-1">Not available yet</div>
                          <p>Minting becomes available after your participated phase ends.</p>
                          {(() => {
                            const usingTime = Boolean(optimizedData.isTimeBased && optimizedData.launchTimestamp && optimizedData.phaseDuration);
                            if (!usingTime) return null;
                            // Find the earliest unminted phase you participated in
                            const contributedPhases: number[] = contractData.phaseContributions
                              .map((v, idx) => ({ idx, val: parseFloat(v) }))
                              .filter(p => p.val > 0)
                              .map(p => p.idx);
                            const unminted = contributedPhases
                              .filter(p => !contractData.mintedPhases.includes(p))
                              .sort((a, b) => a - b);
                            if (unminted.length === 0) return null;
                            const targetPhase = unminted[0];
                            // Calculate phase end time correctly
                            // For time-based contracts, use the same calculation as in fetchUserContractData
                            // Note: Phase 0 may have different duration, but we'll use phaseDuration for simplicity
                            // In production, you might want to fetch phaseEndTs from contract
                            const launchTs = Number(optimizedData.launchTimestamp || 0);
                            const phaseDuration = Number(optimizedData.phaseDuration || 0);
                            // Simple calculation: each phase after 0 uses phaseDuration
                            // Phase 0 end = launch + phaseDuration, Phase 1 end = launch + 2*phaseDuration, etc.
                            const phaseEndTs = launchTs + (targetPhase + 1) * phaseDuration;
                            return (
                              <div className="mt-1 text-xs text-gray-400">
                                Phase {targetPhase} ends at <span className="font-mono text-white">{new Date(phaseEndTs * 1000).toLocaleString()}</span>
                                <span className="ml-2">{formatRelative(phaseEndTs)}</span>
                              </div>
                            );
                          })()}
                        </div>
                      </>
                    ) : (
                      <>
                        <h2 className="text-2xl font-bold mb-4 flex items-center" style={{ color: 'var(--accent)' }}>
                          <FaCoins className="mr-2" style={{ color: 'var(--accent)' }} /> Mint Tokens
                        </h2>
                        {isConnected && (
                          <div className="mb-2 text-xs text-gray-300">
                            Wallet balance: <span className="font-mono text-white">{tokenBalance} {stableContractData.tokenSymbol || 'MMM'}</span>
                          </div>
                        )}
                        <div className="space-y-4">
                          {contractData.mintablePhases.length > 0 && (
                            <>
                              <p className="text-gray-300 text-sm">Available to Mint (Total: {abbreviateNumber(totalMintableTokens)} MMM):</p>
                              {contractData.mintablePhases
                                .filter((phase) => {
                                  const usingTime = Boolean(optimizedData.isTimeBased && optimizedData.launchTimestamp && optimizedData.phaseDuration && typeof stableContractData.currentPhase === 'number');
                                  return usingTime ? (phase < stableContractData.currentPhase) : true;
                                })
                                .map((phase) => {
                                // Use contract's getEligibleTokens result if available (source of truth)
                                const eligibleFromContract = contractData.phaseEligibleTokens[phase];
                                let mintableAmount = 0;
                                if (eligibleFromContract !== undefined) {
                                  mintableAmount = parseFloat(eligibleFromContract);
                                } else {
                                  // Fallback calculation (shouldn't happen if data is fetched correctly)
                                  const userContrib = parseFloat(contractData.phaseContributions[phase]);
                                  const totalContrib = contractData.historicalData[phase]?.contributions || 1;
                                  const phaseTokens = parseFloat(contractData.historicalPhaseTokens[phase] || (PHASES[phase]?.amount ?? "0"));
                                  mintableAmount = (userContrib / totalContrib) * phaseTokens;
                                }
                                const isPhaseMinting = isMinting.get(phase) || false;
                                // Stabilize disabled state to prevent flickering - only check stable data, not loading states
                                const isDisabled = !hasStableData || isPhaseMinting || (isMinting.get(-1) || false);
                                return (
                                  <button
                                    key={phase}
                                    onClick={() => mintTokens(phase)}
                                    disabled={isDisabled}
                                    title={!hasStableData ? "Waiting for validated blockchain data..." : (isPhaseMinting ? "Minting in progress" : undefined)}
                                    className={`w-full py-2.5 px-4 rounded-lg font-semibold text-white transition-all duration-200 ${
                                      isDisabled 
                                        ? 'bg-gray-600 cursor-not-allowed' 
                                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:shadow-lg active:scale-[0.98] cursor-pointer'
                                    }`}
                                  >
                                    <span className="flex items-center justify-center gap-2">
                                      {isPhaseMinting ? (
                                        <>
                                          <span className="animate-spin inline-block">⏳</span>
                                          <span>Minting...</span>
                                        </>
                                      ) : (
                                        <>
                                          <FaCoins className="text-lg" />
                                          <span>Mint Phase {phase} ({abbreviateNumber(mintableAmount)} MMM)</span>
                                        </>
                                      )}
                                    </span>
                                  </button>
                                );
                              })}
                              <button
                                onClick={multiMint}
                                disabled={!hasStableData || (isMinting.get(-1) || false)}
                                title={!hasStableData ? "Waiting for validated blockchain data..." : ((isMinting.get(-1) || false) ? "Minting in progress" : undefined)}
                                className="w-full py-2 bg-purple-600 rounded-lg hover:bg-purple-700 disabled:bg-gray-600 transition-all font-medium"
                              >
                                {isMinting.get(-1) ? "Minting All..." : `Mint All (${abbreviateNumber(totalMintableTokens)} MMM)`}
                              </button>
                            </>
                          )}
                          {contractData.mintedPhases.length > 0 && (
                            <>
                              <p className="text-gray-300 text-sm mt-4">Previously Minted:</p>
                              {contractData.mintedPhases.map((phase) => {
                                // Use historical data minted amount if available, otherwise calculate
                                const mintedAmount = contractData.historicalData[phase]?.minted || 0;
                                const phaseTokens = parseFloat(contractData.historicalPhaseTokens[phase] || (PHASES[phase]?.amount ?? "0"));
                                const userContrib = parseFloat(contractData.phaseContributions[phase]);
                                const totalContrib = contractData.historicalData[phase]?.contributions || 1;
                                const calculatedMinted = mintedAmount > 0 
                                  ? mintedAmount 
                                  : (userContrib / totalContrib) * phaseTokens;
                                return (
                                  <p key={phase} className="text-gray-400 text-sm">
                                    Phase {phase} - Minted {abbreviateNumber(calculatedMinted)} MMM
                                  </p>
                                );
                              })}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </motion.div>
            )}


          </div>

          <div className="space-y-8">
            <PhaseProgress
              currentPhase={stableContractData.currentPhase}
              isLaunchComplete={stableContractData.isLaunchComplete}
              totalProgress={totalProgressBasedOnPhases}
              phaseProgress={launchPhaseEndProgress}
              blocksSinceLaunch={blocksSinceLaunch}
              totalBlocks={TOTAL_BLOCKS}
              blocksLeft={blocksLeftNum}
              isLoading={!hasStableData && (optimizedData.isLoading || !hasValidatedData)}
              totalTokensThisPhase={stableContractData.totalTokensThisPhase}
              userCurrentPhaseContributions={contractData.userCurrentPhaseContributions}
              estimatedReward={contractData.estimatedReward}
              isConnected={isConnected}
              userParticipated={userParticipated}
              userContribFlash={userContribFlash}
              estRewardFlash={estRewardFlash}
              totalProgFlash={totalProgFlash}
              phaseProgFlash={phaseProgFlash}
              participantsCount={stableContractData.participantsCount}
              participantsFlash={participantsFlash}
              phaseStartBlock={phaseStartBlock}
              phaseEndBlock={phaseEndBlock}
              // Time-based (MMM_02)
              isTimeBased={optimizedData.isTimeBased}
              launchTimestamp={optimizedData.launchTimestamp}
              scheduleEndTs={optimizedData.scheduleEndTs}
              currentPhaseStartTs={optimizedData.currentPhaseStartTs}
              currentPhaseEndTs={optimizedData.currentPhaseEndTs}
              phaseCount={optimizedData.phaseCount}
              nextPhase={optimizedData.nextPhase}
              nextPhaseStartTs={optimizedData.nextPhaseStartTs}
              nextPhaseEndTs={optimizedData.nextPhaseEndTs}
              nextPhaseAllocation={optimizedData.nextPhaseAllocation}
            />

            <div className="pt-6 ">
              {!stableContractData.isLaunchComplete ? (
                (!hasStableData || !optimizedData.hasPhaseData) ? (
                  <PhaseParticipantsLoading />
                ) : (
                  <PieChartCard
                    title={`Participants (Phase ${stableContractData.currentPhase})`}
                    icon={<FaUsers className="text-blue-400" />}
                    data={stableContractData.phaseParticipants}
                    totalTokens={stableContractData.totalTokensThisPhase}
                    currentPhase={stableContractData.currentPhase}
                  />
                )
              ) : (
                <div className="gap-4 flex flex-col">
                  {stableContractData.historicalPhaseParticipants.slice(0, 3).map((participants, index) => (
                    <PieChartCard
                      key={index}
                      title=""
                      icon={<></>}
                      data={participants}
                      totalTokens={contractData.historicalPhaseTokens?.[index] || PHASES[index]?.amount || '0'}
                      currentPhase={index}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Project Stats - Full Width Section */}
        <div className="mt-12">
          <ProjectStats
            totalMinted={stableContractData.totalMinted}
            totalContributions={stableContractData.totalContributions}
            totalParticipants={stableContractData.totalParticipants}
            totalTokensThisPhase={stableContractData.totalTokensThisPhase}
            currentPhaseContributions={stableContractData.currentPhaseContributions}
            participantsCount={stableContractData.participantsCount}
            isLoading={!hasStableData && (optimizedData.isLoading || !hasPublicLight)}
            isValidated={hasStableData || hasValidatedData}
            totalParticipantsFlash={totalParticipantsFlash}
            participantsFlash={participantsFlash}
          />
          <div className="glass w-full p-4 sm:p-6 lg:p-8 ring-white/10 space-y-8">

            <div className="">
              {hasPublicDetails || hasStableData ? (
                <ResponsiveGrid cols={{ default: 1, lg: 2 }} gap="lg">
                  <div>
                    {!hasStableData && optimizedData.isLoading ? (
                      <ChartLoading title="Global Contributions" />
                    ) : (
                      <PieChartCard
                        title="Global Contributions"
                        icon={<FaUsers style={{ color: 'var(--primary)' }} />}
                        data={stableContractData.totalParticipantsData}
                        totalTokens={stableContractData.totalMinted}
                      />
                    )}
                  </div>
                  <aside aria-label="Top Contributors" className="glass p-4">
                    <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--secondary)' }}>Top Contributors</h3>
                    {(!hasStableData && optimizedData.isLoading) ? (
                      <p className="text-gray-400">Loading...</p>
                    ) : (
                      (() => {
                      const total = parseFloat(stableContractData.totalContributions) || 0;
                      const sliceCount = showMoreTop ? 20 : 5;
                      const participantsData = stableContractData.totalParticipantsData;
                      const top = [...participantsData]
                        .sort((a, b) => b.value - a.value)
                        .slice(0, sliceCount);
                      return (
                        <>
                          <ul className="space-y-3">
                            {top.map((p, idx) => (
                              <li key={idx}>
                                <div className="flex items-center justify-between text-sm">
                                  <button
                                    type="button"
                                    className="font-mono text-gray-300 hover:text-white hover:underline cursor-pointer"
                                    title="Click to copy address"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(p.address || p.name);
                                      } catch {}
                                    }}
                                  >
                                    {p.address ? `${p.address.slice(0, 6)}...${p.address.slice(-4)}` : p.name}
                                  </button>
                                  <span className="font-mono text-white">
                                    {`${p.value.toFixed(3)} ETH`}
                                  </span>
                                </div>
                                {total > 0 && (
                                  <div className="mt-2 h-2 rounded-full bg-gray-700/60 overflow-hidden">
                                    <div className="h-full" style={{
                                      background: `linear-gradient(to right, var(--primary), var(--accent))`,
                                      width: `${Math.min(100, (p.value / total) * 100).toFixed(1)}%`
                                    }} />
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-4 text-right">
                            <button
                              type="button"
                              className="text-xs px-3 py-1.5 rounded-lg transition"
                              style={{
                                backgroundColor: 'var(--glass-bg)',
                                border: `1px solid var(--glass-border)`,
                                color: 'var(--foreground)'
                              }}
                              onClick={() => setShowMoreTop(v => !v)}
                            >
                              {showMoreTop ? 'Show less' : 'Show more'}
                            </button>
                          </div>
                        </>
                      );
                    })() )}
                  </aside>
                </ResponsiveGrid>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Global Contributions Loading */}
                  <div className="glass p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-5 w-5 bg-gray-700/60 rounded animate-pulse" />
                      <div className="h-5 w-32 bg-gray-700/60 rounded animate-pulse" />
                    </div>
                    <div className="flex items-center justify-center h-48">
                      <div className="relative">
                        <div className="h-32 w-32 border-4 border-gray-700/60 rounded-full animate-pulse" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <div className="h-4 w-16 bg-gray-700/60 rounded animate-pulse mb-2" />
                            <div className="h-3 w-12 bg-gray-700/60 rounded animate-pulse" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top Contributors Loading */}
                  <div className="glass p-4">
                    <div className="h-5 w-28 bg-gray-700/60 rounded animate-pulse mb-4" />
                    <div className="space-y-3">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="h-4 w-20 bg-gray-700/60 rounded animate-pulse" />
                            <div className="h-4 w-16 bg-gray-700/60 rounded animate-pulse" />
                          </div>
                          <div className="h-2 bg-gray-700/60 rounded animate-pulse" />



                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-white/10">
              <div className="mb-3 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-500" />
                  <span className="text-xs text-gray-300">Realized</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />
                  <span className="text-xs text-gray-300">Unrealized</span>
                </div>
              </div>
              <div className="mb-4">
                {(() => {
                  const realized = parseFloat(contractData.totalMinted) || 0;
                  const cap = (contractData.historicalPhaseTokens && contractData.historicalPhaseTokens.length > 0)
                    ? contractData.historicalPhaseTokens.reduce((acc, t) => acc + (parseFloat(t || '0') || 0), 0)
                    : TOTAL_SUPPLY;
                  const pct = Math.min(100, Math.max(0, cap > 0 ? (realized / cap) * 100 : 0));
                  return (
                    <div className="h-2 rounded-full bg-gray-700/60 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${pct.toFixed(1)}%` }} />
                    </div>
                  );
                })()}
              </div>
              {(!hasStableData && optimizedData.isLoading) ? (
                <ChartLoading title="Supply Details" />
              ) : (
                (() => {
                  const cap = (contractData.historicalPhaseTokens && contractData.historicalPhaseTokens.length > 0)
                    ? contractData.historicalPhaseTokens.reduce((acc, t) => acc + (parseFloat(t || '0') || 0), 0)
                    : TOTAL_SUPPLY;
                  const realized = parseFloat(stableContractData.totalMinted) || 0;
                  const unrealized = Math.max(0, cap - realized);
                  return (
                    <PieChartCard
                      title="Supply Details"
                      icon={<FaCoins style={{ color: 'var(--accent)' }} />}
                      data={[
                        { name: "Realized", value: realized, tokens: realized },
                        { name: "Unrealized", value: unrealized, tokens: unrealized },
                      ]}
                      totalTokens={cap.toString()}
                      colors={["#4f46e5", "#d1d5db"]}
                      extraText={`Total Minted: ${abbreviateNumber(realized)} MMM`}
                    />
                  );
                })()
              )}
            </div>
          </div>
          </div>



        <Section ariaLabel="Staking" title="Stake MMM" icon={<FaLock className="mr-2" style={{ color: 'var(--primary)' }} /> }>
          {isConnected && (
            <>
              <div className="mb-3 text-xs text-gray-300">
                Your MMM balance: <span className="font-mono text-white">{tokenBalance} {stableContractData.tokenSymbol || 'MMM'}</span>
              </div>
              <div className="mb-4 text-[12px] text-gray-300 rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="font-semibold mb-1" style={{ color: 'var(--primary)' }}>How staking works</div>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Stake locks your MMM for the selected days. No partial exits.</li>
                  <li>At maturity, you can end stake during the grace period with no penalty.</li>
                  <li>Early exit before maturity applies an early-unstake penalty.</li>
                  <li>After grace ends, a late penalty accrues until you end the stake.</li>
                </ul>
              </div>
            </>
          )}
          <StakingInterface
            isConnected={isConnected}
            tokenSymbol={stableContractData.tokenSymbol || 'MMM'}
            totalStaked={totalStakedStr}
            defaults={{
              graceDays: Math.max(0, Math.round((gracePeriodSec || 0) / 86400)),
              earlyPenaltyMaxBps: stakingParams.earlyPenaltyMaxBps,
              latePenaltyBpsPerDay: stakingParams.latePenaltyRatePerDayBps,
              latePenaltyMaxBps: stakingParams.latePenaltyMaxBps,
              stakerRewardBps: stakingParams.stakerRewardBps,
              holderRewardBps: stakingParams.holderRewardBps,
              maxLockDays: stakingParams.maxLockDays,
              penaltyReceiverBps: stakingParams.penaltyReceiverBps,
              penaltyReceiverAddr: stakingParams.penaltyReceiver,
            }}
            onStake={onStake}
          />
        </Section>

        {isConnected && stakingContract && (
          <>
          <Section ariaLabel="Your Stakes" title="Your Stakes" icon={<FaLock className="mr-2" style={{ color: 'var(--primary)' }} /> }>
            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-col">
                <div className="text-sm text-gray-300">
                  {`${userStakes.length} stake${userStakes.length === 1 ? '' : 's'}`}
                  {showStakeRefreshing && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-gray-400">
                      <motion.span
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        refreshing
                      </motion.span>
                      <motion.span
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                      >
                        …
                      </motion.span>
                    </span>
                  )}
                </div>
                {userStakes.length > 0 && (
                  <>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">Active: <span className="font-semibold" style={{ color: 'var(--accent)' }}>{statusCounts.ACTIVE}</span></span>
                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">In grace: <span className="font-semibold" style={{ color: 'var(--primary)' }}>{statusCounts.IN_GRACE}</span></span>
                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">Late: <span className="font-semibold" style={{ color: '#eab308' }}>{statusCounts.LATE}</span></span>
                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">Closed: <span className="font-semibold" style={{ color: '#9ca3af' }}>{statusCounts.CLOSED}</span></span>
                      {nextMaturityTs && (
                        <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">Next maturity: <span className="font-semibold">{relativeLabel('maturity', nextMaturityTs)}</span></span>
                      )}
                    </div>
                    <div className="text-xs text-indigo-300">
                      Total pending rewards: <span className="font-mono text-white">{totalPendingRewards} {stableContractData.tokenSymbol || 'MMM'}</span>
                    </div>
                    <div className="text-xs text-gray-300">
                      Open staked: <span className="font-mono text-white">{openUserStaked} {stableContractData.tokenSymbol || 'MMM'}</span> • Avg lock: {avgLockDays} days
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={fetchUserStakes}
                disabled={isFetchingStakes}
                className="px-3 py-1.5 rounded-md text-sm font-semibold disabled:bg-gray-700"
                style={{ background: `linear-gradient(to right, var(--primary), var(--accent))` }}
              >
                Refresh
              </button>
            </div>



            {userStakes.length === 0 ? (
              <div className="text-sm text-gray-400">
                No stakes yet. Previous phase stats will show here.
              </div>
            ) : (
              <div className="space-y-3">
                {userStakes.map((s) => (
                  <div key={s.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="text-sm">
                        <div className="text-gray-400">Stake #{s.id}</div>
                        <div className="font-mono text-white">{s.amount} {stableContractData.tokenSymbol || 'MMM'}</div>
                        <div className="mt-1 text-xs text-gray-400">
                          <span>Status: </span>
                          <span className="font-semibold" style={{ color: s.status === 'ACTIVE' ? 'var(--accent)' : s.status === 'IN_GRACE' ? 'var(--primary)' : s.status === 'LATE' ? '#eab308' : '#9ca3af' }}>{s.status}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-gray-300">
                        <div className="rounded border border-white/10 p-2">
                          <div className="text-gray-400">Started</div>
                          <div className="font-mono text-white">{new Date(s.startTs * 1000).toLocaleString()}</div>
                          <div className="text-[10px] text-gray-400">{relativeLabel('starts', s.startTs)}</div>
                        </div>
                        <div className="rounded border border-white/10 p-2">
                          <div className="text-gray-400">Maturity</div>
                          <div className="font-mono text-white">{new Date(s.maturityTs * 1000).toLocaleString()}</div>
                          <div className="text-[10px] text-gray-400">{relativeLabel('maturity', s.maturityTs)}</div>
                        </div>
                        <div className="rounded border border-white/10 p-2">
                          <div className="text-gray-400">Grace ends</div>
                          <div className="font-mono text-white">{new Date(s.graceEndTs * 1000).toLocaleString()}</div>
                          <div className="text-[10px] text-gray-400">{relativeLabel('grace ends', s.graceEndTs)}</div>
                        </div>
                      </div>
                      {/* Progress and timeline */}
                      {(() => {
                        const now = Math.floor(Date.now() / 1000);
                        const lockTotal = Math.max(1, s.maturityTs - s.startTs);
                        const lockElapsed = Math.max(0, Math.min(now - s.startTs, lockTotal));
                        const lockPct = Math.max(0, Math.min(100, (lockElapsed / lockTotal) * 100));
                        const showGrace = (s.status === 'IN_GRACE' || s.status === 'LATE');
                        const graceTotal = Math.max(1, s.graceEndTs - s.maturityTs);
                        const graceElapsed = showGrace ? Math.max(0, Math.min(now - s.maturityTs, graceTotal)) : 0;
                        const gracePct = showGrace ? Math.max(0, Math.min(100, (graceElapsed / graceTotal) * 100)) : 0;
                        return (
                          <div className="mt-2 space-y-2">
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-gray-400">
                                <span>Progress to maturity</span>
                                <span>{lockPct.toFixed(1)}%</span>
                              </div>
                              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full transition-all duration-300" style={{ width: `${lockPct}%`, background: 'linear-gradient(to right, var(--primary), var(--accent))' }} />
                              </div>
                            </div>
                            {showGrace && (
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-gray-400">
                                  <span>Grace progress</span>
                                  <span>{gracePct.toFixed(1)}%</span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                  <div className="h-full transition-all duration-300" style={{ width: `${gracePct}%`, background: 'linear-gradient(to right, #f59e0b, #84cc16)' }} />
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-1 text-[10px] text-gray-400">
                              <div className={`px-2 py-0.5 rounded ${now < s.maturityTs ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-500/20 text-gray-400'}`}>Start</div>
                              <div className="flex-1 h-px bg-white/20" />
                              <div className={`px-2 py-0.5 rounded ${(now >= s.maturityTs && now < s.graceEndTs) ? 'bg-green-500/20 text-green-300' : (now < s.maturityTs ? 'bg-gray-500/20 text-gray-400' : 'bg-green-500/20 text-green-300')}`}>Maturity</div>
                              <div className="flex-1 h-px bg-white/20" />
                              <div className={`px-2 py-0.5 rounded ${now >= s.graceEndTs ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-500/20 text-gray-400'}`}>Grace End</div>
                            </div>
                            <div className="text-[10px] text-gray-400">
                              Est. completion: <span className="text-white">{new Date(s.graceEndTs * 1000).toLocaleString()}</span>
                              <span className="ml-2">{relativeLabel('grace ends', s.graceEndTs)}</span>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex items-center gap-2">
                        {(s.status === 'IN_GRACE' || s.status === 'LATE') && !s.closed && (
                          <button
                            type="button"
                            onClick={() => handleUnstake(s.id)}
                            className="px-3 py-1.5 rounded-md text-sm font-semibold"
                            style={{ background: `linear-gradient(to right, var(--primary), var(--accent))` }}
                          >
                            Unstake
                          </button>
                        )}
                        {s.status === 'ACTIVE' && !s.closed && (
                          <button
                            type="button"
                            onClick={() => handleEmergencyExit(s.id)}
                            className="px-3 py-1.5 rounded-md text-sm font-semibold bg-amber-600/80 hover:bg-amber-600"
                          >
                            Emergency Exit
                          </button>
                        )}
                        {s.pendingRewardsWei > 0n && (
                          <button
                            type="button"
                            onClick={() => handleClaimRewards()}
                            className="px-3 py-1.5 rounded-md text-sm font-semibold bg-indigo-600/80 hover:bg-indigo-600"
                          >
                            Claim Rewards ({s.pendingRewards})
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section ariaLabel="Holders" title="Token Holders (beta)" icon={<FaUsers className="mr-2" style={{ color: 'var(--primary)' }} /> }>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-gray-300">
                {holders.length > 0 ? `Top ${Math.min(holders.length, 10)} holders` : 'Load a snapshot of current holders'}
                {holdersTotalSupply > 0n && (
                  <span className="ml-2 text-gray-400">Total supply: <span className="font-mono text-white">{ethers.formatUnits(holdersTotalSupply, tokenDecimals)}</span> {stableContractData.tokenSymbol || 'MMM'}</span>
                )}
              </div>
              <button
                type="button"
                onClick={fetchHolders}
                disabled={holdersLoading}
                className="px-3 py-1.5 rounded-md text-xs font-semibold disabled:bg-gray-700"
                style={{ background: `linear-gradient(to right, var(--primary), var(--accent))` }}
              >
                {holdersLoading ? 'Loading…' : 'Load holders'}
              </button>
            </div>
            {holders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-gray-400">
                    <tr>
                      <th className="py-1 pr-3">Rank</th>
                      <th className="py-1 pr-3">Address</th>
                      <th className="py-1 pr-3">Quantity</th>
                      <th className="py-1 pr-3">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holders.slice(0, 20).map((h, idx) => {
                      const qty = ethers.formatUnits(h.balance, tokenDecimals);
                      const pct = holdersTotalSupply > 0n ? ((Number(qty) / Number(ethers.formatUnits(holdersTotalSupply, tokenDecimals))) * 100).toFixed(2) : '—';
                      return (
                        <tr key={h.address} className="border-t border-white/10">
                          <td className="py-1 pr-3 text-gray-300">{idx + 1}</td>
                          <td className="py-1 pr-3 font-mono text-white">{shortAddr(h.address)}</td>
                          <td className="py-1 pr-3 font-mono text-white">{qty} {stableContractData.tokenSymbol || 'MMM'}</td>
                          <td className="py-1 pr-3 text-gray-300">{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-gray-400">No snapshot loaded yet.</div>
            )}
          </Section>
          </>


        )}


        {isConnected && (


          <Section ariaLabel="Your History" title="Your History" icon={<FaUsers className="mr-2" style={{ color: 'var(--primary)' }} />}>
              <div className="">
                <div className="glass p-3 hover:shadow-2xl transition-shadow duration-300">
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                    <FaEthereum style={{ color: 'var(--accent)' }} />
                    <span>Total Contributions</span>
                  </div>
                  <div className="mt-1.5 font-mono" style={{ color: 'var(--foreground)' }}>{(isConnected && !hasInitialUserFetch) ? '—' : `${totalUserContributions.toFixed(4)} ETH`}</div>
                </div>
                {(() => {
                  const totalMintedUser = (contractData.historicalData || []).reduce((s, x) => s + (x.minted || 0), 0);
                  return (
                    <div className="glass p-3 hover:shadow-2xl transition-shadow duration-300">
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                        <FaCoins style={{ color: 'var(--secondary)' }} />
                        <span>Your Realized MMM</span>
                      </div>
                      <div className="mt-1.5 font-mono" style={{ color: 'var(--foreground)' }}>{(isConnected && !hasInitialUserFetch) ? '—' : `${abbreviateNumber(totalMintedUser)} MMM`}</div>
                    </div>
                  );
                })()}
                <div className="glass p-3 hover:shadow-2xl transition-shadow duration-300">
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                    <FaCoins style={{ color: 'var(--primary)' }} />
                    <span>Estimated Reward</span>
                  </div>
                  <div className="mt-1.5 font-mono" style={{ color: 'var(--foreground)' }}><ToggleDecimals value={contractData.estimatedReward} /> MMM</div>
                </div>
              </div>

              <div className="">
                <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Unique Contributors (All-time)</h3>
                <div className="text-xs mb-3" style={{ color: 'var(--muted)' }}>Count: {uniqueContributors.length}</div>
                {uniqueContributors.length > 0 ? (
                  <ul className="max-h-48 overflow-y-auto divide-y divide-white/5 glass p-3 rounded-lg">
                    {uniqueContributors.slice(0, 120).map((addr) => (
                      <li key={addr} className="py-1.5">
                        <button
                          type="button"
                          className="font-mono hover:underline transition-colors"
                          style={{ color: 'var(--muted)' }}
                          title="Click to copy address"
                          onClick={async () => { try { await navigator.clipboard.writeText(addr); } catch {} }}
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted)'}
                        >
                          {addr.length === 42 ? `${addr.slice(0,6)}...${addr.slice(-4)}` : addr}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs glass p-3 rounded-lg" style={{ color: 'var(--muted)' }}>No contributors yet.</div>
                )}
              </div>

            {(isConnected && !hasInitialUserFetch) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <ChartLoading title="Your Contributions" />
                <ChartLoading title="Minted Tokens" />
                <ChartLoading title="Contributions" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <PieChartCard
                  title="Your Contributions"
                  icon={<FaEthereum className="text-indigo-400" />}
                  data={stablePieData}
                  extraText={`Total Contributions: ${totalUserContributions.toFixed(4)} ETH`}
                />
                <MintedTokensChart data={contractData.historicalData.filter(d => Number(d.phase) <= stableContractData.currentPhase)} />
                <ContributionsChart data={contractData.historicalData.filter(d => Number(d.phase) <= stableContractData.currentPhase)} />
              </div>
            )}
          </Section>
        )}

        {!stableContractData.isLaunchComplete && (
          <Section ariaLabel="Historical Phases" title="Historical Phases" icon={<FaChartLine className="mr-2" style={{ color: 'var(--primary)' }} /> }>
            {(() => {
              const rows = (() => {
                if (optimizedData.isTimeBased && optimizedData.launchTimestamp) {
                  const count = Math.max(0, Number(stableContractData.currentPhase) || 0);
                  const arr: { phase: number; progress: number; blocksPassed: number; totalBlocks: number; displayUnit?: string }[] = [];
                  
                  // Phase durations from deployment: Phase 0-4: 15 min (900 sec), Phase 5-6: 1 hour (3600 sec)
                  // Default: use PHASE_DURATION
                  const phase0Duration = 900; // 15 minutes
                  const phase5PlusDuration = 3600; // 1 hour
                  const defaultDuration = optimizedData.phaseDuration || 86400; // Default phase duration
                  
                  for (let i = 0; i < count; i++) {
                    // Determine actual phase duration
                    let phaseDurationSec: number;
                    if (i === 0) {
                      phaseDurationSec = phase0Duration; // 15 min
                    } else if (i >= 1 && i <= 4) {
                      phaseDurationSec = phase0Duration; // 15 min (phases 1-4)
                    } else if (i >= 5) {
                      phaseDurationSec = phase5PlusDuration; // 1 hour (phases 5+)
                    } else {
                      phaseDurationSec = defaultDuration; // Fallback to default
                    }
                    
                    // Convert to appropriate display units
                    const displayValue = phaseDurationSec < 3600 
                      ? Math.round(phaseDurationSec / 60) // Show minutes if less than 1 hour
                      : phaseDurationSec < 86400
                      ? Math.round(phaseDurationSec / 3600) // Show hours if less than 1 day
                      : Math.round(phaseDurationSec / 86400); // Show days otherwise
                    
                    const displayUnit = phaseDurationSec < 3600 
                      ? 'min'
                      : phaseDurationSec < 86400
                      ? 'hr'
                      : 'days';
                    
                    arr.push({ 
                      phase: i, 
                      progress: 100, 
                      blocksPassed: displayValue, 
                      totalBlocks: displayValue,
                      displayUnit: displayUnit
                    });
                  }
                  return arr;
                }
                return contractData.historicalPhaseProgress.filter((p) => p.phase < stableContractData.currentPhase);
              })();
              if (rows.length === 0) {
                return (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
                    <div className="font-semibold mb-1">No completed phases yet</div>
                    <p>Previous phases stats will appear here once a phase finishes.</p>
                  </div>
                );
              }
              return (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400">
                        <th className="py-2 pr-4">Phase</th>
                        <th className="py-2 pr-4">Progress</th>
                        <th className="py-2 pr-4">Time</th>
                        <th className="py-2 pr-4">Tokens</th>
                        <th className="py-2 pr-4">Participants</th>
                      </tr>
                    </thead>
                    <tbody className="text-white/90">
                      {rows.map((p) => {
                        const displayUnit = (p as { phase: number; progress: number; blocksPassed: number; totalBlocks: number; displayUnit?: string }).displayUnit || (optimizedData.isTimeBased ? 'days' : 'blocks');
                        const timeDisplay = optimizedData.isTimeBased 
                          ? `${p.blocksPassed} ${displayUnit}`
                          : `${p.blocksPassed} / ${p.totalBlocks} ${displayUnit}`;
                        return (
                          <tr key={p.phase} className="border-t border-white/10">
                            <td className="py-2 pr-4">Phase {p.phase}</td>
                            <td className="py-2 pr-4">{Math.round(p.progress)}%</td>
                            <td className="py-2 pr-4">{timeDisplay}</td>
                            <td className="py-2 pr-4">{contractData.historicalPhaseTokens[p.phase] || (PHASES[p.phase]?.amount ?? '0')} {stableContractData.tokenSymbol || 'MMM'}</td>
                            <td className="py-2 pr-4">{(stableContractData.historicalPhaseParticipants[p.phase] || []).length}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </Section>
        )}

      </div>
    </main>
  );
}

// Wrap Dashboard with ErrorBoundary to prevent crashes
export default function DashboardWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  );
}