import { createConfig } from 'wagmi'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { http, fallback } from 'wagmi'
import { defineChain } from 'viem'

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

export const is0GTestnet =
  (process.env.NEXT_PUBLIC_USE_0G_TESTNET ?? process.env.NEXT_PUBLIC_USE_XLAYER_TESTNET) === 'true'

export const primaryChain = is0GTestnet ? zeroGTestnet : zeroGMainnet
export const supportedChains = [primaryChain] as const

// Poll every 12s (wagmi default is 4s) — sufficient for game event sync
export const POLL_INTERVAL = 12_000

// Use a no-op transport for the inactive chain to prevent 403 polling errors.
// The inactive chain's transport points to the active RPC (never actually called).
const testnetTransport = fallback([
  http('https://evmrpc-testnet.0g.ai'),
])
const mainnetTransport = fallback([
  http('https://evmrpc.0g.ai'),
])

export const config = createConfig({
  chains: supportedChains,
  pollingInterval: POLL_INTERVAL,
  transports: {
    [zeroGMainnet.id]: mainnetTransport,
    [zeroGTestnet.id]: testnetTransport,
  },
  // Stop polling when the browser tab is hidden
  syncConnectedChain: true,
  connectors: [
    injected({ target: 'metaMask' }),
    coinbaseWallet({ 
      appName: 'CLAWDY',
      preference: 'smartWalletOnly'
    }),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo-project',
      metadata: {
        name: 'CLAWDY',
        description: 'Agentic sandbox on 0G',
        url: process.env.NEXT_PUBLIC_APP_URL || 'https://clawdy.io',
        icons: ['https://clawdy.io/icon.png']
      }
    }),
  ],
})
