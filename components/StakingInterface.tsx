"use client";

import React, { useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { FaLock, FaInfoCircle, FaExclamationTriangle } from "react-icons/fa";

interface StakingInterfaceProps {
  isConnected: boolean;
  tokenSymbol?: string; // e.g., MMM
  totalStaked?: string; // optional, for share% estimate
  defaults?: {
    graceDays?: number;
    earlyPenaltyMaxBps?: number; // 9000 = 90%
    latePenaltyBpsPerDay?: number; // 100 = 1% per day
    latePenaltyMaxBps?: number; // 5000 = 50%
    stakerRewardBps?: number; // 7000 = 70%
    holderRewardBps?: number; // 3000 = 30%
    maxLockDays?: number; // 365 default
    penaltyReceiverBps?: number; // optional third receiver share
    penaltyReceiverAddr?: string; // optional receiver address
  };
  onStake?: (amount: string, lockDays: number) => Promise<void> | void; // optional, if wired later
}

const DEFAULTS = {
  graceDays: 30,
  earlyPenaltyMaxBps: 9000,
  latePenaltyBpsPerDay: 100,
  latePenaltyMaxBps: 5000,
  stakerRewardBps: 7000,
  holderRewardBps: 3000,
  maxLockDays: 365,
};

export default function StakingInterface({ isConnected, tokenSymbol = "MMM", totalStaked, defaults, onStake }: StakingInterfaceProps) {
  const cfg = useMemo(() => ({ ...DEFAULTS, ...(defaults || {}) }), [defaults]);
  const [amount, setAmount] = useState("0");
  const [lockDays, setLockDays] = useState<number>(90);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const now = Date.now();
  const maturity = useMemo(() => new Date(now + lockDays * 86400_000), [now, lockDays]);
  const graceEnd = useMemo(() => new Date(maturity.getTime() + cfg.graceDays * 86400_000), [maturity, cfg.graceDays]);

  function formatDate(d: Date) {
    return d.toLocaleString();
  }

  function formatBps(bps?: number) {
    if (bps === undefined || bps === null || isNaN(bps)) return 'N/A';
    return `${(bps / 100).toFixed(2)}%`;
  }

const short = (a?: string) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : 'receiver');

const penaltySplitLine = useMemo(() => {
  const parts: string[] = [];
  if (cfg.stakerRewardBps && cfg.stakerRewardBps > 0) {
    parts.push(`${formatBps(cfg.stakerRewardBps)} to stakers`);
  }
  if (cfg.holderRewardBps && cfg.holderRewardBps > 0) {
    parts.push(`${formatBps(cfg.holderRewardBps)} to holders`);
  }
  if (cfg.penaltyReceiverBps && cfg.penaltyReceiverBps > 0) {
    parts.push(`${formatBps(cfg.penaltyReceiverBps)} to ${short(cfg.penaltyReceiverAddr)}`);
  }
  return parts.length > 0 ? `Penalty redistribution: ${parts.join(', ')}` : '';
}, [cfg]);

  // HEX-like: Early penalty scales linearly with remaining time
  const calcEarlyPenaltyBps = useCallback((progressFraction: number) => {
    const remaining = Math.max(0, 1 - Math.min(1, progressFraction));
    return Math.floor(cfg.earlyPenaltyMaxBps * remaining);
  }, [cfg.earlyPenaltyMaxBps]);

  // After grace: accrue per-day up to cap
  const calcLatePenaltyBps = useCallback((daysLate: number) => {
    const accrued = daysLate * cfg.latePenaltyBpsPerDay;
    return Math.min(cfg.latePenaltyMaxBps, accrued);
  }, [cfg.latePenaltyBpsPerDay, cfg.latePenaltyMaxBps]);

  const previews = useMemo(() => {
    const p25 = calcEarlyPenaltyBps(0.25);
    const p50 = calcEarlyPenaltyBps(0.5);
    const p75 = calcEarlyPenaltyBps(0.75);
    const late10 = calcLatePenaltyBps(10);
    return { p25, p50, p75, late10 };
  }, [calcEarlyPenaltyBps, calcLatePenaltyBps]);

  const canStake = isConnected && !isSubmitting && parseFloat(amount) > 0 && lockDays > 0;

  async function handleConfirm() {
    try {
      setIsSubmitting(true);
      if (onStake) {
        await onStake(amount, lockDays);
      } else {
        alert("Staking contract not deployed yet. We'll wire this action once ready.");
      }
      setConfirmOpen(false);
    } catch (e) {
      // surface minimal error
      alert((e as Error)?.message || "Failed to stake");
    } finally {
      setIsSubmitting(false);
    }
  }
  const amtNum = useMemo(() => parseFloat(amount) || 0, [amount]);
  
  // HEX-like bonus calculation (matches contract's _stakeStartBonusDrops)
  const estBonusAndShares = useMemo(() => {
    if (amtNum <= 0 || lockDays <= 0) return { 
      bonus: 0, 
      totalShares: 0, 
      bonusPct: 0, 
      totalAtMaturity: 0,
      biggerPaysBonus: 0,
      biggerPaysBonusPct: 0,
      longerPaysBonus: 0,
      longerPaysBonusPct: 0
    };
    
    const newStakedDrops = amtNum; // Amount in tokens (assumes 18 decimals normalized)
    const newStakedDays = lockDays;
    
    // Longer Pays Better: up to 3640 days bonus
    const maxBonusDays = 3640;
    const cappedExtraDays = Math.max(0, Math.min(newStakedDays - 1, maxBonusDays));
    
    // Bigger Pays Better: up to 10% bonus for larger stakes
    const maxStake = 150_000_000; // 150M tokens
    const cappedStakedDrops = Math.min(newStakedDrops, maxStake);
    
    // Constants from contract
    const LPB = 1820; // 364 * 100 / 20
    const BPB = 1_500_000_000; // maxStake * 100 / 10
    
    // Calculate bonuses separately
    const longerPaysBonus = (newStakedDrops * cappedExtraDays * BPB) / (LPB * BPB);
    const biggerPaysBonus = (newStakedDrops * cappedStakedDrops * LPB) / (LPB * BPB);
    const totalBonus = longerPaysBonus + biggerPaysBonus;
    
    // For display: estimate shares (simplified - actual depends on shareRate which varies)
    // Share formula: (newStakedDrops + bonusDrops) * SHARE_RATE_SCALE / shareRate
    // We'll show an estimate based on current shareRate ~= 1 (typical)
    const SHARE_RATE_SCALE = 1e5;
    const estimatedShareRate = 1e5; // Assume 1:1 ratio for display
    const totalShares = ((newStakedDrops + totalBonus) * SHARE_RATE_SCALE) / estimatedShareRate;
    
    const bonusPct = totalBonus > 0 ? (totalBonus / newStakedDrops) * 100 : 0;
    const biggerPaysBonusPct = biggerPaysBonus > 0 ? (biggerPaysBonus / newStakedDrops) * 100 : 0;
    const longerPaysBonusPct = longerPaysBonus > 0 ? (longerPaysBonus / newStakedDrops) * 100 : 0;
    
    return { 
      bonus: totalBonus, 
      totalShares: totalShares,
      bonusPct: bonusPct,
      totalAtMaturity: newStakedDrops + totalBonus,
      biggerPaysBonus: biggerPaysBonus,
      biggerPaysBonusPct: biggerPaysBonusPct,
      longerPaysBonus: longerPaysBonus,
      longerPaysBonusPct: longerPaysBonusPct
    };
  }, [amtNum, lockDays]);
  
  const poolStaked = useMemo(() => parseFloat(totalStaked || '0'), [totalStaked]);
  const approxSharePct = useMemo(() => {
    const denom = poolStaked + amtNum + estBonusAndShares.bonus;
    return denom > 0 ? ((amtNum + estBonusAndShares.bonus) / denom) * 100 : 0;
  }, [poolStaked, amtNum, estBonusAndShares.bonus]);


  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <FaExclamationTriangle className="mt-0.5 text-amber-300" />
          <div className="text-sm text-amber-100/90">
            <p className="font-semibold">Binding commitment. No partial exits.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Early exit penalty: up to {formatBps(cfg.earlyPenaltyMaxBps)} (linear with remaining time)</li>
              <li>Grace period after maturity: {cfg.graceDays || 30} days (no penalty)</li>
              <li>Late end penalty after grace: {formatBps(cfg.latePenaltyBpsPerDay)} per day, capped at {formatBps(cfg.latePenaltyMaxBps)}</li>
              {penaltySplitLine && <li>{penaltySplitLine}</li>}
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
        <div>
          <label className="block text-sm text-gray-300 mb-1">Amount</label>
          <input
            type="number"
            min="0"
            step="0.0001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder={`0.0 ${tokenSymbol}`}
          />
          <div className="text-xs text-gray-400 mt-1">Token: {tokenSymbol}</div>
        </div>
        <div className="lg:col-span-2">
          <label className="block text-sm text-gray-300 mb-1">Lock Duration: {lockDays} days</label>
          <input
            type="range"
            min={1}
            max={cfg.maxLockDays}
            value={lockDays}
            onChange={(e) => setLockDays(parseInt(e.target.value))}
            className="w-full"
          />
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-300">
            <div className="rounded border border-white/10 p-2">
              <div className="text-gray-400">Starts</div>
              <div className="font-mono text-white">{formatDate(new Date(now))}</div>
            </div>
            <div className="rounded border border-white/10 p-2">
              <div className="text-gray-400">Maturity</div>
              <div className="font-mono text-white">{formatDate(maturity)}</div>
            </div>
            <div className="rounded border border-white/10 p-2">
              <div className="text-gray-400">Grace ends</div>
              <div className="font-mono text-white">{formatDate(graceEnd)}</div>
            </div>
            <div className="rounded border border-white/10 p-2">
              <div className="text-gray-400">Max lock</div>
              <div className="font-mono text-white">{cfg.maxLockDays} days</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded border border-white/10 bg-white/5 p-3 text-xs">
              <div className="text-gray-400">Your est. shares</div>
              <div className="font-mono text-white mt-1">{estBonusAndShares.totalShares.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-3 text-xs">
              <div className="text-gray-400">Bigger Pays Better</div>
              <div className="font-mono text-white mt-1">
                {estBonusAndShares.biggerPaysBonusPct > 0 ? `+${estBonusAndShares.biggerPaysBonusPct.toFixed(2)}%` : '0%'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {estBonusAndShares.biggerPaysBonus > 0 ? `${estBonusAndShares.biggerPaysBonus.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${tokenSymbol}` : 'No bonus'}
              </div>
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-3 text-xs">
              <div className="text-gray-400">Longer Pays Better</div>
              <div className="font-mono text-white mt-1">
                {estBonusAndShares.longerPaysBonusPct > 0 ? `+${estBonusAndShares.longerPaysBonusPct.toFixed(2)}%` : '0%'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {estBonusAndShares.longerPaysBonus > 0 ? `${estBonusAndShares.longerPaysBonus.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${tokenSymbol}` : 'No bonus'}
              </div>
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-3 text-xs">
              <div className="text-gray-400">Approx. pool share</div>
              <div className="font-mono text-white mt-1">{Number.isFinite(approxSharePct) ? `${approxSharePct.toFixed(2)}%` : '\u2014'}</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="rounded border border-white/10 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 p-3 text-xs">
              <div className="text-gray-400">Est. MMM at maturity</div>
              <div className="font-mono text-white mt-1 text-lg font-semibold">{estBonusAndShares.totalAtMaturity.toLocaleString(undefined, { maximumFractionDigits: 4 })} {tokenSymbol}</div>
              <div className="text-xs text-gray-400 mt-0.5">+ variable rewards</div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <FaInfoCircle className="text-indigo-300" /> Penalty preview
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="rounded border border-white/10 bg-indigo-500/10 p-3">
            <div className="text-gray-300">Exit at 25%</div>
            <div className="mt-1 font-mono text-white">{formatBps(previews.p25)}</div>
          </div>
          <div className="rounded border border-white/10 bg-indigo-500/10 p-3">
            <div className="text-gray-300">Exit at 50%</div>
            <div className="mt-1 font-mono text-white">{formatBps(previews.p50)}</div>
          </div>
          <div className="rounded border border-white/10 bg-indigo-500/10 p-3">
            <div className="text-gray-300">Exit at 75%</div>
            <div className="mt-1 font-mono text-white">{formatBps(previews.p75)}</div>
          </div>
          <div className="rounded border border-white/10 bg-purple-500/10 p-3">
            <div className="text-gray-300">10 days after grace</div>
            <div className="mt-1 font-mono text-white">{formatBps(previews.late10)}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {!isConnected && (
          <span className="text-xs text-gray-400">Connect wallet to stake</span>
        )}
        <button
          type="button"
          disabled={!canStake}
          onClick={() => setConfirmOpen(true)}
          className="px-4 py-2 rounded-lg font-semibold disabled:bg-gray-600"
          style={{
            background: canStake ? `linear-gradient(to right, var(--primary), var(--accent))` : undefined,
          }}
          title={!isConnected ? "Connect wallet to stake" : undefined}
        >
          <span className="inline-flex items-center gap-2">
            <FaLock /> Stake {tokenSymbol}
          </span>
        </button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-xl border border-white/20 bg-gray-900/95 backdrop-blur-md p-6 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-white mb-2">Confirm Stake</h3>
            <div className="text-sm text-gray-300 space-y-2">
              <div><span className="text-gray-400">Amount:</span> <span className="font-mono text-white">{amount} {tokenSymbol}</span></div>
              <div><span className="text-gray-400">Lock:</span> <span className="font-mono text-white">{lockDays} days</span></div>
              <div><span className="text-gray-400">Maturity:</span> <span className="font-mono text-white">{formatDate(maturity)}</span></div>
              <div><span className="text-gray-400">Grace ends:</span> <span className="font-mono text-white">{formatDate(graceEnd)}</span></div>
            </div>
            <div className="mt-4 rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1 blur-xl">
              <div className="font-semibold">Please read carefully:</div>
              <ul className="list-disc pl-4">
                <li>This stake is a binding agreement with no partial exits.</li>
                <li>Emergency exit before maturity incurs up to {formatBps(cfg.earlyPenaltyMaxBps)} penalty, scaling linearly with remaining time.</li>
                <li>No penalty for ending during the {cfg.graceDays}-day grace period after maturity.</li>
                <li>After grace, late penalty accrues at {formatBps(cfg.latePenaltyBpsPerDay)} per day up to {formatBps(cfg.latePenaltyMaxBps)}.</li>
                <li>{penaltySplitLine}</li>
              </ul>
            </div>
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-3 py-2 rounded-md text-sm bg-gray-700 hover:bg-gray-600"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-md text-sm font-semibold disabled:bg-gray-600"
                style={{ background: `linear-gradient(to right, var(--primary), var(--accent))` }}
                onClick={handleConfirm}
              >
                {isSubmitting ? "Submitting..." : "I understand and agree"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

