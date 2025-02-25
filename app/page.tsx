"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { ethers } from "ethers";
import { FaEthereum } from "react-icons/fa";
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
import { PieChart, Pie, Sector, ResponsiveContainer, LineChart, Line, Tooltip, Legend, Cell, XAxis } from "recharts";
import { motion } from "framer-motion";

// Global Scrollbar Styles
const globalStyles = `
  ::-webkit-scrollbar {
    width: 6px;
  }
  ::-webkit-scrollbar-track {
    background: #1f2937;
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb {
    background: #4f46e5;
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #6366f1;
  }
`;

// Types
type ChainId = 1 | 11155111;

interface ToggleDecimalsProps { value: string }
interface PieData { name: string; value: number; address?: string; tokens?: number }
interface HistoricalData { phase: string; contributions: number; minted: number }
interface StatsProps {
  globalStats: { totalMinted: string; totalContributions: string; totalParticipants: number };
  phaseStats: {
    currentPhase: number;
    currentPhaseContributions: string;
    currentPhaseParticipants: number;
    userCurrentPhaseContributions: string;
    currentPhaseTokens: string;
    userParticipated: boolean;
  };
}
interface PhaseProgressProps {
  progress: number;
  blocksSinceLaunch: number;
  estimatedReward: string;
  totalTokensThisPhase: string;
  remainingBlocks: number;
  phaseEndBlock: number;
  currentPhase: number;
  userCurrentPhaseContributions: string;
  participantsCount: number;
  currentPhaseContributions: string;
}
interface ParticipateCardProps { ethAmount: string; setEthAmount: React.Dispatch<React.SetStateAction<string>>; errorMessage: string | null; sendEth: () => void }
interface MintCardProps { mintablePhases: number[]; mintTokens: (phase: number) => void; multiMint: () => void; isLoading: boolean }
interface ParticipationCardProps { userContributions: string; participantsCount: number; tokensMintedThisPhase: string; phaseContributions: string[] }
interface MarketCapPieChartProps { totalMinted: string }
interface PhaseParticipantsPieChartProps { phaseData: PieData[]; totalTokens: string }
interface GlobalPieChartProps { totalData: PieData[]; totalMinted: string }

// Use Recharts' PieSectorDataItem type or unknown for flexibility
interface PieActiveShapeProps {
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
const BASE_GAS_LIMIT = 100000; // Base gas limit per phase, matching single mint (~0.0048 SepoliaETH)

const PHASES = [
  { start: 0, end: 200, amount: (DYNAMIC_MINT_AMOUNT * 0.1).toString() },
  ...Array.from({ length: 11 }, (_, i) => ({
    start: 200 + i * 100,
    end: 300 + i * 100,
    amount: Math.floor((DYNAMIC_MINT_AMOUNT * 0.8) / 11).toString(),
  })),
  { start: 1300, end: 1337, amount: (DYNAMIC_MINT_AMOUNT * 0.1).toString() },
];

// ABI (unchanged)
const ABI = [
  {
    constant: true,
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "launchBlock",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "lastMintBlock",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "getCurrentPhase",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "phase", type: "uint256" }, { name: "user", type: "address" }],
    name: "contributions",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "phase", type: "uint256" }],
    name: "totalContributions",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [{ name: "phase", type: "uint256" }],
    name: "mintUserShare",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: false,
    inputs: [{ name: "phasesToMint", type: "uint256[]" }],
    name: "mintMultipleUserShares",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "phase", type: "uint256" }, { name: "user", type: "address" }],
    name: "hasMinted",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "phase", type: "uint256" }],
    name: "getPhaseContributors",
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Reusable Components
const ToggleDecimals = ({ value }: ToggleDecimalsProps) => {
  const [showFull, setShowFull] = useState(false);
  const numericValue = parseFloat(value);
  const displayValue = numericValue < 1 ? value : (showFull ? value : numericValue.toFixed(2));

  return (
    <span
      onClick={() => setShowFull(!showFull)}
      className="cursor-pointer hover:text-indigo-400 transition-colors bg-gradient-to-r from-indigo-500 to-purple-500 text-transparent bg-clip-text font-semibold text-xs sm:text-sm"
    >
      {displayValue}
    </span>
  );
};

const abbreviateNumber = (num: number): string => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
};

