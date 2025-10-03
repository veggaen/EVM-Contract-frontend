'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import { mainnet, sepolia, holesky } from '@reown/appkit/networks'
import { WagmiProvider, cookieToInitialState, type Config } from 'wagmi'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';

// OPTIONAL: SIWX via Reown Authentication


const queryClient = new QueryClient()

declare global {
  interface Window {
    __APPKIT_INITIALIZED__?: boolean;
  }
}

// Your dapp metadata (shown in wallet UIs)
const metadata = {
  name: 'EVM-Contract-frontend',
  description: 'My dapp',
  url: 'https://yourdomain.com',
  icons: ['https://yourdomain.com/icon.png']
}

// Create AppKit modal with wallets + socials + SIWX (guard against HMR double-inits)
if (typeof window !== 'undefined' && !window.__APPKIT_INITIALIZED__) {
  createAppKit({
    adapters: [WagmiAdapter],
    projectId: `${process.env.NEXT_PUBLIC_PROJECT_ID}`,
    networks: [mainnet, sepolia, holesky],
    defaultNetwork: mainnet,
    metadata,
    allWallets: 'SHOW',
    features: {
      email: true,
      socials: ['google','x','github','discord','apple','facebook'], // removed farcaster
      emailShowWallets: true,
      analytics: true
    },
  })
  window.__APPKIT_INITIALIZED__ = true
}

export default function AppKitProvider({
  children,
  cookies
}: { children: React.ReactNode; cookies?: string | null }) {
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies ?? null)
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}