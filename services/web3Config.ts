import { createConfig } from 'wagmi'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { http, fallback } from 'wagmi'
import { defineChain } from 'viem'

// ── 0G chains (not in viem/chains, defined manually) ─────────────────
const zeroGMainnet = defineChain({
  id: 16661,
  name: '0G Mainnet',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evmrpc.0g.ai'] },
  },
  blockExplorers: {
    default: { name: '0G Chain Scan', url: 'https://chainscan.0g.ai' },
  },
})

const zeroGTestnet = defineChain({
  id: 16602,
  name: '0G Testnet (Galileo)',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: { name: '0G Chain Scan (Galileo)', url: 'https://chainscan-galileo.0g.ai' },
  },
})

// ── Chain resolution ─────────────────────────────────────────────────
const USE_TESTNET =
  (process.env.NEXT_PUBLIC_USE_TESTNET ??
    process.env.NEXT_PUBLIC_USE_0G_TESTNET) === 'true'

export const primaryChain = USE_TESTNET ? zeroGTestnet : zeroGMainnet

// Single-chain: only expose the primary chain to the wallet
export const supportedChains = [primaryChain] as unknown as readonly [typeof primaryChain, ...typeof primaryChain[]]

// Poll every 12s (wagmi default is 4s) — sufficient for game event sync
export const POLL_INTERVAL = 12_000

const transports: Record<number, ReturnType<typeof fallback>> = {
  [primaryChain.id]: fallback([http(primaryChain.rpcUrls.default.http[0])]),
}

export const config = createConfig({
  chains: supportedChains,
  pollingInterval: POLL_INTERVAL,
  transports,
  syncConnectedChain: true,
  connectors: [
    injected({ target: 'metaMask' }),
    coinbaseWallet({
      appName: 'CLAWDY',
      preference: 'smartWalletOnly',
    }),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || (() => {
        if (typeof console !== 'undefined') console.warn('[web3Config] NEXT_PUBLIC_WC_PROJECT_ID not set — WalletConnect may not work')
        return 'demo-project'
      })(),
      metadata: {
        name: 'CLAWDY',
        description: `Agentic sandbox on ${primaryChain.name}`,
        url: process.env.NEXT_PUBLIC_APP_URL || 'https://clawdy-nine.vercel.app',
        icons: [(process.env.NEXT_PUBLIC_APP_URL || 'https://clawdy-nine.vercel.app') + '/favicon.svg'],
      },
    }),
  ],
})
