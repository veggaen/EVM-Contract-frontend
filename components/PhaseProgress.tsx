'use client';

import { motion } from 'framer-motion';
import { FaCoins, FaEthereum, FaAward, FaUsers, FaStream } from 'react-icons/fa';

// Helper component for number formatting
function ToggleDecimals({ value }: { value: string }) {
  const numValue = parseFloat(value);

  if (numValue >= 1000000) {
    return <span>{(numValue / 1000000).toFixed(2)}M</span>;
  } else if (numValue >= 1000) {
    return <span>{(numValue / 1000).toFixed(2)}K</span>;
  } else if (numValue < 1) {
    return <span>{numValue.toFixed(4)}</span>;
  } else {
    return <span>{numValue.toFixed(2)}</span>;
  }
}

interface PhaseProgressProps {
  currentPhase: number;
  isLaunchComplete: boolean;
  totalProgress: number;
  phaseProgress: number;
  blocksSinceLaunch: number;
  totalBlocks: number;
  blocksLeft: number;
  isLoading?: boolean;
  totalTokensThisPhase?: string;
  userCurrentPhaseContributions?: string;
  estimatedReward?: string;
  isConnected?: boolean;
  userParticipated?: boolean;
  userContribFlash?: boolean;
  estRewardFlash?: boolean;
  totalProgFlash?: boolean;
  phaseProgFlash?: boolean;
  participantsCount?: number;
  participantsFlash?: boolean;
  phaseStartBlock?: number;
  phaseEndBlock?: number;
  // Time-based (MMM_02)
  isTimeBased?: boolean;
  launchTimestamp?: number;
  scheduleEndTs?: number;
  currentPhaseStartTs?: number;
  currentPhaseEndTs?: number;
  phaseCount?: number;
  nextPhase?: number | null;
  nextPhaseStartTs?: number;
  nextPhaseEndTs?: number;
  nextPhaseAllocation?: bigint;
}

