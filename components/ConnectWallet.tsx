import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { agentProtocol } from '../services/AgentProtocol'
import { useState } from 'react'

export function ConnectWallet() {
  const { address, isConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const [isAutonomyActive, setIsAutonomyActive] = useState(agentProtocol.isAutonomyEnabled())

  const initAutonomy = async () => {
    if (address) {
      const success = await agentProtocol.requestSessionPermissions(address)
      if (success) setIsAutonomyActive(true)
    }
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end">
          <span className="text-[10px] opacity-50 uppercase font-black">Connected</span>
          <span className="text-xs font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
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
    <div className="flex gap-2">
      {connectors.map((connector) => (
        <button
          key={connector.uid}
          onClick={() => connect({ connector })}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-black rounded-xl shadow-lg shadow-sky-900/20 transition-all active:scale-95"
        >
          CONNECT {connector.name.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
