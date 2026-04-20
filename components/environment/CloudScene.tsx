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
import { AgentChatter, emitChatter } from '../ui/AgentChatter'
import { HUD } from '../ui/HUD'
import { ControlPanel } from '../ui/ControlPanel'
import { Overlays } from '../ui/Overlays'
import { useGameStore } from '../../services/gameStore'
import { vehicleQueue } from '../../services/VehicleQueue'
import { trackEvent } from '../../services/analytics'

const WEATHER_DOMAINS_BY_PRESET = {
  stormy: [
    { domain: 'wind', label: 'Crosswind Surge', intensity: 0.9 },
    { domain: 'lightning', label: 'Lightning Front', intensity: 1.0 },
    { domain: 'dayNight', label: 'Storm Dusk', intensity: 0.7 },
  ],
  sunset: [
    { domain: 'dayNight', label: 'Golden Hour', intensity: 0.35 },
    { domain: 'wind', label: 'Warm Updrafts', intensity: 0.3 },
  ],
  cosmic: [
    { domain: 'dayNight', label: 'Deep Night', intensity: 1.0 },
    { domain: 'wind', label: 'Void Shear', intensity: 0.55 },
    { domain: 'lightning', label: 'Ionic Flashes', intensity: 0.65 },
  ],
  candy: [
    { domain: 'wind', label: 'Sugar Gusts', intensity: 0.25 },
    { domain: 'dayNight', label: 'Neon Glow', intensity: 0.25 },
  ],
  custom: [
    { domain: 'wind', label: 'Variable Winds', intensity: 0.2 },
  ],
} as const

export default function CloudScene() {
  const { address } = useAccount()
  const playerId = address || 'anonymous'
  const isWeatherAuctionConfigured =
    WEATHER_AUCTION_ADDRESS !== '0x0000000000000000000000000000000000000000'
  
  // State from GameStore
  const {
    cloudConfig: config, setCloudConfig,
    spawnRate, setSpawnRate,
    playerVehicle, setPlayerVehicle,
    ui, setUI,
    tickRound,
    setWeatherEffect,
    clearExpiredWeatherEffects,
  } = useGameStore()

  const [isMounted, setIsMounted] = useState(false)

  // On-chain weather sync
  useWatchContractEvent({
    address: WEATHER_AUCTION_ADDRESS as `0x${string}`,
    abi: WEATHER_AUCTION_ABI,
    eventName: 'WeatherChanged',
    pollingInterval: POLL_INTERVAL,
    enabled: isWeatherAuctionConfigured,
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
        emitChatter(event.agentId as string || 'Agent', 'bid-won')

        const preset = (event.preset as keyof typeof WEATHER_DOMAINS_BY_PRESET) || 'custom'
        const effects = WEATHER_DOMAINS_BY_PRESET[preset] ?? WEATHER_DOMAINS_BY_PRESET.custom
        effects.forEach((effect) => {
          setWeatherEffect({
            ...effect,
            domain: effect.domain,
            source: 'auction',
            startedAt: now,
            expiresAt: now + 60_000,
          })
          trackEvent('weather_auction_effect_applied', {
            preset,
            domain: effect.domain,
            intensity: effect.intensity,
            source: 'auction',
          })
        })
      } else if (event.type === 'food-collected') {
        const amount = (event.amount as number ?? 0.1)
        const comboCount = Number(event.comboCount ?? 1)
        const comboMultiplier = Number(event.comboMultiplier ?? 1)

        emitToast('collect', `+${amount.toFixed(3)} 0G collected`, event.agentId as string)
        playSound('collect')
        if (Math.random() < 0.3) emitChatter(event.agentId as string || 'Agent', 'food-collected')
        const session = agentProtocol.getSession('Player')
        if (session) emitEconomyFeedback(event.amount as number ?? 0.1, session.balance)

        // Combo delight: only start calling it out after the second chain.
        if (comboCount >= 2) {
          emitToast('milestone', `Combo x${comboCount}!`, `${comboMultiplier.toFixed(2)}× yield`)
          if (comboCount >= 4) playSound('milestone')
        }
      } else if (event.type === 'powerup') {
        const power = event.power as string
        if (power === 'boost') {
          emitToast('milestone', 'Speed Boost!', 'Spicy pepper activated')
          playSound('milestone')
        } else if (power === 'float') {
          emitToast('milestone', 'Anti-Gravity!', 'Floaty marshmallow activated')
          playSound('milestone')
        } else if (power === 'jackpot') {
          emitToast('milestone', 'Golden Drop!', 'Bonus yield collected')
          playSound('milestone')
        } else if (power === 'bubble') {
          emitToast('milestone', 'Air Bubble!', 'Water drag cleared (briefly)')
          playSound('milestone')
        }
      } else if (event.type === 'milestone') {
        emitToast('milestone', event.message as string)
        playSound('milestone')
        emitChatter(event.agentId as string || 'Agent', 'milestone')
      } else if (event.type === 'agent-died') {
        emitChatter(event.agentId as string || 'Agent', 'agent-died')
        emitToast('bid-win', `Agent Decommissioned`, `${(event.agentId as string).slice(0,8)} ran out of vitality. Legacy: ${Number(event.totalEarned).toFixed(3)} 0G`)
      }
    })

    // Tick round every second
    const roundInterval = setInterval(() => {
      tickRound()
      clearExpiredWeatherEffects()
    }, 1000)

    let previousPlayerActive = false
    const unsubscribeQueue = vehicleQueue.subscribe((state) => {
      const playerActive = state.isPlayerActive(playerId)
      if (playerActive && !previousPlayerActive) {
        const now = Date.now()
        setWeatherEffect({
          domain: 'wind',
          label: 'Player Drop-In Turbulence',
          intensity: 0.5,
          source: 'drop-in',
          startedAt: now,
          expiresAt: now + 25_000,
        })
        trackEvent('player_influence_window_started', {
          playerId,
          domain: 'wind',
          intensity: 0.5,
          source: 'drop-in',
        })
      }
      previousPlayerActive = playerActive
    })

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setUI({ isSidebarOpen: !ui.isSidebarOpen, showQuickControls: false })
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        setUI({ showQuickControls: !ui.showQuickControls })
      }
      if (e.key.toLowerCase() === 'h') {
        setUI({ showHUD: !ui.showHUD })
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      unsubscribeWeather()
      unsubscribeEvents?.()
      unsubscribeQueue()
      clearInterval(roundInterval)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    clearExpiredWeatherEffects,
    playerId,
    setCloudConfig,
    setUI,
    setWeatherEffect,
    tickRound,
    ui.isSidebarOpen,
    ui.showQuickControls,
  ])

  const updateConfig = <K extends keyof CloudConfig>(key: K, value: CloudConfig[K]) => {
    setCloudConfig({ [key]: value })
  }

  const applyPreset = (preset: NonNullable<CloudConfig['preset']>) => {
    setCloudConfig({ preset })
    setUI({ showQuickControls: false })
  }

  return (
    <div className="w-full h-screen bg-gradient-to-b from-sky-400 to-sky-200 relative overflow-hidden">
      <Canvas shadows={{ type: 1 }}> {/* 1 is PCFShadowMap in THREE */}
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

      <AgentChatter />

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
