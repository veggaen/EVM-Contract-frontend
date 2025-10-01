"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ethers } from "ethers";
import { FaEthereum, FaChartLine, FaCoins, FaUsers, FaChevronDown, FaChevronUp } from "react-icons/fa";
import Navbar from "@/components/Navbar";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
  useSendTransaction,
  useChainId,
} from "wagmi";
import { sepolia, mainnet } from "wagmi/chains";
import { parseEther } from "viem";
import { CONTRACT_ADDRESSES } from "../lib/wagmi";
import { PieChart, Pie, Sector, ResponsiveContainer, Cell, Legend, LineChart, Line, XAxis, Tooltip } from "recharts";
import { motion } from "framer-motion";

// Types
type ChainId = 1 | 11155111 | 369;
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

// Constants
const MINIMUM_ETH = "0.001";
const TOTAL_BLOCKS = 1337;
const TOTAL_SUPPLY = 1000000;
const DYNAMIC_MINT_AMOUNT = TOTAL_SUPPLY * 0.75;
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

const ToggleDecimals = ({ value }: { value: string }) => {
  const [showFull, setShowFull] = useState(false);
  const numericValue = parseFloat(value);
  const displayValue = numericValue < 1 ? value : (showFull ? value : numericValue.toFixed(2));

  return (
    <span
      onClick={() => setShowFull(!showFull)}
      className="cursor-pointer text-indigo-400 hover:text-indigo-300 transition-colors font-semibold text-sm"
    >
      {displayValue}
    </span>
  );
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

const renderActiveShape = (props: ActiveShapeProps): JSX.Element => {
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
  } = props;
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
      className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl shadow-xl border border-gray-700 hover:shadow-2xl transition-shadow duration-300"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
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
  const formattedData = data.map(item => ({
    phase: item.phase === "0" ? "Phase 0" : `Phase ${item.phase}`,
    minted: item.minted,
  }));

  return (
    <motion.div
      className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl shadow-xl border border-gray-700"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-xl font-semibold text-white mb-4">Your Minted Tokens</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={formattedData}>
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
  const formattedData = data.map(item => ({
    phase: item.phase === "0" ? "Phase 0" : `Phase ${item.phase}`,
    contributions: item.contributions,
  }));

  return (
    <motion.div
      className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl shadow-xl border border-gray-700"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-xl font-semibold text-white mb-4">Your Contributions</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={formattedData}>
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

  return (
    <motion.div
      className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl shadow-xl border border-gray-700"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h2 className="text-2xl font-bold text-indigo-400 mb-4 flex items-center justify-between">
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
              className="bg-indigo-500 h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1 }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>Total Tokens:</div>
          <div><ToggleDecimals value={totalTokens} /> MMM</div>
          <div>Total Participants:</div>
          <div>{participants.length}</div>
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
  
  const [ethAmount, setEthAmount] = useState("0.01");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMinting, setIsMinting] = useState<Map<number, boolean>>(new Map());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeNetwork, setActiveNetwork] = useState<ChainId>(sepolia.id);
  const [publicProvider] = useState(() =>
    typeof window !== "undefined"
      ? new ethers.JsonRpcProvider(
          process.env.INFURA
            ? `https://sepolia.infura.io/v3/${process.env.INFURA}`
            : "https://rpc.sepolia.org"
        )
      : null
  );
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
  });
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const { address: account, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const { sendTransaction, isSuccess, error: rawTxError, data: txData } = useSendTransaction();
  const txError = rawTxError as Error | null;

  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);

  const launchPhaseProgress =
    contractData.blockNumber && contractData.launchBlock > 0
      ? Math.min(((contractData.blockNumber - contractData.launchBlock) / TOTAL_BLOCKS) * 100, 100)
      : 0;
  const blocksSinceLaunch = Math.min(contractData.blockNumber - contractData.launchBlock, TOTAL_BLOCKS);
  const userParticipated = parseFloat(contractData.userCurrentPhaseContributions) > 0 || contractData.pendingPhaseParticipants.length > 0;
  const phaseStartBlock = contractData.launchBlock + PHASES[contractData.currentPhase].start;
  const phaseEndBlock = contractData.launchBlock + PHASES[contractData.currentPhase].end;
  const blocksInPhase = phaseEndBlock - phaseStartBlock;
  const blocksPassedInPhase = Math.max(0, Math.min(contractData.blockNumber - phaseStartBlock, blocksInPhase));
  const launchPhaseEndProgress = blocksInPhase > 0 ? (blocksPassedInPhase / blocksInPhase) * 100 : 0;

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

  const totalMintableTokens = useMemo(() => {
    return contractData.mintablePhases.reduce((sum, phase) => {
      const userContrib = parseFloat(contractData.phaseContributions[phase]);
      const totalContrib = contractData.historicalData[phase]?.contributions || 1;
      const phaseTokens = parseFloat(PHASES[phase].amount);
      return sum + (userContrib / totalContrib) * phaseTokens;
    }, 0);
  }, [contractData.mintablePhases, contractData.phaseContributions, contractData.historicalData]);

  const connectWallet = useCallback(() => {
    const metaMaskConnector = connectors.find((c) => c.name === "MetaMask");
    if (metaMaskConnector) connect({ connector: metaMaskConnector });
  }, [connectors, connect]);

  const fetchPublicContractData = useCallback(async () => {
    if (!publicProvider) return;
    const publicContract = new ethers.Contract(CONTRACT_ADDRESSES[activeNetwork], ABI, publicProvider);
    try {
      const phase = Number(await publicContract.getCurrentPhase()) || 0;
      const minted = await publicContract.totalSupply();
      const block = await publicProvider.getBlockNumber();
      const launch = Number(await publicContract.launchBlock()) || 0;
      const isLaunchComplete = block >= launch + TOTAL_BLOCKS;

      let aggregatedTotalContrib = BigInt(0);
      const phaseContributions = Array(PHASES.length).fill("0");
      const phaseParticipantsData: PieData[] = [];
      const historicalPhaseParticipants: PieData[][] = Array(PHASES.length).fill([]);
      const historicalPhaseProgress: { phase: number; progress: number; blocksPassed: number; totalBlocks: number }[] = [];
      const allContributors: Map<string, PieData> = new Map();
      const historical: HistoricalData[] = [];

      for (let i = 0; i < PHASES.length; i++) {
        const totalContrib = await publicContract.totalContributions(i);
        aggregatedTotalContrib += totalContrib;
        phaseContributions[i] = "0";

        const contributors = await publicContract.getPhaseContributors(i);
        const phaseParticipants: PieData[] = [];
        contributors.forEach((addr: string) => {
          if (!allContributors.has(addr)) {
            allContributors.set(addr, { name: `${addr.slice(0, 6)}...`, value: 0, address: addr, tokens: 0 });
          }
        });

        for (const addr of contributors) {
          const contrib = await publicContract.contributions(i, addr);
          if (contrib > BigInt(0)) {
            const userShare = parseFloat(ethers.formatEther(contrib));
            const totalPhaseContrib = parseFloat(ethers.formatEther(totalContrib));
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
        }
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

      setContractData({
        currentPhase: isLaunchComplete ? PHASES.length - 1 : phase,
        totalMinted: ethers.formatEther(minted),
        blockNumber: block,
        launchBlock: launch,
        userContributions: "0",
        totalContributions: ethers.formatEther(aggregatedTotalContrib),
        mintablePhases: [],
        mintedPhases: [],
        estimatedReward: "0",
        phaseContributions,
        participantsCount: phaseParticipantsData.length,
        totalParticipants: allContributors.size,
        currentPhaseContributions: ethers.formatEther(await publicContract.totalContributions(phase)),
        userCurrentPhaseContributions: "0",
        totalTokensThisPhase: PHASES[phase].amount,
        phaseParticipants: phaseParticipantsData,
        totalParticipantsData: Array.from(allContributors.values()).filter(d => d.value > 0),
        pendingPhaseParticipants: account ? getPendingContributions(account) : [],
        historicalData: historical,
        historicalPhaseParticipants,
        historicalPhaseProgress,
        isLaunchComplete,
      });
      if (errorMessage === "Error fetching public blockchain data.") setErrorMessage(null);
    } catch (error) {
      console.error("Failed to fetch public contract data:", error);
      setErrorMessage("Error fetching public blockchain data. Please try refreshing.");
    }
  }, [activeNetwork, publicProvider, account, errorMessage]);

  const fetchUserContractData = useCallback(async () => {
    if (!contract || !provider || !account) return;
    try {
      const phase = Number(await contract.getCurrentPhase()) || 0;
      const minted = await contract.totalSupply();
      const block = await provider.getBlockNumber();
      const launch = Number(await contract.launchBlock()) || 0;
      const isLaunchComplete = block >= launch + TOTAL_BLOCKS;

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
        const userContrib = await contract.contributions(i, account);
        const totalContrib = await contract.totalContributions(i);
        const hasMintedPhase = await contract.hasMinted(i, account);
        const phaseStart = launch + PHASES[i].start;
        const phaseEnd = launch + PHASES[i].end;
        const blocksInPhase = phaseEnd - phaseStart;
        const blocksPassed = Math.min(Math.max(0, block - phaseStart), blocksInPhase);
        const progress = blocksInPhase > 0 ? (blocksPassed / blocksInPhase) * 100 : 0;

        if (userContrib > 0 && block > phaseEnd && !hasMintedPhase) mintable.push(i);
        if (userContrib > 0 && hasMintedPhase) mintedPhases.push(i);
        aggregatedUserContrib += userContrib;
        aggregatedTotalContrib += totalContrib;
        phaseContributions[i] = ethers.formatEther(userContrib);

        const contributors = await contract.getPhaseContributors(i);
        const phaseParticipants: PieData[] = [];
        contributors.forEach((addr: string) => {
          if (!allContributors.has(addr)) {
            allContributors.set(addr, { name: `${addr.slice(0, 6)}...`, value: 0, address: addr, tokens: 0 });
          }
        });

        for (const addr of contributors) {
          const contrib = await contract.contributions(i, addr);
          if (contrib > BigInt(0)) {
            const userShare = parseFloat(ethers.formatEther(contrib));
            const totalPhaseContrib = parseFloat(ethers.formatEther(totalContrib));
            const tokenShare =
              totalPhaseContrib > 0 && (hasMintedPhase || (i < phase && block > phaseEnd))
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
            } else if (block > phaseEnd) {
              phaseParticipants.push({
                name: `${addr.slice(0, 6)}...`,
                value: userShare,
                address: addr,
                tokens: tokenShare,
              });
            }
          }
        }
        historicalPhaseParticipants[i] = phaseParticipants;
        historicalPhaseProgress.push({ phase: i, progress, blocksPassed, totalBlocks: blocksInPhase });

        historical.push({
          phase: i.toString(),
          contributions: parseFloat(ethers.formatEther(totalContrib)),
          minted: hasMintedPhase && userContrib > 0 ? (parseFloat(ethers.formatEther(userContrib)) / parseFloat(ethers.formatEther(totalContrib))) * parseFloat(PHASES[i].amount) : 0,
        });
      }

      const currentPhaseUserContrib = await contract.contributions(phase, account);
      const currentPhaseTotalContrib = await contract.totalContributions(phase);
      const totalTokensThisPhase = parseFloat(PHASES[phase].amount);

      const storedPending = getPendingContributions(account);
      const updatedPending = storedPending.filter((p) => {
        const phaseIndex = p.phase || 0;
        const phaseEnd = launch + PHASES[phaseIndex].end;
        const isPhaseActive = block <= phaseEnd;
        return isPhaseActive && p.value > 0;
      });

      const currentPhasePending = updatedPending.filter(p => p.phase === phase);
      const totalPendingContrib = currentPhasePending.reduce((sum, p) => sum + p.value, 0);
      const totalPhaseContrib = parseFloat(ethers.formatEther(currentPhaseTotalContrib));
      const totalPhaseContribWithPending = totalPhaseContrib + totalPendingContrib;
      const totalUserContrib = parseFloat(ethers.formatEther(currentPhaseUserContrib)) + totalPendingContrib;

      const updatedEstimatedReward = totalPhaseContribWithPending > 0
        ? (totalUserContrib / totalPhaseContribWithPending) * totalTokensThisPhase
        : 0;

      if (currentPhasePending.length > 0) {
        const aggregatedPending: PieData = {
          name: `${account.slice(0, 6)}...`,
          value: totalPendingContrib,
          address: account,
          tokens: updatedEstimatedReward,
          isPending: true,
          phase,
          txHash: currentPhasePending.map(p => p.txHash).join(","),
        };
        updatedPending.splice(0, updatedPending.length, ...updatedPending.filter(p => p.phase !== phase), aggregatedPending);
      }

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

      setContractData({
        currentPhase: isLaunchComplete ? PHASES.length - 1 : phase,
        totalMinted: ethers.formatEther(minted),
        blockNumber: block,
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
        pendingPhaseParticipants: updatedPending,
        historicalData: historical,
        historicalPhaseParticipants,
        historicalPhaseProgress,
        isLaunchComplete,
      });
      setPendingContributions(account, updatedPending);
      if (errorMessage === "Error fetching user blockchain data.") setErrorMessage(null);
    } catch (error) {
      console.error("Failed to fetch user contract data:", error);
      setErrorMessage("Error fetching user blockchain data. Please try refreshing.");
    }
  }, [contract, provider, account, errorMessage]);

  const sendEth = useCallback(async () => {
    if (!isConnected || !signer || !account || !contract || contractData.isLaunchComplete) {
      alert(contractData.isLaunchComplete ? "Launch is complete, no more contributions accepted." : "Please connect your wallet!");
      return;
    }
    if (parseFloat(ethAmount) < parseFloat(MINIMUM_ETH)) {
      setErrorMessage("Minimum contribution is 0.001 ETH.");
      return;
    }
    setIsSending(true);
    try {
      const txData = contract.interface.encodeFunctionData("contribute", [contractData.currentPhase]);
      await sendTransaction({
        to: CONTRACT_ADDRESSES[activeNetwork] as `0x${string}`,
        value: parseEther(ethAmount),
        chainId: activeNetwork,
        data: txData as `0x${string}`,
      });
    } catch (error) {
      console.error("Send ETH failed:", error);
      setErrorMessage(`Transaction failed: ${(error as Error).message}`);
      setIsSending(false);
    }
  }, [isConnected, signer, account, ethAmount, activeNetwork, sendTransaction, contract, contractData.isLaunchComplete, contractData.currentPhase]);

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

  useEffect(() => {
    if (chainId && (chainId === sepolia.id || chainId === mainnet.id)) setActiveNetwork(chainId as ChainId);
  }, [chainId]);

  useEffect(() => {
    if (!walletClient) return; // Ensure initialization only happens client-side with wallet
    if (isConnected && account) {
      setIsLoading(true);
      const init = async () => {
        switchChain({ chainId: activeNetwork });
        const providerInstance = new ethers.BrowserProvider(walletClient);
        const signerInstance = await providerInstance.getSigner();
        const contractInstance = new ethers.Contract(CONTRACT_ADDRESSES[activeNetwork], ABI, signerInstance);
        setProvider(providerInstance);
        setSigner(signerInstance);
        setContract(contractInstance);
        await fetchUserContractData();
        setIsLoading(false);
      };
      init();
    } else if (publicProvider) {
      setIsLoading(true);
      fetchPublicContractData().then(() => setIsLoading(false));
    }
  }, [isConnected, walletClient, account, activeNetwork, switchChain, fetchUserContractData, fetchPublicContractData, publicProvider]);

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

      const tempParticipant: PieData = {
        name: `${account.slice(0, 6)}...`,
        value: newContribution,
        address: account,
        tokens: estimatedReward,
        isPending: true,
        phase: contractData.currentPhase,
        txHash: txData,
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

      setTimeout(fetchUserContractData, 5000);
    } else if (txError) {
      setIsSending(false);
      setErrorMessage(`Transaction failed: ${txError.message || "Unknown error"}`);
    }
  }, [isSuccess, txError, txData, contract, provider, account, ethAmount, contractData, fetchUserContractData, lastTxHash]);

  useEffect(() => {
    if (isConnected && !contractData.isLaunchComplete) {
      const interval = setInterval(() => {
        fetchUserContractData();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [isConnected, contractData.isLaunchComplete, fetchUserContractData]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // render a safe placeholder that matches server-side output
    return <div className="min-h-screen bg-gray-900 text-white" />;
  }

  if (typeof window === "undefined") {
    return null; // Prevent SSR rendering entirely
  }
  

  return (
    <div className="min-h-screen bg-gray-900 text-white overflow-x-hidden">
      <Navbar
        account={account}
        provider={provider}
        connectWallet={connectWallet}
        disconnectWallet={disconnect}
        activeNetwork={activeNetwork}
        setActiveNetwork={(id: number) => setActiveNetwork(id as ChainId)}
      />
      <div className="container mx-auto px-4 py-8 md:py-12">
        <motion.header
          className="text-center mb-12"
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <FaEthereum className="text-indigo-400 text-5xl mx-auto animate-bounce" />
          <h1 className="text-4xl md:text-5xl font-extrabold mt-4 bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            MrManMan (MMM) Token
          </h1>
          <p className="mt-2 text-gray-300 text-lg">Participate in a decentralized ecosystem</p>
        </motion.header>

        {contractData.isLaunchComplete && (
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-white mb-8">Launch History</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {contractData.historicalPhaseProgress.map((p) => (
                <HistoricalPhaseCard
                  key={p.phase}
                  phase={p.phase}
                  progress={p.progress}
                  blocksPassed={p.blocksPassed}
                  totalBlocks={p.totalBlocks}
                  totalTokens={PHASES[p.phase].amount}
                  participants={contractData.historicalPhaseParticipants[p.phase]}
                />
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="space-y-8">
            <motion.div
              className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl shadow-xl border border-gray-700"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold text-indigo-400 mb-4 flex items-center">
                <FaEthereum className="mr-2" /> Participate
              </h2>
              <input
                type="number"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500 transition-all"
                step="0.01"
                min="0.001"
                placeholder="Enter ETH amount (min 0.001)"
                disabled={!isConnected || isSending || contractData.isLaunchComplete}
              />
              {errorMessage && (
                <p className={`text-sm mt-2 ${errorMessage.includes("accepted") ? "text-green-400" : "text-red-400"}`}>
                  {errorMessage}
                </p>
              )}
              <button
                onClick={sendEth}
                disabled={!isConnected || isSending || contractData.isLaunchComplete}
                className="mt-4 w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:bg-gray-600 transition-all font-semibold"
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
                className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl shadow-xl border border-gray-700"
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <h2 className="text-2xl font-bold text-yellow-400 mb-4 flex items-center">
                  <FaCoins className="mr-2" /> Mint Tokens
                </h2>
                {contractData.mintablePhases.length === 0 && contractData.mintedPhases.length === 0 ? (
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
                              disabled={isLoading && (isMinting.get(phase) || isMinting.get(-1))}
                              className="w-full py-2 bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-gray-600 transition-all font-medium"
                            >
                              {isPhaseMinting
                                ? "Minting..."
                                : `Mint Phase ${phase} (${abbreviateNumber(mintableAmount)} MMM)`}
                            </button>
                          );
                        })}
                        <button
                          onClick={multiMint}
                          disabled={isLoading}
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
              </motion.div>
            )}
          </div>

          <div className="space-y-8">
            <motion.div
              className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl shadow-xl border border-gray-700"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold text-indigo-400 mb-4">
                {contractData.isLaunchComplete ? "Launch Complete" : `Phase ${contractData.currentPhase} Progress`}
              </h2>
              {contractData.isLaunchComplete ? (
                <p className="text-gray-300">The token launch has concluded after {blocksSinceLaunch} blocks.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-300">
                      Total Progress: {Math.round(launchPhaseProgress)}% ({blocksSinceLaunch} / {TOTAL_BLOCKS} blocks)
                    </p>
                    <div className="bg-gray-700 h-3 rounded-full overflow-hidden">
                      <motion.div
                        className="bg-indigo-500 h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${launchPhaseProgress}%` }}
                        transition={{ duration: 1 }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-300">Phase Progress: {Math.round(launchPhaseEndProgress)}%</p>
                    <div className="bg-gray-700 h-3 rounded-full overflow-hidden">
                      <motion.div
                        className="bg-green-500 h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${launchPhaseEndProgress}%` }}
                        transition={{ duration: 1 }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>Total Tokens:</div>
                    <div><ToggleDecimals value={contractData.totalTokensThisPhase} /> MMM</div>
                    {isConnected && userParticipated && (
                      <>
                        <div>Your Reward:</div>
                        <div><ToggleDecimals value={contractData.estimatedReward} /> MMM</div>
                        <div>Your Contribution:</div>
                        <div><ToggleDecimals value={contractData.userCurrentPhaseContributions} /> ETH</div>
                      </>
                    )}
                    <div>Participants:</div>
                    <div>{contractData.participantsCount}</div>
                    <div>Phase Start:</div>
                    <div>{phaseStartBlock}</div>
                    <div>Phase End:</div>
                    <div>{phaseEndBlock}</div>
                  </div>
                </div>
              )}
            </motion.div>

            {!contractData.isLaunchComplete ? (
              <PieChartCard
                title="Participants"
                icon={<FaUsers className="text-blue-400" />}
                data={contractData.phaseParticipants}
                totalTokens={contractData.totalTokensThisPhase}
                currentPhase={contractData.currentPhase}
              />
            ) : (
              <div className="gap-4 flex flex-col">
                {contractData.historicalPhaseParticipants.slice(0, 3).map((participants, index) => (
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

          <div className="space-y-8">
            <motion.div
              className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl shadow-xl border border-gray-700"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold text-indigo-400 mb-4 flex items-center">
                <FaChartLine className="mr-2" /> Project Stats
              </h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>Total Minted:</div>
                <div><ToggleDecimals value={contractData.totalMinted} /> MMM</div>
                <div>Total Contributions:</div>
                <div><ToggleDecimals value={contractData.totalContributions} /> ETH</div>
                <div>Total Participants:</div>
                <div>{contractData.totalParticipants}</div>
                <div>Phase Tokens:</div>
                <div><ToggleDecimals value={contractData.totalTokensThisPhase} /> MMM</div>
                <div>Phase Contributions:</div>
                <div><ToggleDecimals value={contractData.currentPhaseContributions} /> ETH</div>
                <div>Phase Participants:</div>
                <div>{contractData.participantsCount}</div>
              </div>
            </motion.div>

            <PieChartCard
              title="Global Contributions"
              icon={<FaUsers className="text-blue-400" />}
              data={contractData.totalParticipantsData}
              totalTokens={contractData.totalMinted}
            />

            <PieChartCard
              title="Supply Details"
              icon={<FaCoins className="text-yellow-400" />}
              data={[
                { name: "Realized", value: parseFloat(contractData.totalMinted), tokens: parseFloat(contractData.totalMinted) },
                { name: "Unrealized", value: TOTAL_SUPPLY - parseFloat(contractData.totalMinted), tokens: TOTAL_SUPPLY - parseFloat(contractData.totalMinted) },
              ]}
              totalTokens={TOTAL_SUPPLY.toString()}
              colors={["#4f46e5", "#d1d5db"]}
              extraText={`Total Minted: ${abbreviateNumber(parseFloat(contractData.totalMinted))} MMM`}
            />
          </div>
        </div>

        {isConnected && (
          <div className="mt-12">
            <h2 className="text-3xl font-bold text-white mb-8">Your History</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <PieChartCard
                title="Your Contributions"
                icon={<FaEthereum className="text-indigo-400" />}
                data={pieData}
                extraText={`Total Contributions: ${totalUserContributions.toFixed(4)} ETH`}
              />
              <MintedTokensChart data={contractData.historicalData} />
              <ContributionsChart data={contractData.historicalData} />
            </div>
          </div>
        )}

        {!contractData.isLaunchComplete && (
          <div className="mt-12">
            <h2 className="text-3xl font-bold text-white mb-8">Historical Phases</h2>
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
                  participants={contractData.historicalPhaseParticipants[p.phase]}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}