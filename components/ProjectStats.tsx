'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FaCoins, FaEthereum, FaUsers, FaChartLine } from 'react-icons/fa';
import Section from "./Section";

interface ProjectStatsProps {
  totalMinted: string;
  totalContributions: string;
  totalParticipants: number;
  totalTokensThisPhase: string;
  currentPhaseContributions: string;
  participantsCount: number;
  isLoading?: boolean;
  isValidated?: boolean;
  totalParticipantsFlash?: boolean;
  participantsFlash?: boolean;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number | React.ReactNode;
  isLoading?: boolean;
  className?: string;
}

function StatCard({ icon, label, value, isLoading, className = '' }: StatCardProps) {
  return (
    <div className={`glass p-3 hover:shadow-2xl transition-shadow duration-300 ${className}`}>
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1.5 font-mono" style={{ color: 'var(--foreground)' }}>
        {isLoading ? (
          <span className="inline-block h-4 w-20 bg-gray-700/60 rounded animate-pulse" />
        ) : (
          value
        )}
      </div>
    </div>
  );
}


function CountUpNumber({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState<number>(value);
  const prevRef = useRef<number>(value);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    const duration = 600; // ms
    const startTs = performance.now();

    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(start + (end - start) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    prevRef.current = value;
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span>{display.toLocaleString(undefined, { maximumFractionDigits: decimals })}</span>;
}

export default function ProjectStats({
  totalMinted,
  totalContributions,
  totalParticipants,
  totalTokensThisPhase,
  currentPhaseContributions,
  participantsCount,
  isLoading = false,
  isValidated = false,
  totalParticipantsFlash = false,
  participantsFlash = false,
}: ProjectStatsProps) {
  return (
    <Section ariaLabel="Project Statistics" title="Project Stats" icon={<FaChartLine className="mr-2" style={{ color: 'var(--primary)' }} /> }>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            <StatCard
              icon={<FaCoins style={{ color: 'var(--primary)' }} />}
              label="Total Minted"
              value={isLoading ? '' : (
                <>
                  <CountUpNumber value={parseFloat(totalMinted)} decimals={2} /> MMM
                </>
              )}
              isLoading={isLoading}
            />

            <StatCard
              icon={<FaEthereum style={{ color: 'var(--accent)' }} />}
              label="Total Contributions"
              value={isLoading ? '' : (
                <>
                  <CountUpNumber value={parseFloat(totalContributions)} decimals={2} /> ETH
                </>
              )}
              isLoading={isLoading}
            />

            <StatCard
              icon={<FaUsers style={{ color: 'var(--secondary)' }} />}
              label="Total Participants"
              value={isLoading ? '' : (
                <span className={totalParticipantsFlash ? 'flash-text' : ''}>
                  <CountUpNumber value={totalParticipants} decimals={0} />
                </span>
              )}
              isLoading={isLoading}
            />

            <StatCard
              icon={<FaCoins style={{ color: 'var(--primary)' }} />}
              label="Phase Tokens"
              value={!isValidated ? '' : (
                <>
                  <CountUpNumber value={parseFloat(totalTokensThisPhase)} decimals={2} /> MMM
                </>
              )}
              isLoading={!isValidated}
            />

            <StatCard
              icon={<FaEthereum style={{ color: 'var(--accent)' }} />}
              label="Phase Contributions"
              value={!isValidated ? '' : (
                <>
                  <CountUpNumber value={parseFloat(currentPhaseContributions)} decimals={2} /> ETH
                </>
              )}
              isLoading={!isValidated}
            />

            <StatCard
              icon={<FaUsers style={{ color: 'var(--secondary)' }} />}
              label="Phase Participants"
              value={!isValidated ? '' : (
                <span className={participantsFlash ? 'flash-text' : ''}>
                  <CountUpNumber value={participantsCount} decimals={0} />
                </span>
              )}
              isLoading={!isValidated}
              className="text-white"
            />
          </div>
    </Section>
  );
}
