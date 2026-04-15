'use client'

import { Canvas } from '@react-three/fiber'
import { Suspense, useState, useEffect } from 'react'
import Experience from './Experience'
import { Loader } from '@react-three/drei'
import { CloudConfig } from './CloudManager'
import { agentProtocol, WEATHER_AUCTION_ADDRESS } from '../../services/AgentProtocol'
import { useWatchContractEvent, useAccount } from 'wagmi'
import { WEATHER_AUCTION_ABI } from '../../services/abis/WeatherAuction'
import { POLL_INTERVAL } from '../../services/web3Config'
import { emitToast } from '../ui/GameToasts'
import { playSound } from '../ui/SoundManager'
import { emitEconomyFeedback } from '../ui/EconomyFeedback'
import { HUD } from '../ui/HUD'
import { ControlPanel } from '../ui/ControlPanel'
import { Overlays } from '../ui/Overlays'
import { useGameStore } from '../../services/gameStore'

export default function CloudScene() {
  const { address } = useAccount()
  const playerId = address || 'anonymous'
  
  // State from GameStore
  const { 
    cloudConfig: config, setCloudConfig,
    spawnRate, setSpawnRate,
    playerVehicle, setPlayerVehicle,
    ui, setUI,
    tickRound
  } = useGameStore()

  const [isMounted, setIsMounted] = useState(false)

  // On-chain weather sync
  useWatchContractEvent({
    address: WEATHER_AUCTION_ADDRESS as `0x${string}`,
    abi: WEATHER_AUCTION_ABI,
    eventName: 'WeatherChanged',
    pollingInterval: POLL_INTERVAL,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onLogs(logs: any[]) {
      const event = logs[0]?.args
      if (event?.preset) {
        agentProtocol.processCommand({
          agentId: 'On-Chain', timestamp: Date.now(), bid: 0,
          config: { preset: event.preset as CloudConfig['preset'] }, duration: 60000
        })
      }
    },
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true)
    
    // Onboarding check
    if (!localStorage.getItem('clawdy-onboarded')) {
      setUI({ showOnboarding: true })
    }

    // AgentProtocol subscriptions
    const unsubscribeWeather = agentProtocol.subscribeToWeather((newConfig) => {
      setCloudConfig({ ...newConfig, preset: 'custom' })
    })

    let lastBidWinAt = 0
    const unsubscribeEvents = agentProtocol.subscribeToEvents?.((event) => {
      if (event.type === 'bid-won') {
        const now = Date.now()
        if (now - lastBidWinAt < 5000) return
        lastBidWinAt = now
        setUI({ bidWinPreset: event.preset as string })
        emitToast('bid-win', 'Weather Auction Won!', `${event.preset} weather activated`)
        playSound('bid-win')
      } else if (event.type === 'food-collected') {
        emitToast('collect', `+${(event.amount as number ?? 0.1).toFixed(2)} OKB collected`, event.agentId as string)
        playSound('collect')
        const session = agentProtocol.getSession('Player')
        if (session) emitEconomyFeedback(event.amount as number ?? 0.1, session.balance)
      } else if (event.type === 'milestone') {
        emitToast('milestone', event.message as string)
        playSound('milestone')
      }
    })

    // Tick round every second
    const roundInterval = setInterval(() => tickRound(), 1000)

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setUI({ isSidebarOpen: !ui.isSidebarOpen, showQuickControls: false })
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        setUI({ showQuickControls: !ui.showQuickControls })
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      unsubscribeWeather()
      unsubscribeEvents?.()
      clearInterval(roundInterval)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [tickRound, setCloudConfig, setUI, ui.isSidebarOpen, ui.showQuickControls])

  const updateConfig = <K extends keyof CloudConfig>(key: K, value: CloudConfig[K]) => {
    setCloudConfig({ [key]: value })
  }

  const applyPreset = (preset: NonNullable<CloudConfig['preset']>) => {
    setCloudConfig({ preset })
    setUI({ showQuickControls: false })
  }

  return (
    <div className="w-full h-screen bg-gradient-to-b from-sky-400 to-sky-200 relative overflow-hidden">
      <Canvas shadows>
        <Suspense fallback={null}>
          <Experience cloudConfig={config} spawnRate={spawnRate} playerVehicleType={playerVehicle} />
        </Suspense>
      </Canvas>
      <Loader />

      <Overlays 
        showOnboarding={ui.showOnboarding}
        onDoneOnboarding={() => {
          setUI({ showOnboarding: false })
          localStorage.setItem('clawdy-onboarded', '1')
        }}
        bidWinPreset={ui.bidWinPreset}
        onDoneBidWin={() => setUI({ bidWinPreset: null })}
      />

      <HUD 
        playerId={playerId}
        isMounted={isMounted}
        onOpenSidebar={() => setUI({ isSidebarOpen: true })}
        onToggleQuickControls={() => setUI({ showQuickControls: !ui.showQuickControls })}
        showQuickControls={ui.showQuickControls}
        cloudConfig={config}
        onApplyPreset={applyPreset}
      />

      <ControlPanel 
        isOpen={ui.isSidebarOpen}
        onClose={() => setUI({ isSidebarOpen: false })}
        activeTab={ui.activeTab}
        setActiveTab={(tab) => setUI({ activeTab: tab })}
        cloudConfig={config}
        updateConfig={updateConfig}
        spawnRate={spawnRate}
        setSpawnRate={setSpawnRate}
        playerVehicle={playerVehicle}
        setPlayerVehicle={setPlayerVehicle}
      />

      {/* Help hint component */}
      <HelpHint />
    </div>
  )
}

function HelpHint() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(timer)
  }, [])
  if (!visible) return null
  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-xl rounded-full px-4 py-2 border border-white/10 animate-in fade-in slide-in-from-bottom-4 z-10">
      <p className="text-[10px] text-white/70 font-medium">
        Press <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">ESC</kbd> for controls · <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">Tab</kbd> for quick weather
      </p>
    </div>
  )
}
