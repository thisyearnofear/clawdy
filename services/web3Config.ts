import { createConfig } from 'wagmi'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { http } from 'wagmi'
import { xLayer, xLayerTestnet } from 'viem/chains'

export const isXLayerTestnet =
  process.env.NEXT_PUBLIC_USE_XLAYER_TESTNET === 'true'

export const primaryChain = isXLayerTestnet ? xLayerTestnet : xLayer
export const supportedChains = [xLayer, xLayerTestnet] as const

export const config = createConfig({
  chains: supportedChains,
  transports: {
    [xLayer.id]: http(),
    [xLayerTestnet.id]: http(),
  },
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
