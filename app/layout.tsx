"use client";

import "./globals.css";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "../lib/wagmi";
import { motion } from "framer-motion";

const queryClient = new QueryClient();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-900 to-black">
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
              {children}
            </motion.div>
            <footer className="text-center text-gray-400 py-3 border-t border-gray-700">
              <p className="text-xs sm:text-sm">MPM Token Dashboard v1.0 | Powered by NextJS</p>
            </footer>
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}