export default function PhaseProgress({
  currentPhase,
  isLaunchComplete,
  totalProgress,
  phaseProgress,
  blocksSinceLaunch,
  totalBlocks,
  // blocksLeft, // Not used in current implementation
  isLoading = false,
  totalTokensThisPhase,
  userCurrentPhaseContributions,
  estimatedReward,
  isConnected = false,
  userParticipated = false,
  userContribFlash = false,
  estRewardFlash = false,
  totalProgFlash = false,
  phaseProgFlash = false,
  participantsCount = 0,
  participantsFlash = false,
  phaseStartBlock,
  phaseEndBlock,
  // time-based
  isTimeBased = false,
  launchTimestamp,
  scheduleEndTs,
  currentPhaseStartTs,
  currentPhaseEndTs,
  phaseCount,
  nextPhase,
  nextPhaseStartTs,
  nextPhaseEndTs,
  nextPhaseAllocation,
}: PhaseProgressProps) {
  if (isLoading) {
    return (
      <motion.div
        className="glass p-6 ring-white/10 space-y-6"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--primary)' }}>
          Loading Phase Data...
        </h2>
        <div className="glass p-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading...</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--primary)' }}>
        {isLaunchComplete ? "Launch Complete" : `Phase ${currentPhase} Progress`}
      </h2>

      {isLaunchComplete ? (
        <p className="text-gray-300">
          {isTimeBased && launchTimestamp && scheduleEndTs
            ? <>The token launch has concluded after {Math.max(0, Math.floor((scheduleEndTs - launchTimestamp) / 86400))} days.</>
            : <>The token launch has concluded after {blocksSinceLaunch} blocks.</>
          }
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-300">
              {isTimeBased && launchTimestamp && scheduleEndTs && phaseCount
                ? <>Total Progress: {Math.round(totalProgress)}% (Phase {currentPhase} / {phaseCount})</>
                : <>Total Progress: {Math.round(totalProgress)}% ({blocksSinceLaunch} / {totalBlocks} blocks)</>
              }
            </p>
            <div className={`bg-gray-700 h-3 rounded-full overflow-hidden progress-shine ${totalProgFlash ? 'shine-active' : ''}`}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(to right, var(--primary), var(--accent), var(--secondary))` }}
                initial={{ width: 0 }}
                animate={{ width: `${totalProgress}%` }}
                transition={{ duration: 1 }}
              />
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-300">Phase Progress: {Math.round(phaseProgress)}%</p>
            <div className={`bg-gray-700 h-3 rounded-full overflow-hidden progress-shine ${phaseProgFlash ? 'shine-active' : ''}`}>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: 'var(--accent)' }}
                initial={{ width: 0 }}
                animate={{ width: `${phaseProgress}%` }}
                transition={{ duration: 1 }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-3">
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <FaCoins className="text-indigo-300" />
                <span>Total Tokens</span>
              </div>
              <div className="mt-1.5 font-mono text-white">
                {totalTokensThisPhase ? <><ToggleDecimals value={totalTokensThisPhase} /> MMM</> : '0 MMM'}
              </div>
            </div>

            {isConnected && userParticipated && (
              <>
                <div className="rounded-xl border border-emerald-400/10 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-3">
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <FaEthereum className="text-emerald-300" />
                    <span>Your Contribution</span>
                  </div>
                  <div className={`mt-1.5 font-mono text-white ${userContribFlash ? 'flash-text' : ''}`}>
                    {userCurrentPhaseContributions ? <><ToggleDecimals value={userCurrentPhaseContributions} /> ETH</> : '0 ETH'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-gradient-to-br from-amber-500/10 to-pink-500/10 p-3">
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <FaAward className="text-amber-300" />
                    <span>Your Reward</span>
                  </div>
                  <div className={`mt-1.5 font-mono text-white ${estRewardFlash ? 'flash-text' : ''}`}>
                    {estimatedReward ? <><ToggleDecimals value={estimatedReward} /> MMM</> : '0 MMM'}
                  </div>
                </div>
              </>
            )}

            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 p-3">
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <FaUsers className="text-blue-300" />
                <span>Participants</span>
              </div>
              <div className={`mt-1.5 font-mono text-white ${participantsFlash ? 'flash-text' : ''}`}>
                {participantsCount}
              </div>
            </div>

            {(isTimeBased && currentPhaseStartTs && currentPhaseEndTs) ? (
              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-indigo-500/10 p-3 lg:col-span-3">
                <div className="flex items-center gap-2 text-xs text-gray-300">
                  <FaStream className="text-fuchsia-300" />
                  <span>Time</span>
                </div>
                <div className="font-mono text-white">{new Date(currentPhaseStartTs * 1000).toLocaleString()} &rarr; {new Date(currentPhaseEndTs * 1000).toLocaleString()}</div>
              </div>
            ) : (
              phaseStartBlock && phaseEndBlock ? (
                <div className="rounded-xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-indigo-500/10 p-3 lg:col-span-3">
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <FaStream className="text-fuchsia-300" />
                    <span>Blocks</span>
                  </div>
                  <div className="font-mono text-white">{phaseStartBlock} &rarr; {phaseEndBlock}</div>
                </div>
              ) : null
            )}
          </div>
          
          {/* Next Phase Info */}
          {isTimeBased && nextPhase !== null && nextPhase !== undefined && nextPhaseStartTs && nextPhaseEndTs && (
            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-green-500/10 to-teal-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-200 mb-2">
                <FaStream className="text-green-300" />
                <span>Next Phase: Phase {nextPhase}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-gray-400">Starts</div>
                  <div className="font-mono text-white">{nextPhaseStartTs ? new Date(nextPhaseStartTs * 1000).toLocaleString() : '—'}</div>
                  <div className="text-gray-400 mt-1">
                    {nextPhaseStartTs ? (() => {
                      const now = Math.floor(Date.now() / 1000);
                      const secsLeft = nextPhaseStartTs - now;
                      if (secsLeft <= 0) return 'Starting now';
                      const mins = Math.floor(secsLeft / 60);
                      const hours = Math.floor(mins / 60);
                      const days = Math.floor(hours / 24);
                      if (days > 0) return `in ${days}d ${hours % 24}h`;
                      if (hours > 0) return `in ${hours}h ${mins % 60}m`;
                      return `in ${mins}m`;
                    })() : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Duration</div>
                  <div className="font-mono text-white">
                    {nextPhaseStartTs && nextPhaseEndTs ? (() => {
                      const duration = nextPhaseEndTs - nextPhaseStartTs;
                      const hours = Math.floor(duration / 3600);
                      const days = Math.floor(hours / 24);
                      if (days > 0) return `${days}d ${hours % 24}h`;
                      if (hours > 0) return `${hours}h`;
                      return `${Math.floor(duration / 60)}m`;
                    })() : '—'}
                  </div>
                  {nextPhaseAllocation && (
                    <>
                      <div className="text-gray-400 mt-1">Allocation</div>
                      <div className="font-mono text-white">
                        {(() => {
                          const alloc = Number(nextPhaseAllocation) / 1e18;
                          if (alloc >= 1000000) return `${(alloc / 1000000).toFixed(2)}M`;
                          if (alloc >= 1000) return `${(alloc / 1000).toFixed(2)}K`;
                          return alloc.toFixed(2);
                        })()} MMM
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
