// app/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { FaEthereum, FaChartLine, FaCoins, FaUsers, FaChevronDown, FaChevronUp, FaStream } from "react-icons/fa";
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
import { CONTRACT_ADDRESSES } from "../lib/wagmi";
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
const MINIMUM_ETH = "0.001";
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

// ABI
const ABI = [
  "function totalSupply() view returns (uint256)",
  "function launchBlock() view returns (uint256)",
  "function getCurrentPhase() view returns (uint256)",
  "function contributions(uint256 phase, address user) view returns (uint256)",
  "function totalContributions(uint256 phase) view returns (uint256)",
  "function mintUserShare(uint256 phase)",
  "function mintMultipleUserShares()",
  "function hasMinted(uint256 phase, address user) view returns (bool)",
  "function getPhaseContributors(uint256 phase) view returns (address[])",
  "function phases(uint256) view returns (uint256, uint256, uint256)",
  "function withdraw()",
  "function getEligibleTokens(uint256 phase, address user) view returns (uint256)",
  "event ContributionReceived(address indexed contributor, uint256 phase, uint256 amount)",
  "event TokensMinted(address indexed user, uint256 phase, uint256 amount)"
] as const;

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
}: {
  phase: number;
  progress: number;
  blocksPassed: number;
  totalBlocks: number;
  totalTokens: string;
  participants: PieData[];
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
            Progress: {Math.round(progress)}% ({blocksPassed} / {totalBlocks} blocks)
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
              <span>Blocks</span>
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
export default function Dashboard() {

  const [ethAmount, setEthAmount] = useState("0.001");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
  const hasOptimizedData = optimizedData.isValidated && !optimizedData.isLoading;

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
    estimatedReward: "0",
    phaseContributions: Array(PHASES.length).fill("0"),
    participantsCount: 0,
    totalParticipants: 0,
    currentPhaseContributions: "0",
    userCurrentPhaseContributions: "0",
    totalTokensThisPhase: PHASES[0].amount,
    phaseParticipants: [] as PieData[],
    totalParticipantsData: [] as PieData[],
    pendingPhaseParticipants: [] as PieData[],
    historicalData: [] as HistoricalData[],
    historicalPhaseParticipants: [] as PieData[][],
    historicalPhaseProgress: [] as { phase: number; progress: number; blocksPassed: number; totalBlocks: number }[],
    isLaunchComplete: false,
    codeSize: 0,
    providerChainId: 0,
    tokenName: "",
    tokenSymbol: "",
  });
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [hasInitialUserFetch, setHasInitialUserFetch] = useState(false);

  const [hasPublicLight, setHasPublicLight] = useState(false);
  const [hasPublicDetails, setHasPublicDetails] = useState(false);
  const [hasValidatedData, setHasValidatedData] = useState(false);
  const [showMoreTop, setShowMoreTop] = useState(false);

  const isFetchingPublicRef = useRef(false);
  const isFetchingUserRef = useRef(false);






  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const { data: walletClient } = useWalletClient();
  const { sendTransaction, isSuccess, error: rawTxError, data: txData } = useSendTransaction();
  const txError = rawTxError as Error | null;

  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);

  // Flash triggers for frequently changing values
  const estRewardFlash = useFlashOnChange(contractData.estimatedReward, v => Number(v as unknown as string || 0).toFixed(4));
  const shareNow = (() => { const total = parseFloat(contractData.totalTokensThisPhase) || 0; const est = parseFloat(contractData.estimatedReward) || 0; return total > 0 ? ((est / total) * 100).toFixed(1) : ""; })();
  const shareFlash = useFlashOnChange(shareNow);
  const participantsFlash = useFlashOnChange(contractData.participantsCount);

  const userContribFlash = useFlashOnChange(contractData.userCurrentPhaseContributions, v => Number(v as unknown as string || 0).toFixed(4));
  const totalParticipantsFlash = useFlashOnChange(contractData.totalParticipants);

  // Stable data logic - use optimized data when available, fallback to old data
  const hasStableData = hasOptimizedData && optimizedData.hasBasicData && optimizedData.currentPhase >= 0;

  // CRITICAL: When optimized data is available, completely override contractData to prevent mixed states
  const stableContractData = hasStableData ? {
    currentPhase: optimizedData.currentPhase,
    totalMinted: optimizedData.totalMinted,
    totalContributions: optimizedData.totalContributions,
    totalParticipants: optimizedData.totalParticipants,
    totalParticipantsData: optimizedData.totalParticipantsData,
    participantsCount: optimizedData.participantsCount,
    totalTokensThisPhase: optimizedData.totalTokensThisPhase,
    currentPhaseContributions: optimizedData.currentPhaseContributions,
    isLaunchComplete: optimizedData.isLaunchComplete,
    blockNumber: optimizedData.blockNumber,
    launchBlock: optimizedData.launchBlock,
    tokenName: optimizedData.tokenName,
    tokenSymbol: optimizedData.tokenSymbol,
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

  const launchPhaseProgress =
    stableContractData.blockNumber && stableContractData.launchBlock > 0
      ? Math.min(((stableContractData.blockNumber - stableContractData.launchBlock) / TOTAL_BLOCKS) * 100, 100)
      : 0;
  const blocksSinceLaunch =
    stableContractData.launchBlock > 0
      ? Math.min(Math.max(0, stableContractData.blockNumber - stableContractData.launchBlock), TOTAL_BLOCKS)
      : 0;
  const userParticipated = parseFloat(contractData.userCurrentPhaseContributions) > 0 || contractData.pendingPhaseParticipants.length > 0;
  const phaseStartBlock = stableContractData.launchBlock + PHASES[stableContractData.currentPhase].start;
  const phaseEndBlock = stableContractData.launchBlock + PHASES[stableContractData.currentPhase].end;
  const blocksInPhase = phaseEndBlock - phaseStartBlock;
  const blocksPassedInPhase = Math.max(0, Math.min(stableContractData.blockNumber - phaseStartBlock, blocksInPhase));
  const launchPhaseEndProgress = blocksInPhase > 0 ? (blocksPassedInPhase / blocksInPhase) * 100 : 0;

  // Derived flashes after phase block math is available
  const blocksLeft = Math.max(0, blocksInPhase - blocksPassedInPhase);
  const blocksLeftFlash = useFlashOnChange(blocksLeft);
  const containerFlash = estRewardFlash || shareFlash || blocksLeftFlash;
  const totalProgFlash = useFlashOnChange(Math.round(launchPhaseProgress));
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

          const phaseTokens = parseFloat(PHASES[i].amount);

          const tokens =
            totalContrib > 0 && contractData.mintedPhases.includes(i)
              ? (userContrib / totalContrib) * phaseTokens
              : i === contractData.currentPhase && !contractData.isLaunchComplete
              ? parseFloat(contractData.estimatedReward)
              : 0;
          return { name: `Phase ${i}`, value: userContrib, tokens };
        })
        .filter((item) => item.value > 0),
    [contractData.phaseContributions, contractData.historicalData, contractData.mintedPhases, contractData.currentPhase, contractData.estimatedReward, contractData.isLaunchComplete]
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
    return contractData.mintablePhases.reduce((sum, phase) => {
      const userContrib = parseFloat(contractData.phaseContributions[phase]);
      const totalContrib = contractData.historicalData[phase]?.contributions || 1;
      const phaseTokens = parseFloat(PHASES[phase].amount);
      return sum + (userContrib / totalContrib) * phaseTokens;
    }, 0);
  }, [contractData.mintablePhases, contractData.phaseContributions, contractData.historicalData]);

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
          totalTokensThisPhase: PHASES[0].amount,
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
      if (launch0 > 0 && block0 >= launch0) {
        const since = Number(block0 - launch0);
        if (since >= TOTAL_BLOCKS) {
          derivedPhase = PHASES.length - 1;
        } else {
          for (let i = 0; i < PHASES.length; i++) {
            if (since >= PHASES[i].start && since < PHASES[i].end) { derivedPhase = i; break; }
          }
        }
      }
      const isLaunchCompleteQuick = launch0 > 0 && block0 >= launch0 + TOTAL_BLOCKS;
      setContractData((prev) => ({
        ...prev,
        providerChainId: providerChainId0,
        blockNumber: monotonicBlockPublic0,
        launchBlock: launch0,
        codeSize: codeSize0,
        currentPhase: derivedPhase,
        totalTokensThisPhase: PHASES[derivedPhase].amount,
        isLaunchComplete: isLaunchCompleteQuick,
      }));
      // Don't set hasPublicLight yet - wait for complete data

      // Parallelize critical data fetching for speed
      const [
        phase,
        minted,
        phaseTotals0,
        tokenIdentity
      ] = await Promise.all([
        publicContract.getCurrentPhase().then(p => Number(p) || 0),
        publicContract.totalSupply(),
        Promise.all(PHASES.map((_, i) => publicContract.totalContributions(i))),
        // Token identity (best-effort)
        Promise.all([
          publicContract.name().catch(() => ""),
          publicContract.symbol().catch(() => "")
        ])
      ]);

      const [tokenName0, tokenSymbol0] = tokenIdentity;
      const isLaunchComplete0 = launch0 > 0 && block0 >= launch0 + TOTAL_BLOCKS;
      const currentPhaseTotalContrib = phaseTotals0[phase] || BigInt(0);
      const totalContribAcross = phaseTotals0.reduce((acc, c) => acc + BigInt(c), BigInt(0));

      setContractData((prev) => ({
        ...prev,
        providerChainId: providerChainId0,
        tokenName: tokenName0 || prev.tokenName,
        tokenSymbol: tokenSymbol0 || prev.tokenSymbol,
        currentPhase: isLaunchComplete0 ? PHASES.length - 1 : phase,
        totalMinted: ethers.formatEther(minted),
        blockNumber: monotonicBlockPublic0,
        launchBlock: launch0,
        totalTokensThisPhase: PHASES[phase].amount,
        currentPhaseContributions: ethers.formatEther(currentPhaseTotalContrib),
        totalContributions: ethers.formatEther(totalContribAcross),
        isLaunchComplete: isLaunchComplete0,
        codeSize: codeSize0,
      }));

      // Only show data when we have validated, complete information
      setHasValidatedData(true);
      setHasPublicLight(true);

      const block = await publicProvider.getBlockNumber();
      const launch = Number(await publicContract.launchBlock()) || 0;
      const isLaunchComplete = launch > 0 && block >= launch + TOTAL_BLOCKS;

      let aggregatedTotalContrib = BigInt(0);
      const phaseContributions = Array(PHASES.length).fill("0");
      const phaseParticipantsData: PieData[] = [];
      const historicalPhaseParticipants: PieData[][] = Array(PHASES.length).fill([]);
      const historicalPhaseProgress: { phase: number; progress: number; blocksPassed: number; totalBlocks: number }[] = [];
      const allContributors: Map<string, PieData> = new Map();
      const historical: HistoricalData[] = [];

      // Fetch contributors for all phases in parallel
      const contributorLists = await Promise.all(
        PHASES.map((_, i) => publicContract.getPhaseContributors(i))
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


      for (let i = 0; i < PHASES.length; i++) {
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
              totalPhaseContrib > 0 && (i < phase || block > (launch + PHASES[i].end))
                ? (userShare / totalPhaseContrib) * parseFloat(PHASES[i].amount)
                : 0;
            const existing = allContributors.get(addr)!;
            existing.value += userShare;
            existing.tokens = (existing.tokens || 0) + tokenShare;

            if (i === phase && !isLaunchComplete) {
              const phaseTokenShare = totalPhaseContrib > 0 ? (userShare / totalPhaseContrib) * parseFloat(PHASES[i].amount) : 0;
              phaseParticipantsData.push({
                name: `${addr.slice(0, 6)}...`,
                value: userShare,
                address: addr,
                tokens: phaseTokenShare,
              });
            } else if (block > (launch + PHASES[i].end)) {
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
        const phaseStart = launch + PHASES[i].start;
        const phaseEnd = launch + PHASES[i].end;
        const blocksInPhase = phaseEnd - phaseStart;
        const blocksPassed = Math.min(Math.max(0, block - phaseStart), blocksInPhase);
        const progress = blocksInPhase > 0 ? (blocksPassed / blocksInPhase) * 100 : 0;
        historicalPhaseProgress.push({ phase: i, progress, blocksPassed, totalBlocks: blocksInPhase });

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
        totalTokensThisPhase: PHASES[phase].amount,
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
  }, [activeNetwork, publicProvider, contractData.blockNumber, isConnected, hasPublicDetails, hasOptimizedData]);

  const fetchUserContractData = useCallback(async () => {
    if (!contract || !provider || !account || isFetchingUserRef.current) return;
    isFetchingUserRef.current = true;
    try {
      const blockProvider = publicProvider ?? provider;
      // Resolve network + block + code fast to populate diagnostics if public fetch hasn't yet
      const net1 = await blockProvider.getNetwork();
      const providerChainId1 = Number((net1 as { chainId: number | bigint }).chainId);
      const block1 = await blockProvider.getBlockNumber();
      const code1 = await blockProvider.getCode(CONTRACT_ADDRESSES[activeNetwork]);
      const codeSize1 = code1 && code1 !== "0x" ? Math.floor((code1.length - 2) / 2) : 0;

      const launch = Number(await contract.launchBlock()) || 0;
      const phase = Number(await contract.getCurrentPhase()) || 0;
      const minted = await contract.totalSupply();
      const isLaunchComplete = launch > 0 && block1 >= launch + TOTAL_BLOCKS;

      // Ensure diagnostics and light stats become visible
      setContractData(prev => ({
        ...prev,
        providerChainId: providerChainId1,
        blockNumber: Math.max(prev.blockNumber, block1),
        launchBlock: launch,
        codeSize: codeSize1 || prev.codeSize,
      }));
      setHasPublicLight(true);

      let aggregatedUserContrib = BigInt(0);
      let aggregatedTotalContrib = BigInt(0);
      const mintable: number[] = [];
      const mintedPhases: number[] = [];
      const phaseContributions = Array(PHASES.length).fill("0");
      const phaseParticipantsData: PieData[] = [];
      const historicalPhaseParticipants: PieData[][] = Array(PHASES.length).fill([]);
      const historicalPhaseProgress: { phase: number; progress: number; blocksPassed: number; totalBlocks: number }[] = [];
      const allContributors: Map<string, PieData> = new Map();
      const historical: HistoricalData[] = [];

      for (let i = 0; i < PHASES.length; i++) {
        const [userContrib, totalContrib, hasMintedPhase] = await Promise.all([
          contract.contributions(i, account),
          contract.totalContributions(i),
          contract.hasMinted(i, account),
        ]);
        const phaseStart = launch + PHASES[i].start;
        const phaseEnd = launch + PHASES[i].end;
        const blocksInPhase = phaseEnd - phaseStart;
        const blocksPassed = Math.min(Math.max(0, block1 - phaseStart), blocksInPhase);
        const progress = blocksInPhase > 0 ? (blocksPassed / blocksInPhase) * 100 : 0;

        if (userContrib > 0 && block1 > phaseEnd && !hasMintedPhase) mintable.push(i);
        if (userContrib > 0 && hasMintedPhase) mintedPhases.push(i);
        aggregatedUserContrib += userContrib;
        aggregatedTotalContrib += totalContrib;
        phaseContributions[i] = ethers.formatEther(userContrib);

        const contributors: string[] = await contract.getPhaseContributors(i);
        const phaseParticipants: PieData[] = [];
        contributors.forEach((addr: string) => {
          if (!allContributors.has(addr)) {
            allContributors.set(addr, { name: `${addr.slice(0, 6)}...`, value: 0, address: addr, tokens: 0 });
          }
        });

        const contribValues = await Promise.all(contributors.map((addr: string) => contract.contributions(i, addr)));
        const totalPhaseContrib = parseFloat(ethers.formatEther(totalContrib));

        contributors.forEach((addr: string, idx: number) => {
          const contrib = contribValues[idx];
          if (contrib > BigInt(0)) {
            const userShare = parseFloat(ethers.formatEther(contrib));
            const tokenShare =
              totalPhaseContrib > 0 && (hasMintedPhase || (i < phase && block1 > phaseEnd))
                ? (userShare / totalPhaseContrib) * parseFloat(PHASES[i].amount)
                : 0;
            const existing = allContributors.get(addr)!;
            existing.value += userShare;
            existing.tokens = (existing.tokens || 0) + tokenShare;

            if (i === phase && !isLaunchComplete) {
              const phaseTokenShare = totalPhaseContrib > 0 ? (userShare / totalPhaseContrib) * parseFloat(PHASES[i].amount) : 0;
              phaseParticipantsData.push({
                name: `${addr.slice(0, 6)}...`,
                value: userShare,
                address: addr,
                tokens: phaseTokenShare,
              });
            } else if (block1 > phaseEnd) {
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
        historicalPhaseProgress.push({ phase: i, progress, blocksPassed, totalBlocks: blocksInPhase });

        historical.push({
          phase: i.toString(),
          contributions: parseFloat(ethers.formatEther(userContrib)),
          minted: hasMintedPhase && userContrib > 0 ? (parseFloat(ethers.formatEther(userContrib)) / parseFloat(ethers.formatEther(totalContrib))) * parseFloat(PHASES[i].amount) : 0,
        });
      }

      const [currentPhaseUserContrib, currentPhaseTotalContrib] = await Promise.all([
        contract.contributions(phase, account),
        contract.totalContributions(phase),
      ]);
      const totalTokensThisPhase = parseFloat(PHASES[phase].amount);

      const storedPending = getPendingContributions(account);
      // Keep only active-phase pending; drop older-phase items
      let filteredPending = storedPending.filter((p) => {
        const phaseIndex = p.phase ?? phase;
        const phaseEnd = launch + PHASES[phaseIndex].end;
        const isPhaseActive = block1 <= phaseEnd;
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
        currentPhase: isLaunchComplete ? PHASES.length - 1 : phase,
        totalMinted: ethers.formatEther(minted),
        blockNumber: Math.max(prev.blockNumber, block1),
        launchBlock: launch,
        userContributions: ethers.formatEther(aggregatedUserContrib),
        totalContributions: ethers.formatEther(aggregatedTotalContrib),
        mintablePhases: mintable,
        mintedPhases,
        estimatedReward: updatedEstimatedReward.toString(),
        phaseContributions,
        participantsCount: updatedPhaseParticipants.length,
        totalParticipants: allContributors.size,
        currentPhaseContributions: ethers.formatEther(currentPhaseTotalContrib),
        userCurrentPhaseContributions: ethers.formatEther(currentPhaseUserContrib),
        totalTokensThisPhase: PHASES[phase].amount,
        phaseParticipants: updatedPhaseParticipants,
        totalParticipantsData: Array.from(allContributors.values()).filter(d => d.value > 0),
        pendingPhaseParticipants: filteredPending,
        historicalData: historical,
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
      // Only show error if this is not a background refresh and user is connected
      if (isConnected && account) {
        setErrorMessage("Error fetching user blockchain data. Please try refreshing.");
      }
    } finally {
      isFetchingUserRef.current = false;
    }
  }, [contract, provider, account, publicProvider, activeNetwork, isConnected]);

  const [txMessage, setTxMessage] = useState<string | null>(null);

  const [lastContribution, setLastContribution] = useState<{ txHash: string; phase: number; amountEth: number; estReward: number; sharePct: number } | null>(null);

  const sendEth = useCallback(async () => {
    if (!isConnected || !signer || !account || !contract || contractData.isLaunchComplete) {
      setTxMessage(contractData.isLaunchComplete ? "Launch is complete, no more contributions accepted." : "Please connect your wallet!");
      return;
    }
    if (parseFloat(ethAmount) < parseFloat(MINIMUM_ETH)) {
      setTxMessage("Minimum contribution is 0.001 ETH.");
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
  }, [isConnected, signer, account, ethAmount, activeNetwork, sendTransaction, contract, contractData.isLaunchComplete]);

  const mintTokens = useCallback(
    async (phase: number) => {
      if (!contract || !account) return alert("Please connect your wallet!");
      setIsMinting(prev => new Map(prev).set(phase, true));
      setIsLoading(true);
      try {
        const tx = await contract.mintUserShare(phase, { gasLimit: BASE_GAS_LIMIT });
        await tx.wait();
        await fetchUserContractData();
      } catch (error) {
        console.error("Minting failed:", error);
        alert(`Minting failed: ${(error as Error).message}`);
      } finally {
        setIsMinting(prev => new Map(prev).set(phase, false));
        setIsLoading(false);
      }
    },
    [contract, account, fetchUserContractData]
  );

  const multiMint = useCallback(async () => {
    if (!contract || !account || contractData.mintablePhases.length === 0) return;
    setIsMinting(prev => new Map(prev).set(-1, true));
    setIsLoading(true);
    try {
      const tx = await contract.mintMultipleUserShares({ gasLimit: BASE_GAS_LIMIT * PHASES.length });
      await tx.wait();
      await fetchUserContractData();
    } catch (error) {
      console.error("Multi-minting failed:", error);
      alert(`Multi-minting failed: ${(error as Error).message}`);
    } finally {
      setIsMinting(prev => new Map(prev).set(-1, false));
      setIsLoading(false);
    }
  }, [contract, account, contractData.mintablePhases, fetchUserContractData]);

  // Do not override activeNetwork from chainId to avoid flicker/mismatch on cold load
  // Navbar will set both activeNetwork and request wallet switch together

  useEffect(() => {
    if (isConnected && account && walletClient) {
      setIsLoading(true);
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
          await fetchUserContractData();
          setTimeout(fetchUserContractData, 1500);
        } catch (error) {
          console.error("Failed to initialize wallet connection:", error);
          setErrorMessage("Failed to initialize wallet connection. Please try refreshing.");
        } finally {
          setIsLoading(false);
          setIsInitialLoading(false);
          setHasInitialLoad(true);
        }
      };
      init();
    } else if (publicProvider) {
      setIsLoading(true);
      // Only show loading overlay on first load
      if (!hasInitialLoad) {
        setIsInitialLoading(true);
      }
      // Only fetch with old method if optimized data is not available AND not loading
      if (!hasOptimizedData && !optimizedData.isLoading) {
        fetchPublicContractData().then(() => {
          setIsLoading(false);
          setIsInitialLoading(false);
          setHasInitialLoad(true);
        }).catch(() => {
          setIsLoading(false);
          setIsInitialLoading(false);
          setHasInitialLoad(true);
        });
      } else if (hasOptimizedData || optimizedData.isLoading) {
        // If we have optimized data or it's loading, skip old fetching
        setIsLoading(false);
        setIsInitialLoading(false);
        setHasInitialLoad(true);
      }
    }
  }, [isConnected, walletClient, account, activeNetwork, switchChain, fetchUserContractData, fetchPublicContractData, publicProvider, hasInitialLoad, hasOptimizedData, optimizedData.isLoading]);

  // Ensure public data loads even before wallet client is ready (only if no optimized data)
  useEffect(() => {
    if (!publicProvider || hasOptimizedData || optimizedData.isLoading) return;
    fetchPublicContractData();
    const interval = setInterval(() => {
      if (!hasInitialUserFetch && !hasOptimizedData && !optimizedData.isLoading) fetchPublicContractData();
    }, 12000);
    return () => clearInterval(interval);
  }, [publicProvider, hasInitialUserFetch, fetchPublicContractData, hasOptimizedData, optimizedData.isLoading]);

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

      setTimeout(fetchUserContractData, 5000);
    } else if (txError) {
      setIsSending(false);
      setTxMessage(`Transaction failed: ${txError.message || "Unknown error"}`);
    }
  }, [isSuccess, txError, txData, contract, provider, account, ethAmount, contractData, fetchUserContractData, lastTxHash]);

  useEffect(() => {
    if (isConnected && !contractData.isLaunchComplete) {
      const interval = setInterval(() => {

        fetchUserContractData();
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [isConnected, contractData.isLaunchComplete, fetchUserContractData]);

  // While the confirmation banner is visible, refresh user data more frequently
  useEffect(() => {
    if (!isConnected || contractData.isLaunchComplete || !lastContribution) return;
    let intervalId: number | undefined;

    const tick = () => {
      // rely on isFetchingUserRef inside fetchUserContractData to avoid overlap
      fetchUserContractData();
    };

    tick();
    intervalId = window.setInterval(tick, 3000);

    const onVisibility = () => {
      if (document.hidden) {
        if (intervalId) { clearInterval(intervalId); intervalId = undefined; }
      } else if (!intervalId) {
        tick();
        intervalId = window.setInterval(tick, 3000);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isConnected, contractData.isLaunchComplete, lastContribution, fetchUserContractData]);


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
        {isInitialLoading && !hasInitialLoad && !hasStableData && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="glass p-8 rounded-lg text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-lg" style={{ color: 'var(--foreground)' }}>Loading blockchain data...</p>
              <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>Please wait while we fetch the latest information</p>
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




        {contractData.isLaunchComplete && (
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
                  totalTokens={PHASES[p.phase].amount}
                  participants={stableContractData.historicalPhaseParticipants[p.phase]}
                />
              ))}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8 items-start justify-center">
          <div id="participate" className="glass w-full p-4 sm:p-6 lg:p-8 ring-white/10 space-y-8 h-full">

            <motion.div
              className="pt-6 mt-6 border-t border-white/10 space-y-2"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
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
	                          <div className="text-gray-300">Blocks left</div>
	                          <div className={`font-mono text-white ${blocksLeftFlash ? 'flash-text' : ''}`}>{Math.max(0, blocksInPhase - blocksPassedInPhase)}</div>
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
                min="0.001"
                placeholder="Enter ETH amount (min 0.001)"
                disabled={!isConnected || isSending || contractData.isLaunchComplete || !hasStableData}
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
                    disabled={!isConnected || isSending || contractData.isLaunchComplete || !hasStableData}
                    title={!isConnected ? "Connect wallet to set amount" : (contractData.isLaunchComplete ? "Launch complete" : (!hasStableData ? "Waiting for validated blockchain data..." : undefined))}
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
	                  <div className="text-gray-300">Blocks left</div>
	                  <div className={`font-mono text-white ${blocksLeftFlash ? 'flash-text' : ''}`}>
	                    {isInitialLoading && !hasInitialLoad ? (
	                      <span className="inline-block h-4 w-8 bg-gray-700/60 rounded animate-pulse" />
	                    ) : (
	                      Math.max(0, blocksInPhase - blocksPassedInPhase)
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
                disabled={!isConnected || isSending || contractData.isLaunchComplete || !hasStableData}
                title={!isConnected ? "Connect wallet to participate" : (contractData.isLaunchComplete ? "Launch complete" : (!hasStableData ? "Waiting for validated blockchain data..." : (isSending ? "Processing..." : undefined)))}
                className="mt-4 w-full py-3 rounded-lg disabled:bg-gray-600 transition-all font-semibold"
                style={{
                  background: (!isConnected || isSending || contractData.isLaunchComplete || !hasStableData)
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
              {!isConnected && (
                <p className="mt-4 text-gray-400 text-sm">Connect wallet to participate.</p>
              )}
            </motion.div>
            {isConnected && (
              <motion.div
                className="pt-6 mt-6 border-t border-white/10"
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                {(!hasStableData || !hasInitialUserFetch) && isConnected ? (
                  <MintTokensLoading />
                ) : (
                  <>
                    <h2 className="text-2xl font-bold mb-4 flex items-center" style={{ color: 'var(--accent)' }}>
                      <FaCoins className="mr-2" style={{ color: 'var(--accent)' }} /> Mint Tokens
                    </h2>
                    {!isConnected ? (
              <p className="text-gray-400">Connect wallet to see your mintable tokens.</p>
            ) : contractData.mintablePhases.length === 0 && contractData.mintedPhases.length === 0 ? (
                      <p className="text-gray-400">No phases ready for minting or previously minted.</p>
                    ) : (
                  <div className="space-y-4">
                    {contractData.mintablePhases.length > 0 && (
                      <>
                        <p className="text-gray-300 text-sm">Available to Mint (Total: {abbreviateNumber(totalMintableTokens)} MMM):</p>
                        {contractData.mintablePhases.map((phase) => {
                          const userContrib = parseFloat(contractData.phaseContributions[phase]);
                          const totalContrib = contractData.historicalData[phase]?.contributions || 1;
                          const phaseTokens = parseFloat(PHASES[phase].amount);
                          const mintableAmount = (userContrib / totalContrib) * phaseTokens;
                          const isPhaseMinting = isMinting.get(phase) || false;
                          return (
                            <button
                              key={phase}
                              onClick={() => mintTokens(phase)}
                              disabled={!hasStableData || isLoading || isPhaseMinting || (isMinting.get(-1) || false)}
                              title={!hasStableData ? "Waiting for validated blockchain data..." : (isLoading ? "Processing..." : (isPhaseMinting ? "Minting in progress" : undefined))}
                              className="w-full py-2 rounded-lg disabled:bg-gray-600 transition-all font-medium"
                              style={{
                                backgroundColor: (!hasStableData || isLoading || isPhaseMinting || (isMinting.get(-1) || false))
                                  ? '#6b7280'
                                  : 'var(--accent)',
                                color: '#ffffff'
                              }}
                            >
                              {isPhaseMinting
                                ? "Minting..."
                                : `Mint Phase ${phase} (${abbreviateNumber(mintableAmount)} MMM)`}
                            </button>
                          );
                        })}
                        <button
                          onClick={multiMint}
                          disabled={!hasStableData || isLoading || (isMinting.get(-1) || false)}
                          title={!hasStableData ? "Waiting for validated blockchain data..." : (isLoading ? "Processing..." : ((isMinting.get(-1) || false) ? "Minting in progress" : undefined))}
                          className="w-full py-2 bg-purple-600 rounded-lg hover:bg-purple-700 disabled:bg-gray-600 transition-all font-medium"
                        >
                          {isMinting.get(-1) ? "Minting All..." : `Mint All (${abbreviateNumber(totalMintableTokens)} MMM)`}
                        </button>
                      </>
                    )}
                    {contractData.mintedPhases.length > 0 && (
                      <>
                        <p className="text-gray-300 text-sm mt-4">Previously Minted:</p>
                        {contractData.mintedPhases.map((phase) => (
                          <p key={phase} className="text-gray-400 text-sm">
                            Phase {phase} - Minted {abbreviateNumber((parseFloat(contractData.phaseContributions[phase]) / contractData.historicalData[phase].contributions) * parseFloat(PHASES[phase].amount))} MMM
                          </p>
                        ))}
                      </>
                    )}
                  </div>
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
              totalProgress={launchPhaseProgress}
              phaseProgress={launchPhaseEndProgress}
              blocksSinceLaunch={blocksSinceLaunch}
              totalBlocks={TOTAL_BLOCKS}
              blocksLeft={blocksLeft}
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
            />

            <div className="pt-6 ">
              {!contractData.isLaunchComplete ? (
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
                      totalTokens={PHASES[index].amount}
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
        </div>

        <div className="">
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
                      <p className="text-gray-400">Loading top contributors...</p>
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
                  const pct = Math.min(100, Math.max(0, (realized / TOTAL_SUPPLY) * 100));
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
                <PieChartCard
                  title="Supply Details"
                  icon={<FaCoins style={{ color: 'var(--accent)' }} />}
                  data={[
                    { name: "Realized", value: parseFloat(stableContractData.totalMinted), tokens: parseFloat(stableContractData.totalMinted) },
                    { name: "Unrealized", value: TOTAL_SUPPLY - parseFloat(stableContractData.totalMinted), tokens: TOTAL_SUPPLY - parseFloat(stableContractData.totalMinted) },
                  ]}
                  totalTokens={TOTAL_SUPPLY.toString()}
                  colors={["#4f46e5", "#d1d5db"]}
                  extraText={`Total Minted: ${abbreviateNumber(parseFloat(stableContractData.totalMinted))} MMM`}
                />
              )}
            </div>
          </div>
        </div>

        {isConnected && (
          <div role="region" aria-label="Your History" className="w-full">
            <div className="glass w-full p-4 sm:p-6 lg:p-8 ring-white/10 space-y-8">
              <motion.div
                className="border-white/10"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
              >
                <h2 className="text-2xl font-bold mb-4 flex items-center" style={{ color: 'var(--primary)' }}>
                  <FaUsers className="mr-2" style={{ color: 'var(--primary)' }} />
                  Your History
                </h2>
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
                <MintedTokensChart data={contractData.historicalData} />
                <ContributionsChart data={contractData.historicalData} />
              </div>
            )}
              </motion.div>
            </div>
          </div>
        )}

        {!contractData.isLaunchComplete && (
          <div role="region" aria-label="Historical Phases" className="w-full">
            <div className="glass w-full p-4 sm:p-6 lg:p-8 ring-white/10 space-y-8">
              <motion.div
                className="border-white/10"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
              >
                <h2 className="text-2xl font-bold mb-4 flex items-center" style={{ color: 'var(--primary)' }}>
                  <FaChartLine className="mr-2" style={{ color: 'var(--primary)' }} />
                  Historical Phases
                </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {contractData.historicalPhaseProgress
              .filter((p) => p.phase < contractData.currentPhase)
              .map((p) => (
                <HistoricalPhaseCard
                  key={p.phase}
                  phase={p.phase}
                  progress={p.progress}
                  blocksPassed={p.blocksPassed}
                  totalBlocks={p.totalBlocks}
                  totalTokens={PHASES[p.phase].amount}
                  participants={stableContractData.historicalPhaseParticipants[p.phase]}
                />
              ))}
            </div>
              </motion.div>
            </div>
          </div>
        )}
        
      </div>
    </main>
  );
}