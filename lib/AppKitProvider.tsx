'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import { mainnet, sepolia, holesky } from '@reown/appkit/networks'
import { WagmiProvider, cookieToInitialState, type Config } from 'wagmi'
import { wagmiAdapter, projectId as appkitProjectId } from './appkit'

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
  url: 'https://evm-contract-frontend.vercel.app',
  icons: ['https://avatars.githubusercontent.com/u/89751706']
}

// Create AppKit modal on client after mount (avoids SSR/HMR quirks)
import { useEffect } from 'react'

export default function AppKitProvider({
  children,
  cookies
}: { children: React.ReactNode; cookies?: string | null }) {
  useEffect(() => {
    // Dev-only: ensure no stale service workers or Cache Storage keep old chunks around
    if (process.env.NODE_ENV !== 'production') {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations?.().then((regs) => regs.forEach((r) => r.unregister()));
      }
      if (typeof caches !== 'undefined') {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
    }

    if (typeof window !== 'undefined' && !window.__APPKIT_INITIALIZED__) {
      createAppKit({
        adapters: [wagmiAdapter],
        projectId: appkitProjectId ?? '',
        networks: [mainnet, sepolia, holesky],
        defaultNetwork: sepolia,
        metadata,
        allWallets: 'SHOW',
        features: {
          email: true,
          socials: ['google','x','github','discord','apple','facebook'],
          emailShowWallets: true,
          analytics: true
        },
      })
      window.__APPKIT_INITIALIZED__ = true
    }
  }, [])

  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies ?? null)
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}