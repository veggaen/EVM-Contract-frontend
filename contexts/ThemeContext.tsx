"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useTheme as useNextTheme } from 'next-themes';
import { generateColorPalette } from '../utils/colorUtils';

export interface CustomThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  surface: string;
  border: string;
  muted: string;
  cardBg: string;
  glassBg: string;
  glassBorder: string;
}

export interface CustomThemeContextType {
  mode: 'light' | 'dark';
  setMode: (mode: 'light' | 'dark') => void;
  colorTheme: string;
  setColorTheme: (color: string) => void;
  customColors: CustomThemeColors;
  resetToDefaults: () => void;
}

const defaultPrimaryColor = '#8b5cf6'; // Purple as default

const ThemeContext = createContext<CustomThemeContextType | undefined>(undefined);

export function CustomThemeProvider({ children }: { children: React.ReactNode }) {
  const { setTheme: setNextTheme } = useNextTheme();
  const [mode, setModeState] = useState<'light' | 'dark'>('dark');
  const [colorTheme, setColorThemeState] = useState<string>(defaultPrimaryColor);
  const [mounted, setMounted] = useState(false);

  // Generate custom colors from color theme and mode
  const customColors = useMemo(() => {
    return generateColorPalette(colorTheme, mode);
  }, [colorTheme, mode]);

  // Load saved preferences from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const savedMode = localStorage.getItem('theme-mode') as 'light' | 'dark';
    const savedColor = localStorage.getItem('theme-color');

    if (savedMode) {
      setModeState(savedMode);
    }
    if (savedColor) {
      setColorThemeState(savedColor);
    }
  }, []);

  // Apply theme colors to CSS variables and next-themes
  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;

    // Set the next-themes theme based on mode
    setNextTheme(mode);

    // Always apply custom colors (they adapt to light/dark mode)
    root.style.setProperty('--primary', customColors.primary);
    root.style.setProperty('--secondary', customColors.secondary);
    root.style.setProperty('--accent', customColors.accent);
    root.style.setProperty('--border', customColors.border);
    root.style.setProperty('--muted', customColors.muted);

    // Apply all colors (they are already mode-specific from generateColorPalette)
    root.style.setProperty('--background', customColors.background);
    root.style.setProperty('--foreground', customColors.foreground);
    root.style.setProperty('--surface', customColors.surface);
    root.style.setProperty('--card-bg', customColors.cardBg);
    root.style.setProperty('--glass-bg', customColors.glassBg);
    root.style.setProperty('--glass-border', customColors.glassBorder);
  }, [customColors, mode, mounted, setNextTheme]);

  const setMode = (newMode: 'light' | 'dark') => {
    setModeState(newMode);
    localStorage.setItem('theme-mode', newMode);
  };

  const setColorTheme = (color: string) => {
    setColorThemeState(color);
    localStorage.setItem('theme-color', color);
  };

  const resetToDefaults = () => {
    setModeState('dark');
    setColorThemeState(defaultPrimaryColor);
    localStorage.removeItem('theme-mode');
    localStorage.removeItem('theme-color');
  };



  const value: CustomThemeContextType = {
    mode,
    setMode,
    colorTheme,
    setColorTheme,
    customColors,
    resetToDefaults,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useCustomTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useCustomTheme must be used within a CustomThemeProvider');
  }
  return context;
}
