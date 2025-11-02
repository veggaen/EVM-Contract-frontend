import { http, createConfig } from "wagmi";
import { sepolia, mainnet, holesky} from "wagmi/chains";
import { injected, coinbaseWallet } from "@wagmi/connectors";

export const config = createConfig({
  chains: [sepolia, holesky, mainnet], // Add Mainnet
  connectors: [
    injected(),
    coinbaseWallet(),
  ],
  transports: {
    [holesky.id]: http(`https://holesky.infura.io/v3/${process.env.INFURAHOLESKY}`), // Your Sepolia Infura key
    [sepolia.id]: http(`https://sepolia.infura.io/v3/${process.env.INFURA}`), // Your Sepolia Infura key
    [mainnet.id]: http(`https://mainnet.infura.io/v3/${process.env.INFURAMAIN}`), // Add Mainnet Infura endpoint
  },
});

// Define contract addresses per chain
export const CONTRACT_ADDRESSES = {
  [holesky.id]: "0xA604fbE3fd1bFe38a26a31C085c0b805198912E2", // placeholder
  [sepolia.id]: "0x2d3740543d12ac954396A39a9B1d870a7ABb484A", // MrManManUnified (Token + Staking) - DEV MODE DEPLOYMENT
  [mainnet.id]: "0x73b62ea73714c132E783BC0bA8318CCE7862c77a", // placeholder
} as const;

// Staking contract addresses per chain
// Note: MMM_Unified includes staking, so we use the same address
export const STAKING_ADDRESSES = {
  [holesky.id]: "0x0000000000000000000000000000000000000000", // placeholder
  [sepolia.id]: "0x2d3740543d12ac954396A39a9B1d870a7ABb484A", // Same as MMM_Unified (includes staking) - DEV MODE DEPLOYMENT
  [mainnet.id]: "0x0000000000000000000000000000000000000000", // placeholder
} as const;