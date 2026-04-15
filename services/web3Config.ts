import { createConfig } from 'wagmi'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { http, fallback } from 'wagmi'
import { xLayer, xLayerTestnet } from 'viem/chains'

export const isXLayerTestnet =
  process.env.NEXT_PUBLIC_USE_XLAYER_TESTNET === 'true'

export const primaryChain = isXLayerTestnet ? xLayerTestnet : xLayer
export const supportedChains = [xLayer, xLayerTestnet] as const

// Poll every 12s (wagmi default is 4s) — sufficient for game event sync
export const POLL_INTERVAL = 12_000

// Use a no-op transport for the inactive chain to prevent 403 polling errors.
// The inactive chain's transport points to the active RPC (never actually called).
const testnetTransport = fallback([
  http('https://xlayertestrpc.okx.com'),
  http('https://testrpc.xlayer.tech'),
])
const mainnetTransport = http('https://rpc.xlayer.tech')

export const config = createConfig({
  chains: supportedChains,
  pollingInterval: POLL_INTERVAL,
  transports: {
    [xLayer.id]: isXLayerTestnet ? testnetTransport : mainnetTransport,
    [xLayerTestnet.id]: testnetTransport,
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
        description: 'Agentic sandbox on X Layer',
        url: process.env.NEXT_PUBLIC_APP_URL || 'https://clawdy.io',
        icons: ['https://clawdy.io/icon.png']
      }
    }),
  ],
})
