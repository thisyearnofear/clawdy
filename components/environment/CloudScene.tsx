'use client'

import { Canvas } from '@react-three/fiber'
import { Suspense, useState, useEffect, useRef } from 'react'
import Experience from './Experience'
import { Loader, Environment, PerformanceMonitor } from '@react-three/drei'
import { CloudConfig } from './CloudManager'
import { agentProtocol, WEATHER_AUCTION_ADDRESS, getMemeMarketAbility } from '../../services/AgentProtocol'
import { useWatchContractEvent, useAccount, useReadContract } from 'wagmi'
import { WEATHER_AUCTION_ABI } from '../../services/abis/WeatherAuction'
import { POLL_INTERVAL } from '../../services/web3Config'
import { emitToast, emitDiscoveryNudge, emitAuctionFlash } from '../ui/GameToasts'
import { playSound } from '../ui/SoundManager'
import { emitEconomyFeedback } from '../ui/EconomyFeedback'
import { AgentChatter, emitChatter } from '../ui/AgentChatter'
import { AgentDecisionPanel } from '../ui/AgentDecisionPanel'
import { RoundObjectives } from '../ui/RoundObjectives'
import { HUD } from '../ui/HUD'
import dynamic from 'next/dynamic'
import { Overlays } from '../ui/Overlays'
import { MobileTouchControls } from '../ui/MobileTouchControls'
import { useGameStore } from '../../services/gameStore'
import { vehicleQueue } from '../../services/VehicleQueue'
import { trackEvent } from '../../services/analytics'
import { upsertLeaderboardEntry } from '../../hooks/useRealtimeLeaderboard'

