import { http, cookieStorage, createStorage } from 'wagmi'
import { sepolia, mainnet, holesky } from 'wagmi/chains'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'

export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID as string

export const wagmiAdapter = new WagmiAdapter({
  networks: [mainnet, sepolia, holesky],
  projectId,
  transports: {
    [holesky.id]: http(`https://holesky.infura.io/v3/${process.env.INFURAHOLESKY}`),
    [sepolia.id]: http(`https://sepolia.infura.io/v3/${process.env.INFURA}`),
    [mainnet.id]: http(`https://mainnet.infura.io/v3/${process.env.INFURAMAIN}`)
  },
  ssr: true,
  storage: createStorage({ storage: cookieStorage })
})

export const wagmiConfig = wagmiAdapter.wagmiConfig

