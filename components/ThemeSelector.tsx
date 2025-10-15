"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomTheme } from '../contexts/ThemeContext';
import ColorPicker from './ColorPicker';

export default function ThemeSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  
  const {
    mode,
    setMode,
    colorTheme,
    setColorTheme,
    customColors,
    resetToDefaults
  } = useCustomTheme();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCustomizer(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getModeIcon = (modeName: 'light' | 'dark') => {
    return modeName === 'light' ? '☀️' : '🌙';
  };

  const getModeLabel = (modeName: 'light' | 'dark') => {
    return modeName === 'light' ? 'Light' : 'Dark';
  };

  const getColorName = (color: string) => {
    const colorMap: { [key: string]: string } = {
      '#8b5cf6': 'Purple',
      '#ef4444': 'Red',
      '#f97316': 'Orange',
      '#eab308': 'Yellow',
      '#22c55e': 'Green',
      '#06b6d4': 'Cyan',
      '#3b82f6': 'Blue',
      '#ec4899': 'Pink',
    };
    return colorMap[color] || 'Custom';
  };



  return (
    <div className="relative" ref={selectorRef}>
      <button
        aria-label="Theme Selector"
        className="hidden sm:inline-flex items-center justify-center h-9 w-9 rounded-full bg-white/5 border border-white/10 text-sm hover:scale-[1.05] active:scale-[0.97] transition"
        onClick={() => setIsOpen(!isOpen)}
        title={`${getModeLabel(mode)} + ${getColorName(colorTheme)}`}
      >
        {getModeIcon(mode)}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full right-0 mt-2 w-80 rounded-xl shadow-2xl z-50 overflow-hidden"
            style={{
              backgroundColor: mode === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.95)',
              borderColor: mode === 'light' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)',
              border: `1px solid ${mode === 'light' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)'}`,
              backdropFilter: 'blur(20px) saturate(150%)',
              WebkitBackdropFilter: 'blur(20px) saturate(150%)',
              boxShadow: mode === 'light'
                ? '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)'
                : '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
            }}
          >
            {!showCustomizer ? (
              <div className="p-4">
                <h3
                  className="text-lg font-semibold mb-4"
                  style={{ color: mode === 'light' ? '#0f172a' : '#ffffff' }}
                >
                  Theme Settings
                </h3>

                {/* Mode Selection */}
                <div className="mb-6">
                  <h4
                    className="text-sm font-medium mb-3"
                    style={{ color: mode === 'light' ? '#475569' : '#d1d5db' }}
                  >
                    Mode
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {(['light', 'dark'] as const).map((modeName) => (
                      <button
                        key={modeName}
                        onClick={() => setMode(modeName)}
                        className="flex items-center gap-2 p-3 rounded-lg transition-all"
                        style={{
                          backgroundColor: mode === modeName
                            ? `${customColors.primary}40`
                            : (mode === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)'),
                          border: `1px solid ${mode === modeName
                            ? `${customColors.primary}60`
                            : (mode === 'light' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)')}`,
                          color: mode === modeName
                            ? customColors.primary
                            : (mode === 'light' ? '#475569' : '#d1d5db')
                        }}
                      >
                        <span className="text-lg">{getModeIcon(modeName)}</span>
                        <span className="font-medium">{getModeLabel(modeName)}</span>
                        {mode === modeName && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Selection */}
                <div>
                  <h4
                    className="text-sm font-medium mb-3"
                    style={{ color: mode === 'light' ? '#475569' : '#d1d5db' }}
                  >
                    Color Theme
                  </h4>
                  <button
                    onClick={() => setShowCustomizer(true)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg transition-all"
                    style={{
                      backgroundColor: mode === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                      border: `1px solid ${mode === 'light' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)'}`,
                      color: mode === 'light' ? '#475569' : '#d1d5db'
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-full border"
                      style={{
                        backgroundColor: colorTheme,
                        borderColor: mode === 'light' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)'
                      }}
                    />
                    <span className="flex-1 text-left font-medium">{getColorName(colorTheme)}</span>
                    <span style={{ color: mode === 'light' ? '#94a3b8' : '#6b7280' }}>→</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 max-h-96 overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3
                    className="text-lg font-semibold"
                    style={{ color: mode === 'light' ? '#0f172a' : '#ffffff' }}
                  >
                    Customize Theme
                  </h3>
                  <button
                    onClick={() => setShowCustomizer(false)}
                    className="transition"
                    style={{ color: mode === 'light' ? '#6b7280' : '#9ca3af' }}
                  >
                    ←
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <p
                      className="text-sm mb-3"
                      style={{ color: mode === 'light' ? '#6b7280' : '#9ca3af' }}
                    >
                      Choose your color theme. It will adapt to {mode} mode automatically.
                    </p>
                    <ColorPicker
                      label="Color Theme"
                      color={colorTheme}
                      onChange={setColorTheme}
                    />
                  </div>

                  {/* Preview of generated colors */}
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-sm text-gray-400 mb-2">Generated Palette:</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full border border-white/20"
                          style={{ backgroundColor: customColors.primary }}
                        />
                        <span className="text-xs text-gray-300">Primary</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full border border-white/20"
                          style={{ backgroundColor: customColors.secondary }}
                        />
                        <span className="text-xs text-gray-300">Secondary</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full border border-white/20"
                          style={{ backgroundColor: customColors.accent }}
                        />
                        <span className="text-xs text-gray-300">Accent</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <button
                      onClick={resetToDefaults}
                      className="w-full px-4 py-2 bg-red-600/20 border border-red-500/50 text-red-300 rounded-lg hover:bg-red-600/30 transition"
                    >
                      Reset to Defaults
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