const ControlPanel = dynamic(() => import('../ui/ControlPanel').then(m => m.ControlPanel), { ssr: false })

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
  const flood = useGameStore(s => s.flood)
  const cumulativeScore = useGameStore(s => s.cumulativeScore)
  const round = useGameStore(s => s.round)
  const lastFloodNudgeRef = useRef(0)
  const lastScoreNudgeRef = useRef(0)
  const scoreNudgeFired = cumulativeScore >= 1.0

  // Sync leaderboard to Supabase when a round ends
  const lastSyncedRoundRef = useRef(0)
  useEffect(() => {
    if (!round.isActive && round.winner && round.endedAt && round.roundNumber !== lastSyncedRoundRef.current) {
      lastSyncedRoundRef.current = round.roundNumber
      const sessions = useGameStore.getState().sessions
      const playerSession = sessions['Player']
      if (playerSession) {
        upsertLeaderboardEntry({
          playerId: playerId || 'anonymous',
          walletAddress: undefined,
          totalEarned: playerSession.totalEarned,
          totalCollected: playerSession.collectedCount,
          roundsPlayed: round.roundNumber,
          roundsWon: round.winner === 'Player' ? 1 : 0,
          bestComboMultiplier: playerSession.comboMultiplier,
        }).catch(() => { /* non-blocking */ })
      }
    }
  }, [round.isActive, round.winner, round.endedAt, round.roundNumber, playerId])

  const { data: onChainWeatherConfig } = useReadContract({
    address: WEATHER_AUCTION_ADDRESS as `0x${string}`,
    abi: WEATHER_AUCTION_ABI,
    functionName: 'getCurrentConfig',
    query: {
      enabled: isWeatherAuctionConfigured,
      refetchInterval: POLL_INTERVAL,
    },
  })

  useEffect(() => {
    if (!onChainWeatherConfig || !isWeatherAuctionConfigured) return

    const [, , expiresAt, config] = onChainWeatherConfig as unknown as [
      string,
      bigint,
      bigint,
      { preset: string; volume: bigint; growth: bigint; speed: bigint; color: number }
    ]

    if (Number(expiresAt) * 1000 <= Date.now()) return

    setCloudConfig({
      preset: config.preset as CloudConfig['preset'],
      volume: Number(config.volume),
      growth: Number(config.growth),
      speed: Number(config.speed) / 100,
    })
  }, [isWeatherAuctionConfigured, onChainWeatherConfig, setCloudConfig])

  // Flood peak nudge — fires once per flood peak, not more than every 2 min
  useEffect(() => {
    if (flood.phase !== 'peak') return
    const now = Date.now()
    if (now - lastFloodNudgeRef.current < 120_000) return
    lastFloodNudgeRef.current = now
    emitDiscoveryNudge({
      emoji: '🌊',
      title: 'Flood Drain ability can clear this',
      body: 'Mint a Flood Drain charge in the Control Panel to drop the water level instantly.',
      cta: 'See abilities →',
      tab: 'weather',
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flood.phase])

  // Score milestone nudge — fires once when cumulative score crosses 1.0 0G
  useEffect(() => {
    if (!scoreNudgeFired) return
    if (lastScoreNudgeRef.current > 0) return
    lastScoreNudgeRef.current = Date.now()
    emitDiscoveryNudge({
      emoji: '🏆',
      title: 'Save this score on-chain',
      body: 'Connect a wallet to persist your career score to 0G Storage and appear on the leaderboard.',
      cta: 'View stats →',
      tab: 'stats',
    })
  }, [scoreNudgeFired])

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
        emitAuctionFlash({ agentId: (event.agentId as string) || 'Agent', preset: event.preset as string })
        emitChatter(event.agentId as string || 'Agent', 'bid-won')
        emitDiscoveryNudge({
          emoji: '⛅',
          title: 'You can bid on weather too',
          body: 'Win the auction → control what falls → earn more. Opens every 60s.',
          cta: 'Try it →',
          tab: 'weather',
        })

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
      } else if (event.type === 'asset-collected') {
        const amount = (event.amount as number ?? 0.1)
        const comboCount = Number(event.comboCount ?? 1)
        const comboMultiplier = Number(event.comboMultiplier ?? 1)

        emitToast('collect', `+${amount.toFixed(3)} 0G collected`, event.agentId as string)
        playSound('collect')
        if (Math.random() < 0.3) emitChatter(event.agentId as string || 'Agent', 'asset-collected')
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
        } else if (power === 'board') {
          emitToast('milestone', 'Foam Board!', 'Grip up in flood water')
          playSound('milestone')
        } else if (power === 'drain') {
          emitToast('milestone', 'Drain Plug!', 'Flood drops temporarily')
          playSound('milestone')
        }
      } else if (event.type === 'ability-minted') {
        const ability = getMemeMarketAbility(Number(event.abilityId))
        if (event.abilityKey === 'flood_drain') {
          emitToast('milestone', 'Flood Drain Charge', 'Use it from Strategy')
        } else {
          emitToast('collect', `${ability?.label ?? 'Ability'} minted`, `Token #${event.abilityId}`)
        }
        playSound('milestone')
        emitChatter(event.agentId as string || 'Agent', 'milestone')
      } else if (event.type === 'ability-used') {
        if (event.abilityKey === 'flood_drain') {
          emitToast('milestone', 'Flood Drain Used', 'Water level dropping now')
        } else {
          emitToast('milestone', `${event.abilityLabel ?? 'Ability'} used`)
        }
        playSound('milestone')
        emitChatter(event.agentId as string || 'Agent', 'milestone')
      } else if (event.type === 'strategy-selected') {
        emitToast('milestone', `${event.strategyLabel ?? 'Strategy'} selected`, `${event.strategyIcon ?? '🎯'} Session updated`)
        playSound('milestone')
        emitChatter(event.agentId as string || 'Agent', 'milestone')
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
      const store = useGameStore.getState()
      if (e.key === 'Escape') {
        setUI({ isSidebarOpen: !store.ui.isSidebarOpen })
      }
      if (e.key.toLowerCase() === 'h') {
        setUI({ showHUD: !store.ui.showHUD })
      }
      if (e.key.toLowerCase() === 'v') {
        setUI(
          store.ui.isSidebarOpen && store.ui.activeTab === 'vehicles'
            ? { isSidebarOpen: false }
            : { isSidebarOpen: true, activeTab: 'vehicles', vehiclesTabPulseAt: Date.now() }
        )
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
  ])

  const updateConfig = <K extends keyof CloudConfig>(key: K, value: CloudConfig[K]) => {
    setCloudConfig({ [key]: value })
  }

  const applyPreset = (preset: NonNullable<CloudConfig['preset']>) => {
    setCloudConfig({ preset })
  }

  const [dpr, setDpr] = useState(1.5)

  return (
    <div className="w-full h-screen bg-gradient-to-b from-sky-400 to-sky-200 relative overflow-hidden">
      <Canvas shadows={{ type: 1 }} dpr={dpr}> {/* 1 is PCFShadowMap in THREE */}
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
        <Suspense fallback={null}>
          <Environment preset="city" />
          <Experience cloudConfig={config} spawnRate={spawnRate} playerVehicleType={playerVehicle} />
        </Suspense>
      </Canvas>
      <Loader />

      <Overlays 
        showOnboarding={ui.showOnboarding}
        onDoneOnboarding={(preferredVehicleType) => {
          setUI({ showOnboarding: false, preferredVehicleType: preferredVehicleType ?? null })
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

      {/* New UI components for Product/Game Design improvements */}
      <AgentDecisionPanel />
      <RoundObjectives />

      {/* Mobile touch controls - always rendered, component handles internal mobile detection */}
      <MobileTouchControls />

      {/* Help hint component - persistent until first keypress */}
      <HelpHint />
    </div>
  )
}

function HelpHint() {
  const [visible, setVisible] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  
  useEffect(() => {
    if (dismissed) return
    
    // Show for 30 seconds instead of 5 - gives user time to find it
    const timer = setTimeout(() => {
      setVisible(false)
    }, 30000)
    
    // Listen for any keypress to dismiss
    const handleKeyDown = () => {
      setDismissed(true)
      setVisible(false)
    }
    window.addEventListener('keydown', handleKeyDown, { once: true })
    
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [dismissed])
  
  if (!visible || dismissed) return null
  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-xl rounded-full px-4 py-2 border border-white/10 animate-in fade-in slide-in-from-bottom-4 z-10">
      <p className="text-[10px] text-white/70 font-medium">
        Press <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">ESC</kbd> controls · <kbd className="px-2 py-0.5 bg-white/10 rounded text-white font-mono">V</kbd> tuning
      </p>
    </div>
  )
}
