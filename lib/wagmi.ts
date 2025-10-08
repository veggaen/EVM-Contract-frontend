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
  [sepolia.id]: "0x2Ba058B3007CD244D1085a510e2f19b2F4291761", // - OLD:0xc739F8B19b21e677D482e26265942E970442d5E5
  [mainnet.id]: "0x73b62ea73714c132E783BC0bA8318CCE7862c77a", // Original Mainnet address also not yet launched
} as const;