const renderActiveShape = (props: unknown) => {
  // Cast props to PieActiveShapeProps & { totalTokens?: string } for type safety
  const typedProps = props as PieActiveShapeProps & { totalTokens?: string };
  const RADIAN = Math.PI / 180;
  const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value, totalTokens } = typedProps;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 15) * cos;
  const my = cy + (outerRadius + 15) * sin;
  const ex = cx + (outerRadius + 20) * cos; // Reduced offset for mobile to bring text closer
  const ey = cy + (outerRadius + 20) * sin; // Reduced offset for mobile to bring text closer
  const textAnchor = cos >= 0 ? "start" : "end";
  const totalTokenValue = totalTokens ? parseFloat(totalTokens) : 0;
  const tokenAmount = totalTokenValue * percent;

  const copyAddress = () => {
    if (payload.address) {
      navigator.clipboard.writeText(payload.address);
      alert(`Copied address: ${payload.address}`);
    }
  };

  // Show more decimals for small values (< 1) in hover text, otherwise use two decimals
  const displayValue = value < 1 ? value.toFixed(5) : value.toFixed(2);
  // Format tokens to show full number with commas for large values
  const displayTokens = payload.tokens ? payload.tokens.toLocaleString() : "0";

  return (
    <g style={{ zIndex: 1000 }}>
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill="#fff" className="font-semibold text-xs sm:text-sm md:text-base">
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
        className="text-xs sm:text-xs md:text-sm cursor-pointer hover:underline max-w-[100px] truncate sm:max-w-[150px]"
        onClick={copyAddress}
        onTouchStart={copyAddress} // Touch support for mobile
      >
        {payload.address ? `${payload.address.slice(0, 6)}...${payload.address.slice(-4)}` : displayValue}
      </text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={14} textAnchor={textAnchor} fill="#999" className="text-xs sm:text-xs md:text-sm">
        {`(${Math.round(percent * 100)}%)`}
      </text>
      <text
        x={ex + (cos >= 0 ? 1 : -1) * 12}
        y={ey}
        dy={28}
        textAnchor={textAnchor}
        fill="#fff"
        className="text-xs sm:text-xs md:text-sm max-w-[100px] truncate sm:max-w-[150px]"
      >
        {displayTokens} MMM
      </text>
      {totalTokens && (
        <text
          x={ex + (cos >= 0 ? 1 : -1) * 12}
          y={ey}
          dy={42}
          textAnchor={textAnchor}
          fill="#fff"
          className="text-xs sm:text-xs md:text-sm max-w-[100px] truncate sm:max-w-[150px] hidden sm:block" // Hide on mobile, show on desktop
        >
          {abbreviateNumber(parseFloat(totalTokens))} MMM
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
      address: undefined, // Ensure address is undefined for "Others"
    }),
    { name: "Others", value: 0, tokens: 0 } as PieData
  );
  return [...topData, others];
};

