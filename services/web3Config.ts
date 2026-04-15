import { createConfig } from 'wagmi'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { xLayer, xLayerTestnet } from 'viem/chains'

export const isXLayerTestnet =
  process.env.NEXT_PUBLIC_USE_XLAYER_TESTNET === 'true'

export const primaryChain = isXLayerTestnet ? xLayerTestnet : xLayer
export const supportedChains = [primaryChain] as const

export const config = createConfig({
  chains: supportedChains,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transports: {} as Record<number, any>,
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
