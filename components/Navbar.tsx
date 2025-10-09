"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { FaEthereum } from "react-icons/fa";
import { FiLogOut, FiCopy, FiCheck } from "react-icons/fi";
import { ethers } from "ethers";
import { sepolia, holesky, mainnet } from "wagmi/chains";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";

interface NavbarProps {
  account: `0x${string}` | undefined;
  provider: ethers.BrowserProvider | null;

  disconnectWallet: () => void;
  activeNetwork: number;
  setActiveNetwork: (networkId: number) => void;
}

export default function Navbar({
  account,
  provider,
  disconnectWallet,
  activeNetwork,
  setActiveNetwork,
}: NavbarProps) {
  const [balance, setBalance] = useState<string | null>(null); // Start as null to avoid SSR mismatch
  const [copied, setCopied] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState(false); // Track client-side mounting
  const [lastAccount, setLastAccount] = useState<string | undefined>(undefined);

  const fetchBalance = useCallback(async () => {
    if (account && provider) {
      try {
        const balanceBigInt = await provider.getBalance(account);
        setBalance(ethers.formatEther(balanceBigInt).slice(0, 6));
      } catch (error) {
        console.error("Failed to fetch balance:", error);
        // keep previous balance on error to avoid flicker
      }
    } else {
      // keep previous balance to avoid flicker during brief re-inits
    }
  }, [account, provider]);

  // Ensure balance fetching only happens on the client after mount
  useEffect(() => {
    setIsMounted(true); // Mark as mounted on client
    if (account) setLastAccount(account);
    if (account && provider) {
      fetchBalance();
    }
  }, [account, provider, fetchBalance]);

  const copyToClipboard = async () => {
    if (account) {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNetworkChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newNetworkId = Number(event.target.value);
    setActiveNetwork(newNetworkId);
  };

  const networkName =
    activeNetwork === sepolia.id ? "Sepolia" : activeNetwork === holesky.id ? "Holesky" : "Mainnet";

  // Theme toggle
  const { theme, setTheme } = useTheme();
  /* const isDark = theme === "dark"; */

  // Hide-on-scroll (desktop only) with gentler threshold + debounce
  const lastY = useRef(0);
  const downScrollRef = useRef(0); // counts meaningful down ticks
  const downDistanceRef = useRef(0); // cumulative down distance
  const hideTimeoutRef = useRef<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      setScrolled(y > 8);

      const tickThreshold = 12; // ignore micro scrolls
      if (Math.abs(delta) > tickThreshold) {
        if (delta > 0) {
          // scrolling down
          if (y > 160) { // wait until user is a bit down the page
            downScrollRef.current = Math.min(4, downScrollRef.current + 1);
            downDistanceRef.current += delta;

            if (downScrollRef.current >= 4 && downDistanceRef.current > 120) {
              if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
              hideTimeoutRef.current = window.setTimeout(() => {
                setHidden(true);
              }, 150); // slight delay so it feels less snappy
            }
          }
        } else {
          // scrolling up: reset and show immediately
          downScrollRef.current = 0;
          downDistanceRef.current = 0;
          if (hideTimeoutRef.current) {
            window.clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
          }
          setHidden(false);
        }
        lastY.current = y;
      }
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    };
  }, []);


  // Avoid rendering dynamic content until mounted on client
  if (!isMounted) {
    return (
      <motion.nav
        className={`fixed top-0 left-0 w-full z-50 ${hidden ? 'md:-translate-y-full md:opacity-0' : 'translate-y-0 opacity-100'} transition-all duration-500` }
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className={`w-full border-b border-white/10 bg-black/40 backdrop-blur-xl ${scrolled ? 'md:w-[84%] lg:w-[80%] md:mx-auto md:mt-8 md:rounded-2xl md:border md:bg-black/50 md:backdrop-blur-xl md:shadow-xl' : ''}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 w-full flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <FaEthereum className="text-indigo-400 text-2xl" />
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent font-semibold text-lg">MPM ({networkName})</span>
              <select
                value={activeNetwork}
                onChange={handleNetworkChange}
                className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-400 transition"
              >
                <option value={sepolia.id}>Sepolia</option>
                <option value={holesky.id}>Holesky</option>
                <option value={mainnet.id}>Mainnet</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-300/80 text-sm">Loading...</span>
            </div>
          </div>
        </div>
      </motion.nav>
    );
  }

  return (
    <motion.nav
      className={`fixed top-0 left-0 w-full z-50 ${hidden ? 'md:-translate-y-full md:opacity-0' : 'translate-y-0 opacity-100'} transition-all duration-500` }
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className={`w-full border-b border-white/10 bg-black/40 backdrop-blur-xl ${scrolled ? 'md:w-[84%] lg:w-[80%] md:mx-auto md:mt-8 md:rounded-2xl md:border md:bg-black/50 md:backdrop-blur-xl md:shadow-xl' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 w-full flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FaEthereum className="text-indigo-400 text-2xl" />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent font-semibold text-lg">MPM ({networkName})</span>
          <select
            value={activeNetwork}
            onChange={handleNetworkChange}
            className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-400 transition"
          >
            <option value={sepolia.id}>Sepolia</option>
            <option value={holesky.id}>Holesky</option>
            <option value={mainnet.id}>Mainnet</option>
          </select>
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto">
          {(account || lastAccount) ? (
            <div className="hidden md:flex items-center gap-3 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
              <span className="text-sm text-gray-200">{balance !== null ? `${balance} ETH` : <span className="inline-block w-16 h-4 bg-gray-700 rounded animate-pulse" />}</span>
              <button className="flex items-center gap-1 text-gray-200 hover:text-white" onClick={copyToClipboard}>
                <span className="font-mono text-sm">{(account ?? lastAccount)!.slice(0, 6)}...{(account ?? lastAccount)!.slice(-4)}</span>
                {copied ? (
                  <FiCheck className="text-green-400 text-lg" />
                ) : (
                  <FiCopy className="text-gray-400 hover:text-gray-200 text-lg transition-all duration-200" />
                )}
              </button>
            </div>
          ) : (
            <span className="text-gray-400 text-sm">Not Connected</span>
          )}

          <button
            aria-label="Toggle Theme"
            className="hidden sm:inline-flex items-center justify-center h-9 w-9 rounded-full bg-white/5 border border-white/10 text-sm hover:scale-[1.05] active:scale-[0.97] transition"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          >{theme === 'dark' ? '🌙' : '☀️'}</button>
          <w3m-button size="md" label="Connect" />
          {account && (
            <button
              onClick={disconnectWallet}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600/90 hover:bg-red-600 text-white rounded-full shadow-md transition-all font-medium text-sm"
            >
              <FiLogOut className="text-lg" /> Disconnect
            </button>
          )}
        </div>
      </div>
      </div>
    </motion.nav>
  );
}