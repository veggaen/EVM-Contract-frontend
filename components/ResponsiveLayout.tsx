'use client';

import React from 'react';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

export function ResponsiveContainer({ 
  children, 
  className = '', 
  maxWidth = '2xl' 
}: ResponsiveContainerProps) {
  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-full'
  };

  return (
    <div className={`w-full ${maxWidthClasses[maxWidth]} mx-auto px-4 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}

interface ResponsiveGridProps {
  children: React.ReactNode;
  className?: string;
  cols?: {
    default?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
    '2xl'?: number;
  };
  gap?: 'sm' | 'md' | 'lg' | 'xl';
}

export function ResponsiveGrid({ 
  children, 
  className = '',
  cols = { default: 1, sm: 2, lg: 3, xl: 4 },
  gap = 'md'
}: ResponsiveGridProps) {
  const gapClasses = {
    sm: 'gap-2',
    md: 'gap-4 md:gap-6',
    lg: 'gap-6 md:gap-8',
    xl: 'gap-8 md:gap-10'
  };

  const getGridCols = () => {
    const classes = [];
    if (cols.default) classes.push(`grid-cols-${cols.default}`);
    if (cols.sm) classes.push(`sm:grid-cols-${cols.sm}`);
    if (cols.md) classes.push(`md:grid-cols-${cols.md}`);
    if (cols.lg) classes.push(`lg:grid-cols-${cols.lg}`);
    if (cols.xl) classes.push(`xl:grid-cols-${cols.xl}`);
    if (cols['2xl']) classes.push(`2xl:grid-cols-${cols['2xl']}`);
    return classes.join(' ');
  };

  return (
    <div className={`grid ${getGridCols()} ${gapClasses[gap]} ${className}`}>
      {children}
    </div>
  );
}

interface ResponsiveCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  glass?: boolean;
}

export function ResponsiveCard({ 
  children, 
  className = '',
  padding = 'md',
  glass = true
}: ResponsiveCardProps) {
  const paddingClasses = {
    sm: 'p-3 sm:p-4',
    md: 'p-4 sm:p-6',
    lg: 'p-6 sm:p-8'
  };

  const baseClasses = glass ? 'glass' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg';

  return (
    <div className={`${baseClasses} ${paddingClasses[padding]} ${className}`}>
      {children}
    </div>
  );
}

interface ResponsiveFlexProps {
  children: React.ReactNode;
  className?: string;
  direction?: 'row' | 'col';
  wrap?: boolean;
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  align?: 'start' | 'center' | 'end' | 'stretch';
  gap?: 'sm' | 'md' | 'lg' | 'xl';
}

export function ResponsiveFlex({ 
  children, 
  className = '',
  direction = 'row',
  wrap = false,
  justify = 'start',
  align = 'start',
  gap = 'md'
}: ResponsiveFlexProps) {
  const directionClass = direction === 'row' ? 'flex-row' : 'flex-col';
  const wrapClass = wrap ? 'flex-wrap' : 'flex-nowrap';
  
  const justifyClasses = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
    around: 'justify-around',
    evenly: 'justify-evenly'
  };

  const alignClasses = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch'
  };

  const gapClasses = {
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
    xl: 'gap-8'
  };

  return (
    <div className={`flex ${directionClass} ${wrapClass} ${justifyClasses[justify]} ${alignClasses[align]} ${gapClasses[gap]} ${className}`}>
      {children}
    </div>
  );
}

interface ResponsiveStackProps {
  children: React.ReactNode;
  className?: string;
  spacing?: 'sm' | 'md' | 'lg' | 'xl';
  divider?: boolean;
}

export function ResponsiveStack({ 
  children, 
  className = '',
  spacing = 'md',
  divider = false
}: ResponsiveStackProps) {
  const spacingClasses = {
    sm: 'space-y-2',
    md: 'space-y-4',
    lg: 'space-y-6',
    xl: 'space-y-8'
  };

  const dividerClass = divider ? 'divide-y divide-gray-200 dark:divide-gray-700' : '';

  return (
    <div className={`${spacingClasses[spacing]} ${dividerClass} ${className}`}>
      {children}
    </div>
  );
}

interface ResponsiveTextProps {
  children: React.ReactNode;
  className?: string;
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  color?: 'primary' | 'secondary' | 'muted' | 'error' | 'success';
  responsive?: boolean;
}

export function ResponsiveText({ 
  children, 
  className = '',
  size = 'base',
  weight = 'normal',
  color = 'primary',
  responsive = false
}: ResponsiveTextProps) {
  const sizeClasses = responsive ? {
    xs: 'text-xs sm:text-sm',
    sm: 'text-sm sm:text-base',
    base: 'text-base sm:text-lg',
    lg: 'text-lg sm:text-xl',
    xl: 'text-xl sm:text-2xl',
    '2xl': 'text-2xl sm:text-3xl',
    '3xl': 'text-3xl sm:text-4xl'
  } : {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl'
  };

  const weightClasses = {
    normal: 'font-normal',
    medium: 'font-medium',
    semibold: 'font-semibold',
    bold: 'font-bold'
  };

  const colorClasses = {
    primary: 'text-gray-900 dark:text-white',
    secondary: 'text-gray-600 dark:text-gray-300',
    muted: 'text-gray-500 dark:text-gray-400',
    error: 'text-red-600 dark:text-red-400',
    success: 'text-green-600 dark:text-green-400'
  };

  return (
    <span className={`${sizeClasses[size]} ${weightClasses[weight]} ${colorClasses[color]} ${className}`}>
      {children}
    </span>
  );
}

interface MobileFirstLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function MobileFirstLayout({ children, className = '' }: MobileFirstLayoutProps) {
  return (
    <div className={`min-h-screen w-full ${className}`}>
      <div className="w-full max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
