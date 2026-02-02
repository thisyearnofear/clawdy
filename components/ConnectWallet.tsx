'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { agentProtocol } from '../services/AgentProtocol'
import { useState, useEffect } from 'react'

// Wallet Icons as SVG components for better visuals
const MetaMaskIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#E17726"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#E27625"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#E27625"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#E27625"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#E17726"/>
  </svg>
)

const CoinbaseIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="6" fill="#0052FF"/>
    <path d="M12 18c3.314 0 6-2.686 6-6s-2.686-6-6-6-6 2.686-6 6 2.686 6 6 6z" fill="white"/>
    <path d="M12 15c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3z" fill="#0052FF"/>
  </svg>
)

const WalletConnectIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
    <path d="M6.36 9.6c4.56-4.44 11.52-4.44 16.08 0l.54.54c.18.18.18.48 0 .66l-1.8 1.8c-.09.09-.24.09-.33 0l-.72-.72c-3.24-3.18-8.16-3.18-11.4 0l-.78.78c-.09.09-.24.09-.33 0l-1.8-1.8c-.18-.18-.18-.48 0-.66l.54-.54zM20.64 13.14l1.62 1.62c.18.18.18.48 0 .66l-7.26 7.26c-.18.18-.48.18-.66 0L6.9 15.3c-.18-.18-.18-.48 0-.66l1.62-1.62c.18-.18.48-.18.66 0l4.26 4.26c.09.09.24.09.33 0l4.26-4.26c.18-.12.48-.12.66.12z" fill="#3B99FC"/>
  </svg>
)

const GenericWalletIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
)

const getWalletIcon = (name: string) => {
  const lower = name.toLowerCase()
  if (lower.includes('metamask')) return <MetaMaskIcon />
  if (lower.includes('coinbase')) return <CoinbaseIcon />
  if (lower.includes('walletconnect')) return <WalletConnectIcon />
  return <GenericWalletIcon />
}

const getWalletColor = (name: string) => {
  const lower = name.toLowerCase()
  if (lower.includes('metamask')) return 'from-orange-500/20 to-orange-600/20 border-orange-500/30 text-orange-400'
  if (lower.includes('coinbase')) return 'from-blue-500/20 to-blue-600/20 border-blue-500/30 text-blue-400'
  if (lower.includes('walletconnect')) return 'from-sky-500/20 to-blue-500/20 border-sky-500/30 text-sky-400'
  return 'from-slate-500/20 to-slate-600/20 border-slate-500/30 text-slate-400'
}

export function ConnectWallet() {
  const { address, isConnected } = useAccount()
  const { connectors, connect, status } = useConnect()
  const { disconnect } = useDisconnect()
  const [isAutonomyActive, setIsAutonomyActive] = useState(agentProtocol.isAutonomyEnabled())
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Close modal when connected
  useEffect(() => {
    if (isConnected && isModalOpen) {
      setIsModalOpen(false)
    }
  }, [isConnected, isModalOpen])

  const initAutonomy = async () => {
    if (address) {
      const success = await agentProtocol.requestSessionPermissions(address)
      if (success) setIsAutonomyActive(true)
    }
  }

  const handleConnect = (connector: typeof connectors[0]) => {
    connect({ connector })
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-3 bg-black/20 backdrop-blur-xl rounded-2xl border border-white/10 p-2 pr-4">
        <div className="flex flex-col items-end">
          <span className="text-[9px] opacity-50 uppercase font-black tracking-wider">Connected</span>
          <span className="text-xs font-mono font-medium">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
        </div>

        {!isAutonomyActive ? (
          <button
            onClick={initAutonomy}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black rounded-xl shadow-lg transition-all animate-pulse"
          >
            INITIALIZE AUTONOMY
          </button>
        ) : (
          <div className="px-3 py-1.5 bg-green-500/20 border border-green-500/50 text-green-400 text-[10px] font-bold rounded-lg flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
            AUTONOMY ACTIVE
          </div>
        )}

        <button
          onClick={() => disconnect()}
          className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 text-[10px] font-bold rounded-lg transition-all"
        >
          DISCONNECT
        </button>
      </div>
    )
  }

  return (
    <>
      {/* Single Connect Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="group px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-black rounded-xl shadow-lg shadow-sky-900/20 transition-all active:scale-95 flex items-center gap-2"
      >
        <svg className="w-4 h-4 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        CONNECT WALLET
      </button>

      {/* Wallet Selection Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false)
          }}
        >
          <div className="bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
                  <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Connect Wallet</h3>
                  <p className="text-[10px] text-white/40">Select your preferred wallet</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/40 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Wallet Options */}
            <div className="p-4 space-y-2">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => handleConnect(connector)}
                  disabled={status === 'pending'}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-sky-500/50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {/* Wallet Icon */}
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getWalletColor(connector.name)} flex items-center justify-center border`}>
                    {getWalletIcon(connector.name)}
                  </div>
                  
                  <div className="flex-1 text-left">
                    <span className="text-sm font-bold text-white block">{connector.name}</span>
                    <span className="text-[10px] text-white/40">
                      {status === 'pending' ? 'Connecting...' : 'Click to connect'}
                    </span>
                  </div>

                  {status === 'pending' ? (
                    <div className="w-5 h-5 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5 text-white/20 group-hover:text-sky-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white/5 border-t border-white/10">
              <p className="text-[10px] text-white/30 text-center">
                New to wallets?{' '}
                <a 
                  href="https://ethereum.org/en/wallets/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:text-sky-300 transition-colors"
                >
                  Learn more about wallets
                </a>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
