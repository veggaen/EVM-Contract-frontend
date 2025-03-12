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
  [holesky.id]: "0xA604fbE3fd1bFe38a26a31C085c0b805198912E2", // - not yet launched
  [sepolia.id]: "0x2499508918C60FB6F6fBDC01937b0A1Cf52addc7", // - OLD:0x09D4Cf1f08112c7CaC3fb150Dafb47C4e739A8bD
  [mainnet.id]: "0x73b62ea73714c132E783BC0bA8318CCE7862c77a", // Original Mainnet address
} as const;