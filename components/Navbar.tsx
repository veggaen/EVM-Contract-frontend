"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { FaEthereum, FaChevronDown } from "react-icons/fa";
import { FiLogOut } from "react-icons/fi";
import { ethers } from "ethers";
import { sepolia, holesky, mainnet } from "wagmi/chains";
import { motion } from "framer-motion";
import ThemeSelector from "./ThemeSelector";

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
  //const [copied, setCopied] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState(false); // Track client-side mounting
  const [lastAccount, setLastAccount] = useState<string | undefined>(undefined);
  const [isNetworkDropdownOpen, setIsNetworkDropdownOpen] = useState(false);
  const networkDropdownRef = useRef<HTMLDivElement>(null);

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
      console.log("Fetching balance for account:", balance, `${lastAccount}`);
    }
  }, [account, provider, fetchBalance, balance, lastAccount]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (networkDropdownRef.current && !networkDropdownRef.current.contains(event.target as Node)) {
        setIsNetworkDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  /* const copyToClipboard = async () => {
    if (account) {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }; */



  const handleCustomNetworkSelect = (networkId: number) => {
    setActiveNetwork(networkId);
    setIsNetworkDropdownOpen(false);
  };

  const networkOptions = [
    { id: sepolia.id, name: "Sepolia", color: "#3b82f6" },
    { id: holesky.id, name: "Holesky", color: "#8b5cf6" },
    { id: mainnet.id, name: "Mainnet", color: "#10b981" }
  ];

  const currentNetwork = networkOptions.find(n => n.id === activeNetwork) || networkOptions[0];
  const networkName = currentNetwork.name;

  // Theme functionality is now handled by ThemeSelector component

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

      const isDesktop = window.innerWidth >= 768; // Tailwind md breakpoint
      const tickThreshold = isDesktop ? 12 : 8;
      const startYThreshold = isDesktop ? 160 : 80;
      const requiredTicks = isDesktop ? 4 : 3;
      const requiredDistance = isDesktop ? 120 : 80;
      const debounceDelay = isDesktop ? 150 : 100;

      if (Math.abs(delta) > tickThreshold) {
        if (delta > 0) {
          // scrolling down
          if (y > startYThreshold) {
            downScrollRef.current = Math.min(requiredTicks, downScrollRef.current + 1);
            downDistanceRef.current += delta;

            if (downScrollRef.current >= requiredTicks && downDistanceRef.current > requiredDistance) {
              if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
              hideTimeoutRef.current = window.setTimeout(() => {
                setHidden(true);
              }, debounceDelay);
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
        className={`fixed top-0 left-0 w-full z-50 ${hidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'} transition-all duration-500` }
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div
          className={`w-full border-b backdrop-blur-xl ${scrolled ? 'md:w-[84%] lg:w-[80%] md:mx-auto md:mt-8 md:rounded-2xl md:border md:backdrop-blur-xl md:shadow-xl' : ''}`}
          style={{
            backgroundColor: 'var(--glass-bg)',
            borderColor: 'var(--glass-border)'
          }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 w-full flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <FaEthereum className="text-2xl" style={{ color: 'var(--primary)' }} />
              <span
                className="bg-clip-text text-transparent font-semibold text-lg"
                style={{
                  backgroundImage: `linear-gradient(to right, var(--primary), var(--accent), var(--secondary))`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text'
                }}
              >
                MPM ({networkName})
              </span>
              {/* Custom Network Dropdown */}
              <div className="relative" ref={networkDropdownRef}>
                <button
                  onClick={() => setIsNetworkDropdownOpen(!isNetworkDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: 'var(--glass-bg)',
                    border: `1px solid var(--glass-border)`,
                    color: 'var(--foreground)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    '--tw-ring-color': 'var(--primary)'
                  } as React.CSSProperties & { '--tw-ring-color': string }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--glass-border)'}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: currentNetwork.color }}
                  />
                  <span>{currentNetwork.name}</span>
                  <FaChevronDown
                    className={`text-xs transition-transform ${isNetworkDropdownOpen ? 'rotate-180' : ''}`}
                    style={{ color: 'var(--muted)' }}
                  />
                </button>

                {/* Dropdown Menu */}
                {isNetworkDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full left-0 mt-2 w-full min-w-[120px] rounded-lg shadow-2xl z-50"
                    style={{
                      backgroundColor: 'var(--glass-bg)',
                      border: `1px solid var(--glass-border)`,
                      backdropFilter: 'blur(20px) saturate(150%)',
                      WebkitBackdropFilter: 'blur(20px) saturate(150%)',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    {networkOptions.map((network) => (
                      <button
                        key={network.id}
                        onClick={() => handleCustomNetworkSelect(network.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                          network.id === activeNetwork ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{
                          color: 'var(--foreground)',
                          backgroundColor: network.id === activeNetwork ? 'var(--primary-alpha)' : 'transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (network.id !== activeNetwork) {
                            e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (network.id !== activeNetwork) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: network.color }}
                        />
                        <span>{network.name}</span>
                        {network.id === activeNetwork && (
                          <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--primary)' }} />
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
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
      className={`fixed top-0 left-0 w-full z-50 ${hidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'} transition-all duration-500` }
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className={`w-full border-b backdrop-blur-xl ${scrolled ? '' : 'md:w-[84%] lg:w-[80%] md:mx-auto md:mt-8 md:rounded-2xl md:border md:backdrop-blur-xl md:shadow-xl'}`}
        style={{
          backgroundColor: 'var(--glass-bg)',
          borderColor: 'var(--glass-border)'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 w-full flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FaEthereum className="text-2xl" style={{ color: 'var(--primary)' }} />
          <span
            className="bg-clip-text text-transparent font-semibold text-lg"
            style={{
              backgroundImage: `linear-gradient(to right, var(--primary), var(--accent), var(--secondary))`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text'
            }}
          >
            MPM ({networkName})
          </span>
          {/* Custom Network Dropdown */}
          <div className="relative" ref={networkDropdownRef}>
            <button
              onClick={() => setIsNetworkDropdownOpen(!isNetworkDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all focus:outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--glass-bg)',
                border: `1px solid var(--glass-border)`,
                color: 'var(--foreground)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                '--tw-ring-color': 'var(--primary)'
              } as React.CSSProperties & { '--tw-ring-color': string }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--glass-border)'}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: currentNetwork.color }}
              />
              <span>{currentNetwork.name}</span>
              <FaChevronDown
                className={`text-xs transition-transform ${isNetworkDropdownOpen ? 'rotate-180' : ''}`}
                style={{ color: 'var(--muted)' }}
              />
            </button>

            {/* Dropdown Menu */}
            {isNetworkDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="absolute top-full left-0 mt-2 w-full min-w-[120px] rounded-lg shadow-2xl z-50"
                style={{
                  backgroundColor: 'var(--glass-bg)',
                  border: `1px solid var(--glass-border)`,
                  backdropFilter: 'blur(20px) saturate(150%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(150%)',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)'
                }}
              >
                {networkOptions.map((network) => (
                  <button
                    key={network.id}
                    onClick={() => handleCustomNetworkSelect(network.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      network.id === activeNetwork ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{
                      color: 'var(--foreground)',
                      backgroundColor: network.id === activeNetwork ? 'var(--primary-alpha)' : 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      if (network.id !== activeNetwork) {
                        e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (network.id !== activeNetwork) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: network.color }}
                    />
                    <span>{network.name}</span>
                    {network.id === activeNetwork && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--primary)' }} />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto">
          {/* {(account || lastAccount) ? (
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
          )} */}

          <ThemeSelector />
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