const GlobalPieChart = ({ totalData, totalMinted }: GlobalPieChartProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#d1d5db"];
  const aggregatedData = useMemo(() => aggregatePieData(totalData, MAX_PIE_SLICES), [totalData]);

  return (
    <motion.div
      className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg border border-gray-700 mb-4 sm:mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-sm sm:text-base font-semibold text-white mb-3 text-center">Global Contribs</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            activeIndex={activeIndex}
            activeShape={(props: unknown) => renderActiveShape(props)}
            data={aggregatedData}
            cx="50%"
            cy="50%"
            innerRadius={42} // Further reduced for mobile
            outerRadius={55} // Further reduced for mobile
            dataKey="value"
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onTouchStart={(_, index) => setActiveIndex(index)} // Touch support for mobile
          >
            {aggregatedData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="#fff" className="text-xs sm:text-sm md:text-base font-bold">
              {totalMinted} MMM
            </text>
          </Pie>
          <Legend wrapperStyle={{ color: "#fff", fontSize: "10px", maxHeight: "20px", overflowY: "auto" }} />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

const PhaseParticipantsPieChart = ({ phaseData, totalTokens }: PhaseParticipantsPieChartProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#d1d5db"];
  const aggregatedData = useMemo(() => aggregatePieData(phaseData, MAX_PIE_SLICES), [phaseData]);

  return (
    <motion.div
      className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg border border-gray-700 mb-4 sm:mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-sm sm:text-base font-semibold text-white mb-3 text-center">Phase Participants</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            activeIndex={activeIndex}
            activeShape={(props: unknown) => renderActiveShape(props)}
            data={aggregatedData}
            cx="50%"
            cy="50%"
            innerRadius={42} // Reduced further for mobile
            outerRadius={55} // Reduced further for mobile
            dataKey="value"
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onTouchStart={(_, index) => setActiveIndex(index)} // Touch support for mobile
          >
            {aggregatedData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="#fff" className="text-xs sm:text-sm md:text-base font-bold">
              {totalTokens} MMM
            </text>
          </Pie>
          <Legend wrapperStyle={{ color: "#fff", fontSize: "10px", maxHeight: "20px", overflowY: "auto" }} />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

const ParticipationPieChart = ({ data }: { data: PieData[] }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const aggregatedData = useMemo(() => aggregatePieData(data, MAX_PIE_SLICES), [data]);

  return (
    <motion.div
      className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg border border-gray-700 mb-4 sm:mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-sm sm:text-base font-semibold text-white mb-3 text-center">Your Contribs</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            activeIndex={activeIndex}
            activeShape={(props: unknown) => renderActiveShape(props)}
            data={aggregatedData}
            cx="50%"
            cy="50%"
            innerRadius={42} // Reduced further for mobile
            outerRadius={55} // Reduced further for mobile
            fill="#4f46e5"
            dataKey="value"
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onTouchStart={(_, index) => setActiveIndex(index)} // Touch support for mobile
          />
          <Legend wrapperStyle={{ color: "#fff", fontSize: "10px", maxHeight: "20px", overflowY: "auto" }} />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

const MarketCapPieChart = ({ totalMinted }: MarketCapPieChartProps) => {
  const minted = parseFloat(totalMinted);
  const unminted = TOTAL_SUPPLY - minted;
  const data = useMemo(() => [
    { name: "Minted", value: minted },
    { name: "Unminted", value: unminted },
  ], [minted, unminted]); // Ensure unminted is included in dependencies
  const COLORS = ["#4f46e5", "#d1d5db"];
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <motion.div
      className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg border border-gray-700 mb-4 sm:mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.8 }}
    >
      <h3 className="text-sm sm:text-base font-semibold text-white mb-3">Market Cap</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            activeIndex={activeIndex}
            activeShape={(props: unknown) => renderActiveShape(props)}
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={42} // Reduced further for mobile
            outerRadius={55} // Reduced further for mobile
            dataKey="value"
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onTouchStart={(_, index) => setActiveIndex(index)} // Touch support for mobile
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="#fff" className="text-xs sm:text-sm md:text-base font-bold">
              {TOTAL_SUPPLY} MMM
            </text>
          </Pie>
          <Legend wrapperStyle={{ color: "#fff", fontSize: "10px", maxHeight: "20px", overflowY: "auto" }} />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

const Stats = ({ globalStats, phaseStats }: StatsProps) => (
  <motion.div
    className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg border border-gray-700 mb-4 sm:mb-6"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    <h2 className="text-sm sm:text-base font-bold text-white mb-3">Stats Overview</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <h3 className="text-xs sm:text-sm font-semibold text-white mb-2">Global</h3>
        <table className="w-full text-white text-xs sm:text-sm border-collapse">
          <tbody>
            <tr className="bg-gray-700">
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Minted Tokens</td>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600"><ToggleDecimals value={globalStats.totalMinted} /> MMM</td>
            </tr>
            <tr>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Contributions</td>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600"><ToggleDecimals value={globalStats.totalContributions} /> ETH</td>
            </tr>
            <tr className="bg-gray-700">
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Participants</td>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">{globalStats.totalParticipants}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div>
        <h3 className="text-xs sm:text-sm font-semibold text-white mb-2">Phase {phaseStats.currentPhase}</h3>
        <table className="w-full text-white text-xs sm:text-sm border-collapse">
          <tbody>
            <tr className="bg-gray-700">
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Tokens</td>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600"><ToggleDecimals value={phaseStats.currentPhaseTokens} /> MMM</td>
            </tr>
            <tr>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Contributions</td>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600"><ToggleDecimals value={phaseStats.currentPhaseContributions} /> ETH</td>
            </tr>
            <tr className="bg-gray-700">
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Participants</td>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">{phaseStats.currentPhaseParticipants}</td>
            </tr>
            <tr>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">{phaseStats.userParticipated ? "Your Contribution" : "Contribution Potential"}</td>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600"><ToggleDecimals value={phaseStats.userCurrentPhaseContributions} /> ETH</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </motion.div>
);

const ParticipationCard = ({ userContributions, participantsCount, tokensMintedThisPhase, phaseContributions }: ParticipationCardProps) => (
  <motion.div
    className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg border border-gray-700 mb-4 sm:mb-6"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: 0.5 }}
  >
    <h2 className="text-sm sm:text-base font-bold text-white mb-3">Your Participation</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <table className="w-full text-white text-xs sm:text-sm border-collapse">
          <tbody>
            <tr className="bg-gray-700">
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Total Contributions</td>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600"><ToggleDecimals value={userContributions} /> ETH</td>
            </tr>
            <tr>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Phase Participants</td>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">{participantsCount}</td>
            </tr>
            <tr className="bg-gray-700">
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Tokens Minted</td>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">{tokensMintedThisPhase}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="max-h-28 sm:max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-indigo-500 scrollbar-track-gray-700">
        <table className="w-full text-left text-xs sm:text-sm text-white border-collapse">
          <thead>
            <tr className="bg-gray-700">
              <th className="py-1 px-2 sm:px-3 border-b border-gray-600">Phase</th>
              <th className="py-1 px-2 sm:px-3 border-b border-gray-600">ETH</th>
            </tr>
          </thead>
          <tbody>
            {phaseContributions.map((contrib, index) => contrib !== "0" && (
              <tr key={index} className={index % 2 === 0 ? "bg-gray-600" : ""}>
                <td className="py-1 px-2 sm:px-3 border-b border-gray-600">{index}</td>
                <td className="py-1 px-2 sm:px-3 border-b border-gray-600">{contrib}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </motion.div>
);

const ParticipateCard = ({ ethAmount, setEthAmount, errorMessage, sendEth }: ParticipateCardProps) => (
  <motion.div
    className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg border border-gray-700 mb-4 sm:mb-6"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: 0.3 }}
  >
    <h2 className="text-sm sm:text-base font-bold text-white mb-3">Participate</h2>
    <p className="text-gray-400 mb-3 text-xs sm:text-sm">Send ETH to join the current phase.</p>
    <input
      type="number"
      value={ethAmount}
      onChange={(e) => setEthAmount(e.target.value)}
      className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-indigo-500 text-xs sm:text-sm"
      step="0.01"
      min="0.001"
      placeholder="Enter ETH amount (min 0.001)"
    />
    {errorMessage && <p className="text-red-400 text-xs mt-2">{errorMessage}</p>}
    <button
      onClick={sendEth}
      className="mt-3 w-full py-2 bg-gradient-to-r from-green-500 to-teal-500 rounded-md hover:scale-105 transition-transform text-white text-xs sm:text-sm font-semibold shadow-md"
    >
      Send ETH
    </button>
  </motion.div>
);

const MintCard = ({ mintablePhases, mintTokens, multiMint, isLoading }: MintCardProps) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleMultiMintConfirm = () => {
    setShowConfirm(false);
    multiMint();
  };

  return (
    <motion.div
      className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg border border-gray-700 mb-4 sm:mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
    >
      <h2 className="text-sm sm:text-base font-bold text-white mb-3">Mint Tokens</h2>
      {mintablePhases.length === 0 ? (
        <p className="text-gray-400 text-xs sm:text-sm">No phases ready for minting.</p>
      ) : (
        <div className="space-y-3">
          <table className="w-full text-white text-xs sm:text-sm border-collapse">
            <tbody>
              {mintablePhases.map((phase, index) => (
                <tr key={phase} className={index % 2 === 0 ? "bg-gray-700" : ""}>
                  <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Phase {phase}</td>
                  <td className="py-1 px-2 sm:px-3 border-b border-gray-600">
                    <button
                      onClick={() => mintTokens(phase)}
                      disabled={isLoading}
                      className="w-full py-1 bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors text-white text-xs sm:text-sm font-semibold shadow-md"
                    >
                      {isLoading ? "Minting..." : "Mint"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isLoading || mintablePhases.length === 0}
            className="w-full py-2 bg-purple-600 rounded-md hover:bg-purple-700 disabled:bg-purple-400 transition-colors text-white text-xs sm:text-sm font-semibold shadow-md"
          >
            {isLoading ? "Minting..." : "Mint All"}
          </button>
        </div>
      )}
      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
            <p className="text-white text-xs sm:text-sm mb-3">
              This action will mint all eligible phases. Estimated cost may exceed single mints. Proceed?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleMultiMintConfirm}
                disabled={isLoading}
                className="px-3 py-2 bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 text-white text-xs sm:text-sm font-semibold shadow-md"
              >
                {isLoading ? "Minting..." : "Confirm"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-2 bg-red-600 rounded-md hover:bg-red-700 text-white text-xs sm:text-sm font-semibold shadow-md"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

const PhaseProgress = ({
  progress,
  blocksSinceLaunch,
  estimatedReward,
  totalTokensThisPhase,
  remainingBlocks,
  phaseEndBlock,
  currentPhase,
  userCurrentPhaseContributions,
  participantsCount,
  currentPhaseContributions,
}: PhaseProgressProps) => {
  const userParticipated = parseFloat(userCurrentPhaseContributions) > 0;

  return (
    <motion.div
      className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg border border-gray-700 mb-4 sm:mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <h2 className="text-sm sm:text-base font-bold text-white mb-3">Phase {currentPhase} Progress</h2>
      <div className="mb-3">
        <p className="text-white mb-2 text-xs sm:text-sm"><strong>Progress:</strong> {Math.round(progress)}%</p>
        <div className="bg-gray-700 h-2 sm:h-3 rounded-full overflow-hidden">
          <motion.div
            className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1 }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">{blocksSinceLaunch} / {TOTAL_BLOCKS} blocks</p>
      </div>
      <table className="w-full text-white text-xs sm:text-sm border-collapse">
        <tbody>
          <tr className="bg-gray-700">
            <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Total Tokens</td>
            <td className="py-1 px-2 sm:px-3 border-b border-gray-600"><ToggleDecimals value={totalTokensThisPhase} /> MMM</td>
          </tr>
          {userParticipated && (
            <tr className="bg-gray-700">
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Your Reward</td>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600"><ToggleDecimals value={estimatedReward} /> MMM</td>
            </tr>
          )}
          {userParticipated && (
            <tr className="bg-gray-700">
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Your Contribution</td>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600"><ToggleDecimals value={userCurrentPhaseContributions} /> ETH</td>
            </tr>
          )}
          <tr className={userParticipated ? "" : "bg-gray-700"}>
            <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Participants</td>
            <td className="py-1 px-2 sm:px-3 border-b border-gray-600">{participantsCount}</td>
          </tr>
          {!userParticipated && (
            <tr>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Phase Contributions</td>
              <td className="py-1 px-2 sm:px-3 border-b border-gray-600"><ToggleDecimals value={currentPhaseContributions} /> ETH</td>
            </tr>
          )}
          <tr className={userParticipated ? "bg-gray-700" : ""}>
            <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Launch Phase End</td>
            <td className="py-1 px-2 sm:px-3 border-b border-gray-600">{phaseEndBlock}</td>
          </tr>
          <tr>
            <td className="py-1 px-2 sm:px-3 border-b border-gray-600">Remaining Blocks</td>
            <td className="py-1 px-2 sm:px-3 border-b border-gray-600">{remainingBlocks > 0 ? remainingBlocks : 0}</td>
          </tr>
        </tbody>
      </table>
    </motion.div>
  );
};

const MintedTokensChart = ({ data }: { data: HistoricalData[] }) => {
  // Transform phase numbers to "Phase X" format
  const formattedData = data.map(item => ({
    phase: `Phase ${item.phase}`,
    minted: item.minted,
  }));

  return (
    <motion.div
      className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg border border-gray-700 mb-4 sm:mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.7 }}
    >
      <h3 className="text-sm sm:text-base font-semibold text-white mb-3">Your Minted Tokens</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={formattedData}>
          <XAxis dataKey="phase" type="category" tick={{ fontSize: 10, fill: "#fff" }} />
          <Line type="monotone" dataKey="minted" stroke="#10b981" strokeWidth={2} dot={{ fill: "#6ee7b7" }} name="Minted (MMM)" />
          <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", color: "#fff", fontSize: "10px" }} />
          <Legend wrapperStyle={{ color: "#fff", fontSize: "10px", maxHeight: "20px", overflowY: "auto" }} />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

const ContributionsChart = ({ data }: { data: HistoricalData[] }) => {
  // Transform phase numbers to "Phase X" format
  const formattedData = data.map(item => ({
    phase: `Phase ${item.phase}`,
    contributions: item.contributions,
  }));

  return (
    <motion.div
      className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-lg border border-gray-700 mb-4 sm:mb-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.7 }}
    >
      <h3 className="text-sm sm:text-base font-semibold text-white mb-3">Your Contributions</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={formattedData}>
          <XAxis dataKey="phase" type="category" tick={{ fontSize: 10, fill: "#fff" }} />
          <Line type="monotone" dataKey="contributions" stroke="#4f46e5" strokeWidth={2} dot={{ fill: "#818cf8" }} name="Contributions (ETH)" />
          <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", color: "#fff", fontSize: "10px" }} />
          <Legend wrapperStyle={{ color: "#fff", fontSize: "10px", maxHeight: "20px", overflowY: "auto" }} />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

// Main Component
export default function Home() {
  const { address: account, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const { sendTransaction, data: txData, error: txError, isSuccess, isError } = useSendTransaction();

  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [currentPhase, setCurrentPhase] = useState<number>(0);
  const [totalMinted, setTotalMinted] = useState<string>("0");
  const [blockNumber, setBlockNumber] = useState<number>(0);
  const [launchBlock, setLaunchBlock] = useState<number>(0);
  const [userContributions, setUserContributions] = useState<string>("0");
  const [totalContributions, setTotalContributions] = useState<string>("0");
  const [ethAmount, setEthAmount] = useState<string>("0.01");
  const [activeNetwork, setActiveNetwork] = useState<ChainId>(sepolia.id);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false); // Changed to false initially for testing
  const [mintablePhases, setMintablePhases] = useState<number[]>([]);
  const [nextPhaseBlocks, setNextPhaseBlocks] = useState<number>(0);
  const [estimatedReward, setEstimatedReward] = useState<string>("0");
  const [phaseContributions, setPhaseContributions] = useState<string[]>(Array(PHASES.length).fill("0"));
  const [participantsCount, setParticipantsCount] = useState<number>(0);
  const [totalParticipants, setTotalParticipants] = useState<number>(0);
  const [tokensMintedThisPhase, setTokensMintedThisPhase] = useState<string>("N/A");
  const [historicalData, setHistoricalData] = useState<HistoricalData[]>([]);
  const [currentPhaseContributions, setCurrentPhaseContributions] = useState<string>("0");
  const [userCurrentPhaseContributions, setUserCurrentPhaseContributions] = useState<string>("0");
  const [totalTokensThisPhase, setTotalTokensThisPhase] = useState<string>(PHASES[0].amount);
  const [phaseEndBlock, setPhaseEndBlock] = useState<number>(0);
  const [phaseParticipants, setPhaseParticipants] = useState<PieData[]>([]);
  const [totalParticipantsData, setTotalParticipantsData] = useState<PieData[]>([]);

  const launchPhaseProgress = blockNumber && launchBlock > 0 ? Math.min(((blockNumber - launchBlock) / TOTAL_BLOCKS) * 100, 100) : 0;
  const blocksSinceLaunch = blockNumber - launchBlock;
  const userParticipated = parseFloat(userCurrentPhaseContributions) > 0;

  useEffect(() => {
    if (chainId && (chainId === sepolia.id || chainId === mainnet.id)) setActiveNetwork(chainId as ChainId);
  }, [chainId]);

  const connectWallet = useCallback(() => {
    const metaMaskConnector = connectors.find((c) => c.name === "MetaMask");
    if (!metaMaskConnector) return alert("MetaMask not found!");
    try {
      connect({ connector: metaMaskConnector });
    } catch (error) {
      console.error("Wallet connection failed:", error);
    }
  }, [connectors, connect]);

  const disconnectWallet = useCallback(() => {
    disconnect();
    setProvider(null);
    setSigner(null);
    setContract(null);
    setCurrentPhase(0);
    setTotalMinted("0");
    setBlockNumber(0);
    setLaunchBlock(0);
    setUserContributions("0");
    setTotalContributions("0");
    setErrorMessage(null);
    setIsLoading(false);
    setMintablePhases([]);
    setNextPhaseBlocks(0);
    setEstimatedReward("0");
    setPhaseContributions(Array(PHASES.length).fill("0"));
    setParticipantsCount(0);
    setTotalParticipants(0);
    setTokensMintedThisPhase("N/A");
    setHistoricalData([]);
    setCurrentPhaseContributions("0");
    setUserCurrentPhaseContributions("0");
    setTotalTokensThisPhase(PHASES[0].amount);
    setPhaseEndBlock(0);
    setPhaseParticipants([]);
    setTotalParticipantsData([]);
  }, [disconnect]);

  const fetchContractData = useCallback(async (contractInstance: ethers.Contract, prov: ethers.BrowserProvider, user: string) => {
    try {
      const phase = Number(await contractInstance.getCurrentPhase()) || 0;
      const minted = await contractInstance.totalSupply();
      const block = await prov.getBlockNumber();
      const launch = Number(await contractInstance.launchBlock()) || 0;

      let aggregatedUserContrib = BigInt(0);
      let aggregatedTotalContrib = BigInt(0);
      const mintable: number[] = [];
      const phaseContribs = Array(PHASES.length).fill("0");
      const historical: HistoricalData[] = [];
      const phaseParticipantsData: PieData[] = [];
      const allContributors: Map<string, PieData> = new Map();

      for (let i = 0; i < PHASES.length; i++) {
        const userContrib = await contractInstance.contributions(i, user);
        const totalContrib = await contractInstance.totalContributions(i);
        const hasMinted = await contractInstance.hasMinted(i, user);
        const phaseEnd = i === 0 ? launch + 200 : i >= PHASES.length - 1 ? launch + 1337 : launch + 200 + i * 100;

        if (userContrib > 0 && block > phaseEnd && !hasMinted) mintable.push(i);
        aggregatedUserContrib += userContrib;
        aggregatedTotalContrib += totalContrib;
        phaseContribs[i] = ethers.formatEther(userContrib);

        const contributors = await contractInstance.getPhaseContributors(i);
        contributors.forEach((addr: string) => {
          if (!allContributors.has(addr)) {
            allContributors.set(addr, { name: `${addr.slice(0, 6)}...`, value: 0, address: addr, tokens: 0 });
          }
        });

        historical.push({
          phase: i.toString(), // Keep as numeric for internal use, transform in charts
          contributions: parseFloat(ethers.formatEther(totalContrib)),
          minted: hasMinted ? parseFloat(PHASES[i].amount) : 0,
        });

        for (const addr of contributors) {
          const contrib = await contractInstance.contributions(i, addr);
          if (contrib > BigInt(0)) {
            const userShare = parseFloat(ethers.formatEther(contrib));
            const totalPhaseContrib = parseFloat(ethers.formatEther(totalContrib));
            const tokenShare = totalPhaseContrib > 0 && !hasMinted ? (userShare / totalPhaseContrib) * parseFloat(PHASES[i].amount) : 0;
            const existing = allContributors.get(addr)!;
            existing.value += userShare;
            existing.tokens = (existing.tokens || 0) + tokenShare; // Accumulate tokens across phases
          }
        }

        if (i === phase) {
          for (const addr of contributors) {
            const contrib = await contractInstance.contributions(phase, addr);
            if (contrib > BigInt(0)) {
              const userShare = parseFloat(ethers.formatEther(contrib));
              const totalPhaseContrib = parseFloat(ethers.formatEther(totalContrib));
              const tokenShare = totalPhaseContrib > 0 ? (userShare / totalPhaseContrib) * parseFloat(PHASES[phase].amount) : 0;
              phaseParticipantsData.push({
                name: `${addr.slice(0, 6)}...`,
                value: userShare,
                address: addr,
                tokens: tokenShare,
              });
            }
          }
        }
      }

      const currentPhaseUserContrib = await contractInstance.contributions(phase, user);
      const currentPhaseTotalContrib = await contractInstance.totalContributions(phase);
      const estimatedRewardStr =
        currentPhaseUserContrib > BigInt(0) && currentPhaseTotalContrib > BigInt(0)
          ? ethers.formatEther(
              (currentPhaseUserContrib * BigInt(PHASES[phase].amount) * BigInt(10 ** 18)) /
                currentPhaseTotalContrib
            )
          : "0";

      const phaseEnd = phase === 0 ? launch + 200 : phase >= PHASES.length - 1 ? launch + 1337 : launch + 200 + phase * 100;

      setUserContributions(ethers.formatEther(aggregatedUserContrib));
      setTotalContributions(ethers.formatEther(aggregatedTotalContrib));
      setCurrentPhase(phase);
      setTotalMinted(ethers.formatEther(minted));
      setBlockNumber(block);
      setLaunchBlock(launch);
      setNextPhaseBlocks(phaseEnd - block);
      setMintablePhases(mintable);
      setPhaseContributions(phaseContribs);
      setEstimatedReward(estimatedRewardStr);
      setParticipantsCount(phaseParticipantsData.length);
      setTotalParticipants(allContributors.size);
      setTokensMintedThisPhase("N/A");
      setHistoricalData(historical);
      setCurrentPhaseContributions(ethers.formatEther(currentPhaseTotalContrib));
      setUserCurrentPhaseContributions(ethers.formatEther(currentPhaseUserContrib));
      setTotalTokensThisPhase(PHASES[phase].amount);
      setPhaseEndBlock(phaseEnd);
      setPhaseParticipants(phaseParticipantsData);
      setTotalParticipantsData(Array.from(allContributors.values()));
    } catch (error) {
      console.error("Failed to fetch contract data:", error);
      setErrorMessage("Error fetching blockchain data.");
    }
  }, []);

  const initProvider = useCallback(async () => {
    if (isConnected && walletClient && account) {
      setIsLoading(true);
      try {
        switchChain({ chainId: activeNetwork });
        const provider = new ethers.BrowserProvider(walletClient);
        const signer = await provider.getSigner();
        const contractInstance = new ethers.Contract(CONTRACT_ADDRESSES[activeNetwork], ABI, signer);
        setProvider(provider);
        setSigner(signer);
        setContract(contractInstance);
        await fetchContractData(contractInstance, provider, account);
      } catch (error) {
        console.error("Initialization failed:", error);
        setErrorMessage("Failed to connect to blockchain.");
      } finally {
        setIsLoading(false);
      }
    }
  }, [isConnected, walletClient, account, activeNetwork, switchChain, fetchContractData]);

  useEffect(() => {
    initProvider();
  }, [initProvider]);

  const sendEth = useCallback(() => {
    if (!isConnected || !signer) return alert("Please connect your wallet!");
    if (parseFloat(ethAmount) < parseFloat(MINIMUM_ETH)) {
      setErrorMessage("Minimum contribution is 0.001 ETH.");
      return;
    }
    setErrorMessage(null);
    sendTransaction({
      to: CONTRACT_ADDRESSES[activeNetwork] as `0x${string}`,
      value: parseEther(ethAmount),
      chainId: activeNetwork,
    });
  }, [isConnected, signer, ethAmount, activeNetwork, sendTransaction]);

  const mintTokens = useCallback(async (phase: number) => {
    if (!contract || !account) return alert("Please connect your wallet!");
    try {
      setIsLoading(true);
      const userPhaseContrib = await contract.contributions(phase, account);
      if (userPhaseContrib === BigInt(0)) return alert("No contributions for this phase!");
      if (await contract.hasMinted(phase, account)) return alert("Already minted for this phase!");
      const tx = await contract.mintUserShare(phase, {
        gasLimit: BASE_GAS_LIMIT, // Match single mint gas limit
      });
      await tx.wait();
      alert(`Minted tokens from Phase ${phase}!`);
      await fetchContractData(contract, provider!, account);
    } catch (error: unknown) {
      console.error("Minting failed:", error);
      // Type guard to check if error is an Error object
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      alert(`Minting failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [contract, account, provider, fetchContractData]);

  const multiMint = useCallback(async () => {
    if (!contract || !account) {
      alert("Please connect your wallet!");
      return;
    }
    if (mintablePhases.length === 0) {
      alert("No eligible phases to mint!");
      return;
    }
    console.log("Starting multiMint with phases:", mintablePhases);
    try {
      setIsLoading(true);
      // Process each phase individually to match single mint cost
      for (const phase of mintablePhases) {
        console.log("Processing phase:", phase);
        const tx = await contract.mintUserShare(phase, {
          gasLimit: BASE_GAS_LIMIT, // Use same gas limit as single mint
        });
        console.log("Transaction sent for phase:", tx.hash);
        await tx.wait();
        console.log("Phase transaction confirmed");
      }
      alert(`Minted tokens for all eligible phases: ${mintablePhases.join(", ")}`);
      await fetchContractData(contract, provider!, account);
    } catch (error: unknown) {
      console.error("Multi-minting failed:", error);
      // Type guard to check if error is an Error object
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      alert(`Multi-minting failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [contract, account, mintablePhases, provider, fetchContractData]);

  useEffect(() => {
    if (isSuccess && txData) {
      alert(`Transaction successful! Hash: ${txData}`);
      if (contract && provider && account) fetchContractData(contract, provider, account);
    }
    if (isError && txError) {
      console.error("Transaction failed:", txError);
      alert(`Transaction failed: ${txError.message || "Unknown error"}`);
    }
  }, [isSuccess, isError, txData, txError, contract, provider, account, fetchContractData]);

  useEffect(() => {
    if (contract && provider && account && !isLoading) {
      fetchContractData(contract, provider, account);
      const interval = setInterval(() => fetchContractData(contract, provider, account), 5000);
      return () => clearInterval(interval);
    }
  }, [contract, provider, account, isLoading, fetchContractData]);

  const pieData = useMemo(() => 
    phaseContributions.map((contrib, index) => ({ name: `Phase ${index}`, value: parseFloat(contrib) })).filter(item => item.value > 0),
    [phaseContributions]
  );

  const handleSetActiveNetwork = useCallback((networkId: number) => {
    setActiveNetwork(networkId as ChainId);
  }, []);

  return (
    <div className="text-white">
      <style>{globalStyles}</style>
      <Navbar
        account={account}
        provider={provider}
        connectWallet={connectWallet}
        disconnectWallet={disconnectWallet}
        activeNetwork={activeNetwork}
        setActiveNetwork={handleSetActiveNetwork}
      />
      <div className="container mx-auto p-4 sm:p-6">
        <motion.header
          className="text-center mb-6 sm:mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <FaEthereum className="text-indigo-400 text-3xl sm:text-4xl mx-auto animate-pulse" />
          <h1 className="text-lg sm:text-2xl font-extrabold mt-2 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-500">
            MrManMan (MMM) Token
          </h1>
          <p className="text-xs sm:text-sm text-gray-300 mt-1">Advanced Token Management Dashboard</p>
        </motion.header>

        {isLoading ? (
          <div className="text-center text-gray-400 text-sm">Loading blockchain data...</div>
        ) : errorMessage ? (
          <div className="text-center text-red-400 text-sm">{errorMessage}</div>
        ) : (
          <>
            <motion.div
              className="mb-6 sm:mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <PhaseProgress
                progress={launchPhaseProgress}
                blocksSinceLaunch={blocksSinceLaunch}
                estimatedReward={estimatedReward}
                totalTokensThisPhase={totalTokensThisPhase}
                remainingBlocks={nextPhaseBlocks}
                phaseEndBlock={phaseEndBlock}
                currentPhase={currentPhase}
                userCurrentPhaseContributions={userCurrentPhaseContributions}
                participantsCount={participantsCount}
                currentPhaseContributions={currentPhaseContributions}
              />
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 gap-6 mb-6 sm:mb-8">
              <div className="lg:order-2">
                <h2 className="text-lg sm:text-xl font-bold text-white mb-6 sm:mb-8">Your Participation</h2>
                <div className="grid grid-cols-1 gap-4 sm:gap-6">
                  {/* Personal Data (Cards and Charts) */}
                  <ParticipateCard ethAmount={ethAmount} setEthAmount={setEthAmount} errorMessage={errorMessage} sendEth={sendEth} />
                  <MintCard mintablePhases={mintablePhases} mintTokens={mintTokens} multiMint={multiMint} isLoading={isLoading} />
                  <ParticipationCard 
                    userContributions={userContributions} 
                    participantsCount={participantsCount} 
                    tokensMintedThisPhase={tokensMintedThisPhase} 
                    phaseContributions={phaseContributions} 
                  />
                  <ParticipationPieChart data={pieData} />
                  <MintedTokensChart data={historicalData} />
                  <ContributionsChart data={historicalData} />
                </div>
              </div>
              <div className="lg:order-3">
                <h2 className="text-lg sm:text-xl font-bold text-white mb-6 sm:mb-8">Project Overview</h2>
                <div className="grid grid-cols-1 gap-4 sm:gap-6">
                  {/* Global/Informational Data */}
                  <Stats
                    globalStats={{ totalMinted, totalContributions, totalParticipants }}
                    phaseStats={{
                      currentPhase,
                      currentPhaseContributions,
                      currentPhaseParticipants: participantsCount,
                      userCurrentPhaseContributions,
                      currentPhaseTokens: totalTokensThisPhase,
                      userParticipated,
                    }}
                  />
                  <GlobalPieChart totalData={totalParticipantsData} totalMinted={totalMinted} />
                  <MarketCapPieChart totalMinted={totalMinted} />
                  <PhaseParticipantsPieChart phaseData={phaseParticipants} totalTokens={totalTokensThisPhase} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}