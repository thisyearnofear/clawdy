import { createConfig } from 'wagmi'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { http, fallback } from 'wagmi'
import { defineChain } from 'viem'
import { xLayer, xLayerTestnet, bsc, bscTestnet } from 'viem/chains'

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
export type ChainTarget = '0g' | 'xlayer' | 'bnb'

const CHAIN_ENV = (process.env.NEXT_PUBLIC_CHAIN || '0g').toLowerCase() as ChainTarget
const USE_TESTNET =
  (process.env.NEXT_PUBLIC_USE_TESTNET ??
    process.env.NEXT_PUBLIC_USE_0G_TESTNET ??
    process.env.NEXT_PUBLIC_USE_XLAYER_TESTNET) === 'true'

const CHAIN_MAP = {
  '0g':     { mainnet: zeroGMainnet, testnet: zeroGTestnet },
  xlayer:   { mainnet: xLayer,       testnet: xLayerTestnet },
  bnb:      { mainnet: bsc,          testnet: bscTestnet },
} as const

const resolved = CHAIN_MAP[CHAIN_ENV] ?? CHAIN_MAP['0g']

export const chainTarget: ChainTarget = CHAIN_ENV
export const isTestnet = USE_TESTNET
export const primaryChain = USE_TESTNET ? resolved.testnet : resolved.mainnet
export const supportedChains = [primaryChain] as const

// Poll every 12s (wagmi default is 4s) — sufficient for game event sync
export const POLL_INTERVAL = 12_000

const transport = fallback([
  http(primaryChain.rpcUrls.default.http[0]),
])

export const config = createConfig({
  chains: supportedChains,
  pollingInterval: POLL_INTERVAL,
  // @ts-expect-error -- wagmi wants a full Record keyed by all chain IDs but we resolve a single chain at build time
  transports: {
    [primaryChain.id]: transport,
  },
  syncConnectedChain: true,
  connectors: [
    injected({ target: 'metaMask' }),
    coinbaseWallet({
      appName: 'CLAWDY',
      preference: 'smartWalletOnly',
    }),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo-project',
      metadata: {
        name: 'CLAWDY',
        description: `Agentic sandbox on ${primaryChain.name}`,
        url: process.env.NEXT_PUBLIC_APP_URL || 'https://clawdy.io',
        icons: ['https://clawdy.io/icon.png'],
      },
    }),
  ],
})
