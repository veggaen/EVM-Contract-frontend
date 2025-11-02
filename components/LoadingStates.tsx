'use client';

import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${sizeClasses[size]} ${className}`} />
  );
}

interface LoadingTextProps {
  text?: string;
  showSpinner?: boolean;
  className?: string;
}

export function LoadingText({ 
  text = 'Loading...', 
  showSpinner = true, 
  className = '' 
}: LoadingTextProps) {
  return (
    <div className={`flex items-center justify-center gap-2 text-gray-400 ${className}`}>
      {showSpinner && <LoadingSpinner size="sm" />}
      <span className="text-sm">{text}</span>
    </div>
  );
}

interface PhaseParticipantsLoadingProps {
  phase?: number;
  className?: string;
}

export function PhaseParticipantsLoading({ phase, className = '' }: PhaseParticipantsLoadingProps) {
  return (
    <div className={`glass p-4 ${className}`}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--secondary)' }}>
        {phase !== undefined ? `Participants (Phase ${phase})` : 'Participants'}
      </h3>
      <div className="flex flex-col items-center justify-center py-8">
        <LoadingSpinner size="lg" className="mb-3" />
        <LoadingText text="Loading..." showSpinner={false} />
      </div>
    </div>
  );
}

interface MintTokensLoadingProps {
  className?: string;
}

export function MintTokensLoading({ className = '' }: MintTokensLoadingProps) {
  return (
    <div className={`glass p-4 ${className}`}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--secondary)' }}>
        🪙 Mint Tokens
      </h3>
      <div className="flex flex-col items-center justify-center py-8">
        <LoadingSpinner size="lg" className="mb-3" />
        <LoadingText text="Loading..." showSpinner={false} />
      </div>
    </div>
  );
}

interface SkeletonProps {
  className?: string;
  height?: string;
  width?: string;
}

export function Skeleton({ className = '', height = 'h-4', width = 'w-full' }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-gray-300 rounded ${height} ${width} ${className}`} />
  );
}

interface ChartLoadingProps {
  title: string;
  className?: string;
}

export function ChartLoading({ title, className = '' }: ChartLoadingProps) {
  return (
    <div className={`glass p-4 ${className}`}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--secondary)' }}>
        {title}
      </h3>
      <div className="flex flex-col items-center justify-center py-12">
        <LoadingSpinner size="lg" />
        <LoadingText text="Loading..." showSpinner={false} className="mt-4" />
      </div>
    </div>
  );
}

interface ResponsiveLoadingGridProps {
  children: React.ReactNode;
  className?: string;
}

export function ResponsiveLoadingGrid({ children, className = '' }: ResponsiveLoadingGridProps) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 ${className}`}>
      {children}
    </div>
  );
}

interface DataLoadingStateProps {
  isLoading: boolean;
  hasError: boolean;
  errorMessage?: string;
  loadingComponent: React.ReactNode;
  errorComponent?: React.ReactNode;
  children: React.ReactNode;
}

export function DataLoadingState({
  isLoading,
  hasError,
  errorMessage,
  loadingComponent,
  errorComponent,
  children
}: DataLoadingStateProps) {
  if (isLoading) {
    return <>{loadingComponent}</>;
  }

  if (hasError) {
    return errorComponent || (
      <div className="glass p-4 text-center">
        <div className="text-red-400 mb-2">⚠️ Error Loading Data</div>
        <p className="text-sm text-gray-400">{errorMessage || 'Failed to load data'}</p>
      </div>
    );
  }

  return <>{children}</>;
}
