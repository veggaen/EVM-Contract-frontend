"use client";

import { useEffect, useState, useCallback } from "react";
import { FaEthereum } from "react-icons/fa";
import { FiLogOut, FiCopy, FiCheck } from "react-icons/fi";
import { ethers } from "ethers";
import { sepolia, mainnet } from "wagmi/chains";
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
  const [balance, setBalance] = useState<string>("0.00");
  const [copied, setCopied] = useState<boolean>(false);

  const fetchBalance = useCallback(async () => {
    if (account && provider) {
      try {
        const balanceBigInt = await provider.getBalance(account);
        setBalance(ethers.formatEther(balanceBigInt).slice(0, 6));
      } catch (error) {
        console.error("Failed to fetch balance:", error);
      }
    } else {
      setBalance("0.00");
    }
  }, [account, provider]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

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

  const networkName = activeNetwork === sepolia.id ? "Sepolia" : "Mainnet";

  return (
    <motion.nav
      className="bg-gradient-to-r from-gray-800 to-indigo-900 shadow-lg py-3 px-4 sm:px-6 flex flex-col sm:flex-row justify-between items-center border-b border-gray-700"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-2 mb-2 sm:mb-0">
        <FaEthereum className="text-indigo-400 text-xl sm:text-2xl" />
        <span className="text-white font-semibold text-sm sm:text-base">MPM ({networkName})</span>
        <select
          value={activeNetwork}
          onChange={handleNetworkChange}
          className="ml-2 p-1 bg-gray-700 border border-gray-600 rounded-md text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-md"
        >
          <option value={sepolia.id}>Sepolia</option>
          <option value={mainnet.id}>Mainnet</option>
        </select>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 w-full sm:w-auto">
        {account ? (
          <div className="text-white font-medium text-center sm:text-left">
            <p className="text-xs sm:text-sm">Balance: {balance} ETH</p>
            <div className="flex items-center justify-center sm:justify-start gap-1 cursor-pointer group" onClick={copyToClipboard}>
              <p className="text-xs sm:text-sm font-mono">
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
          <span className="text-gray-400 text-xs sm:text-sm">Not Connected</span>
        )}

        {!account ? (
          <button
            onClick={connectWallet}
            className="px-3 py-2 bg-indigo-600 text-white rounded-md shadow-md hover:bg-indigo-700 transition-all font-medium text-xs sm:text-sm w-full sm:w-auto"
          >
            Connect Wallet
          </button>
        ) : (
          <button
            onClick={disconnectWallet}
            className="flex items-center justify-center gap-1 px-3 py-2 bg-red-600 text-white rounded-md shadow-md hover:bg-red-700 transition-all font-medium text-xs sm:text-sm w-full sm:w-auto"
          >
            <FiLogOut className="text-lg" /> Disconnect
          </button>
        )}
      </div>
    </motion.nav>
  );
}