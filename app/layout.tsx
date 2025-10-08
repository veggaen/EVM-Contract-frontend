"use client";

import "./globals.css";
import { motion } from "framer-motion";
import AppKitProvider from "../lib/AppKitProvider";



export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-900 text-white">
        <AppKitProvider>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
            {children}
          </motion.div>
          <footer className="text-center text-gray-400 py-4 border-t border-gray-800 bg-gray-800">
            <p className="text-sm">MPM Token Dashboard v1.0 | Powered by NextJS</p>
          </footer>
        </AppKitProvider>
      </body>
    </html>
  );
}