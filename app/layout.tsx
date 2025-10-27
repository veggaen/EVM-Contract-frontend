"use client";

import "./globals.css";
import { motion } from "framer-motion";
import AppKitProvider from "../lib/AppKitProvider";
import { ThemeProvider } from "next-themes";
import { CustomThemeProvider } from "../contexts/ThemeContext";
import React from "react";
import VantaBackground from "../components/VantaBackground";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen text-[color:var(--foreground)] bg-[color:var(--background)]">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem themes={['light', 'dark']}>
          <CustomThemeProvider>
            <AppKitProvider>
            {/* Background effect: Vanta mounted behind content */}
            <VantaBackground />
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
              <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
                <SpeedInsights />
                <Analytics />
              </div>
            </motion.div>
            <footer className="relative z-10 text-center text-gray-400 py-4 border-t border-white/10 bg-black/30 backdrop-blur-xl">
              <p className="text-sm">EVM Contract Dashboard | Powered by Typescript & Next.js with Wagmi, Reown, and Vanta </p>
            </footer>
            </AppKitProvider>
          </CustomThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}