import { http, createConfig } from "wagmi";
import { sepolia, mainnet } from "wagmi/chains";
import { injected, coinbaseWallet } from "@wagmi/connectors";

export const config = createConfig({
  chains: [sepolia, mainnet], // Add Mainnet
  connectors: [
    injected(),
    coinbaseWallet(),
  ],
  transports: {
    [sepolia.id]: http("https://sepolia.infura.io/v3/42858dc44d7f40548ac58dc2ce669dd6"), // Your Sepolia Infura key
    [mainnet.id]: http("https://mainnet.infura.io/v3/42858dc44d7f40548ac58dc2ce669dd6"), // Add Mainnet Infura endpoint
  },
});

// Define contract addresses per chain
export const CONTRACT_ADDRESSES = {
  [sepolia.id]: "0x057E087C848a967911fF29Fd3eB0CF49bCa38D09", // New Sepolia address - OLD:0xA3AEbCFF15ae61f10B62D097F6C412DA06391BF2
  [mainnet.id]: "0x73b62ea73714c132E783BC0bA8318CCE7862c77a", // Original Mainnet address
} as const;