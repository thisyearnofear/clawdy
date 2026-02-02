import { http, createConfig } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'

export const config = createConfig({
  chains: [base, baseSepolia],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
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
        description: 'Continuous Decentralized Sandbox',
        url: 'https://clawdy.io',
        icons: ['https://clawdy.io/icon.png']
      }
    }),
  ],
})
