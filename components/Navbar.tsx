"use client";

import { useEffect, useState, useCallback } from "react";
import { FaEthereum } from "react-icons/fa";
import { FiLogOut, FiCopy, FiCheck } from "react-icons/fi";
import { ethers } from "ethers";
import { sepolia, holesky, mainnet } from "wagmi/chains";
import { motion } from "framer-motion";

interface NavbarProps {
  account: `0x${string}` | undefined;
  provider: ethers.BrowserProvider | null;
  connectWallet: () => void;
  disconnectWallet: () => void;
  activeNetwork: number;
  setActiveNetwork: (networkId: number) => void;
}

export default function Navbar({
  account,
  provider,
  connectWallet,
  disconnectWallet,
  activeNetwork,
  setActiveNetwork,
}: NavbarProps) {
  const [balance, setBalance] = useState<string | null>(null); // Start as null to avoid SSR mismatch
  const [copied, setCopied] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState(false); // Track client-side mounting

  const fetchBalance = useCallback(async () => {
    if (account && provider) {
      try {
        const balanceBigInt = await provider.getBalance(account);
        setBalance(ethers.formatEther(balanceBigInt).slice(0, 6));
      } catch (error) {
        console.error("Failed to fetch balance:", error);
        setBalance("0.00");
      }
    } else {
      setBalance("0.00");
    }
  }, [account, provider]);

  // Ensure balance fetching only happens on the client after mount
  useEffect(() => {
    setIsMounted(true); // Mark as mounted on client
    if (account && provider) {
      fetchBalance();
    } else {
      setBalance("0.00");
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

  // Avoid rendering dynamic content until mounted on client
  if (!isMounted) {
    return (
      <motion.nav
        className="bg-gray-800 shadow-lg py-4 px-6 flex flex-col sm:flex-row justify-between items-center border-b border-gray-700"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3 mb-3 sm:mb-0">
          <FaEthereum className="text-indigo-400 text-2xl" />
          <span className="text-white font-semibold text-lg">MPM ({networkName})</span>
          <select
            value={activeNetwork}
            onChange={handleNetworkChange}
            className="p-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-md"
          >
            <option value={sepolia.id}>Sepolia</option>
            <option value={holesky.id}>Holesky</option>
            <option value={mainnet.id}>Mainnet</option>
          </select>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <span className="text-gray-400 text-sm">Loading...</span>
        </div>
      </motion.nav>
    );
  }

  return (
    <motion.nav
      className="bg-gray-800 shadow-lg py-4 px-6 flex flex-col sm:flex-row justify-between items-center border-b border-gray-700"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-3 mb-3 sm:mb-0">
        <FaEthereum className="text-indigo-400 text-2xl" />
        <span className="text-white font-semibold text-lg">MPM ({networkName})</span>
        <select
          value={activeNetwork}
          onChange={handleNetworkChange}
          className="p-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-md"
        >
          <option value={sepolia.id}>Sepolia</option>
          <option value={holesky.id}>Holesky</option>
          <option value={mainnet.id}>Mainnet</option>
        </select>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
        {account ? (
          <div className="text-white font-medium text-center sm:text-left">
            <p className="text-sm">Balance: {balance ?? "0.00"} ETH</p>
            <div className="flex items-center justify-center sm:justify-start gap-2 cursor-pointer group" onClick={copyToClipboard}>
              <p className="text-sm font-mono">
                {account.slice(0, 6)}...{account.slice(-4)}
              </p>
              {copied ? (
                <FiCheck className="text-green-400 text-lg" />
              ) : (
                <FiCopy className="text-gray-400 hover:text-gray-200 text-lg transition-all duration-200" />
              )}
            </div>
          </div>
        ) : (
          <span className="text-gray-400 text-sm">Not Connected</span>
        )}

        {!account ? (
          <button
            onClick={connectWallet}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md shadow-md hover:bg-indigo-700 transition-all font-medium text-sm w-full sm:w-auto"
          >
            Connect Wallet
          </button>
        ) : (
          <button
            onClick={disconnectWallet}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md shadow-md hover:bg-red-700 transition-all font-medium text-sm w-full sm:w-auto"
          >
            <FiLogOut className="text-lg" /> Disconnect
          </button>
        )}
      </div>
    </motion.nav>
  );
}