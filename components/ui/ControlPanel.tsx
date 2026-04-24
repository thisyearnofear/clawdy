'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useAccount, useChainId, useReadContract, useReadContracts } from 'wagmi'
import { Leaderboard } from './Leaderboard'
import { ConnectWallet } from './ConnectWallet'
import { CloudConfig } from '../environment/CloudManager'
import {
  VehicleType,
  MEME_MARKET_ABILITIES,
  agentProtocol,
  getContractsForChain,
  isChainSupported,
  CONTRACT_ADDRESSES,
  getMemeMarketStrategy,
  getMemeMarketStrategyPreset,
  getMemeMarketStrategyVehicle,
  MEME_MARKET_STRATEGIES,
} from '../../services/AgentProtocol'
import { useGameStore, type VehicleHandlingProfile } from '../../services/gameStore'
import { VEHICLE_STATS } from '../vehicles/Vehicle'
import { SPEEDSTER_STATS } from '../vehicles/Speedster'
import { TRUCK_STATS } from '../vehicles/MonsterTruck'
import { TANK_STATS } from '../vehicles/Tank'
import { primaryChain, supportedChains } from '../../services/web3Config'
import { emitToast } from './GameToasts'
import { formatTransactionStatus, getStatusColor } from '../../services/transactionHandler'
import { MEME_MARKET_ABI } from '../../services/abis/MemeMarket'

const VEHICLE_PROFILES = [
  { profile: 'speedster' as VehicleHandlingProfile, label: 'Speedster', icon: '🏎️', stats: SPEEDSTER_STATS },
  { profile: 'vehicle' as VehicleHandlingProfile, label: 'Car', icon: '🚗', stats: VEHICLE_STATS },
  { profile: 'monster' as VehicleHandlingProfile, label: 'Truck', icon: '🛻', stats: TRUCK_STATS },
  { profile: 'tank' as VehicleHandlingProfile, label: 'Tank', icon: '🪖', stats: TANK_STATS },
]

interface ControlPanelProps {
  isOpen: boolean
  onClose: () => void
  activeTab: 'weather' | 'vehicles' | 'stats'
  setActiveTab: (tab: 'weather' | 'vehicles' | 'stats') => void
  cloudConfig: CloudConfig
  updateConfig: <K extends keyof CloudConfig>(key: K, value: CloudConfig[K]) => void
  spawnRate: number
  setSpawnRate: (rate: number) => void
  playerVehicle: VehicleType
  setPlayerVehicle: (v: VehicleType) => void
}

export function ControlPanel({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  cloudConfig,
  updateConfig,
  spawnRate,
  setSpawnRate,
  playerVehicle,
  setPlayerVehicle
}: ControlPanelProps) {
  const { address } = useAccount()
  const chainId = useChainId()
  const handlingMode = useGameStore(s => s.handlingMode)
  const setHandlingMode = useGameStore(s => s.setHandlingMode)
  const steerRetentionOverrides = useGameStore(s => s.steerRetentionOverrides)
  const setSteerRetentionOverride = useGameStore(s => s.setSteerRetentionOverride)
  const clearSteerRetentionOverride = useGameStore(s => s.clearSteerRetentionOverride)
  const lateralGripOverrides = useGameStore(s => s.lateralGripOverrides)
  const setLateralGripOverride = useGameStore(s => s.setLateralGripOverride)
  const clearLateralGripOverride = useGameStore(s => s.clearLateralGripOverride)
  const accelerationOverrides = useGameStore(s => s.accelerationOverrides)
  const setAccelerationOverride = useGameStore(s => s.setAccelerationOverride)
  const clearAccelerationOverride = useGameStore(s => s.clearAccelerationOverride)
  const maxSpeedOverrides = useGameStore(s => s.maxSpeedOverrides)
  const setMaxSpeedOverride = useGameStore(s => s.setMaxSpeedOverride)
  const clearMaxSpeedOverride = useGameStore(s => s.clearMaxSpeedOverride)
  const clearAllHandlingOverrides = useGameStore(s => s.clearAllHandlingOverrides)
  const zgStorage = useGameStore(s => s.zgStorage)
  const setZgStorage = useGameStore(s => s.setZgStorage)
  const sessions = useGameStore(s => s.sessions)
  const pendingTransactions = useGameStore(s => s.pendingTransactions)
  const playerId = useGameStore(s => s.playerId)
  const playerSession = sessions['Player']
  const playerStrategy = getMemeMarketStrategy(playerSession?.strategyId)
  const recommendedWeatherPreset = getMemeMarketStrategyPreset(playerStrategy?.id)
  const recommendedVehicle = getMemeMarketStrategyVehicle(playerStrategy?.id)
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false)
  const vehiclesTabPulseAt = useGameStore(s => s.ui.vehiclesTabPulseAt)
  const [sliderGlow, setSliderGlow] = useState(false)
  const [showAdvancedTuning, setShowAdvancedTuning] = useState(false)

  useEffect(() => {
    if (!vehiclesTabPulseAt || !isOpen || activeTab !== 'vehicles') {
      setSliderGlow(false)
      return
    }
    setSliderGlow(true)
    setShowAdvancedTuning(true)
    const timer = setTimeout(() => setSliderGlow(false), 2500)
    return () => clearTimeout(timer)
  }, [vehiclesTabPulseAt, isOpen, activeTab])

  // ── PlayerStrategyPanel logic (CONSOLIDATION: merged into ControlPanel) ──
  const [manualBidOverride, setManualBidOverride] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const floodDrainAbility = MEME_MARKET_ABILITIES.find((ability) => ability.key === 'flood_drain')

  const abilityStatus = useMemo(() => {
    return MEME_MARKET_ABILITIES.map((ability) => {
      const activeUntil = ability.key === 'speed_boost'
        ? playerSession?.speedBoostUntil
        : ability.key === 'anti_gravity'
          ? playerSession?.antiGravityUntil
          : undefined
      const remainingSeconds = activeUntil && activeUntil > nowMs
        ? Math.ceil((activeUntil - nowMs) / 1000)
        : 0
      const charges = ability.key === 'flood_drain' ? (playerSession?.drainPlugCount ?? 0) : 0
      return { ...ability, remainingSeconds, charges }
    })
  }, [nowMs, playerSession?.antiGravityUntil, playerSession?.drainPlugCount, playerSession?.speedBoostUntil])

  const handleStrategySelect = useCallback((strategy: (typeof MEME_MARKET_STRATEGIES)[number]) => {
    const success = agentProtocol.setPlayerStrategy(playerId, strategy.id)
    if (success && strategy) {
      emitToast('milestone', `Strategy: ${strategy.label}`, `${strategy.icon} Aggression: ${Math.round(strategy.aggressive * 100)}%`)
    }
  }, [playerId])

  const handleManualBid = useCallback(() => {
    if (manualBidOverride === null || manualBidOverride <= 0) {
      emitToast('bid-lose', 'Enter bid amount', 'Must be greater than 0')
      return
    }
    useGameStore.getState().setSession(playerId, { mission: 'manual' })
    emitToast('milestone', 'Manual Bid', `Will bid ${manualBidOverride.toFixed(4)} 0G`)
  }, [playerId, manualBidOverride])

  const handleUseFloodDrain = useCallback(() => {
    if (!floodDrainAbility) return
    const success = agentProtocol.activateMemeMarketAbility(floodDrainAbility.id)
    if (!success) {
      emitToast('bid-lose', 'No Flood Drain Charges', 'Mint one before draining the flood')
    }
  }, [floodDrainAbility])

  // Resolve contracts and explorer for the currently connected chain
  const activeChain = supportedChains.find(c => c.id === chainId) ?? primaryChain
  const contracts = getContractsForChain(chainId)
  const chainHasContracts = isChainSupported(chainId)
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as const
  const explorerBase = activeChain.blockExplorers?.default.url
  const isMemeMarketConfigured = contracts.memeMarket !== ZERO_ADDR

  const { data: memeMarketOwner } = useReadContract({
    address: contracts.memeMarket as `0x${string}`,
    abi: MEME_MARKET_ABI,
    functionName: 'owner',
    query: {
      enabled: isMemeMarketConfigured,
      refetchInterval: 12_000,
    },
  })

  const { data: abilityBalances, refetch: refetchAbilityBalances } = useReadContracts({
    contracts: MEME_MARKET_ABILITIES.map((ability) => ({
      address: contracts.memeMarket as `0x${string}`,
      abi: MEME_MARKET_ABI,
      functionName: 'balanceOf' as const,
      args: [address ?? '0x0000000000000000000000000000000000000000', BigInt(ability.id)] as const,
    })),
    query: {
      enabled: isMemeMarketConfigured && Boolean(address),
      refetchInterval: 12_000,
    },
  })

  const canMintAbilities = Boolean(
    isMemeMarketConfigured &&
    address &&
    memeMarketOwner &&
    address.toLowerCase() === (memeMarketOwner as string).toLowerCase(),
  )

  const shorten = (value: string, left = 6, right = 4) => {
    if (!value) return ''
    if (value.length <= left + right) return value
    return `${value.slice(0, left)}…${value.slice(-right)}`
  }

  const copy = async (label: string, value?: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      emitToast('milestone', `${label} copied`)
    } catch {
      emitToast('bid-lose', `Could not copy ${label}`)
    }
  }

  const contractLink = (address: string) =>
    explorerBase && address && address !== '0x0000000000000000000000000000000000000000'
      ? `${explorerBase.replace(/\/$/, '')}/address/${address}`
      : null

  const transactionLink = (hash?: string) =>
    explorerBase && hash ? `${explorerBase.replace(/\/$/, '')}/tx/${hash}` : null

  const sessionSnapshot = useMemo(() => {
    const out: Record<string, {
      balance: number
      totalEarned: number
      totalPaid: number
      collectedCount: number
      executedBidCount: number
      executedRentCount: number
      vitality: number
      burden: number
      decisionCount: number
    }> = {}
    for (const [id, s] of Object.entries(sessions)) {
      out[id] = {
        balance: s.balance ?? 0,
        totalEarned: s.totalEarned ?? 0,
        totalPaid: s.totalPaid ?? 0,
        collectedCount: s.collectedCount ?? 0,
        executedBidCount: s.executedBidCount ?? 0,
        executedRentCount: s.executedRentCount ?? 0,
        vitality: s.vitality ?? 0,
        burden: s.burden ?? 0,
        decisionCount: s.decisionCount ?? 0,
      }
    }
    return out
  }, [sessions])

  const recentTransactions = useMemo(
    () => [...pendingTransactions].sort((a, b) => b.timestamp - a.timestamp).slice(0, 3),
    [pendingTransactions],
  )

  const marketBalances = useMemo(() => {
    return MEME_MARKET_ABILITIES.map((ability, index) => {
      const result = abilityBalances?.[index]
      return {
        ...ability,
        balance: result?.status === 'success' ? Number(result.result ?? BigInt(0)) : 0,
      }
    })
  }, [abilityBalances])

  const mintAbility = async (abilityId: number, label: string) => {
    if (!address) return

    const success = await agentProtocol.mintAbilityOnChain(address as `0x${string}`, abilityId, 1)
    if (success) {
      emitToast('milestone', `${label} minted`, 'Check your wallet balance')
      await refetchAbilityBalances()
    } else {
      emitToast('bid-lose', `${label} mint failed`, canMintAbilities ? 'Check wallet permissions' : 'Only the contract owner can mint')
    }
  }

  const saveSnapshotNow = async () => {
    if (isSavingSnapshot) return

    // We want this to feel like a “save progress” feature, not a judge tool.
    if (!zgStorage.available) {
      emitToast('bid-lose', 'Cloud save is offline', 'Using local save for now')
      return
    }
    if (!zgStorage.configured) {
      emitToast('bid-lose', 'Cloud save not enabled', 'Set a server key to enable 0G Storage uploads')
      return
    }

    setIsSavingSnapshot(true)
    try {
      const { zgSaveState } = await import('../../services/zgStorage')
      const result = await zgSaveState('global', {
        version: 1,
        timestamp: Date.now(),
        sessions: sessionSnapshot,
        steerRetentionOverrides: useGameStore.getState().steerRetentionOverrides,
        lateralGripOverrides: useGameStore.getState().lateralGripOverrides,
        accelerationOverrides: useGameStore.getState().accelerationOverrides,
        maxSpeedOverrides: useGameStore.getState().maxSpeedOverrides,
      })

      if (result.error || !result.rootHash) {
        emitToast('bid-lose', 'Could not save progress', result.error || 'Unknown error')
        setZgStorage({
          checkedAt: Date.now(),
          lastError: result.error || 'Unknown error',
        })
        return
      }

      emitToast('milestone', 'Progress saved', '0G Storage snapshot updated')
      setZgStorage({
        checkedAt: Date.now(),
        available: true,
        configured: true,
        lastError: undefined,
        lastUpload: {
          key: 'global',
          rootHash: result.rootHash,
          txHash: result.txHash,
          timestamp: Date.now(),
        },
      })
    } catch (err) {
      const msg = (err as Error).message
      emitToast('bid-lose', 'Could not save progress', msg)
      setZgStorage({ checkedAt: Date.now(), lastError: msg })
    } finally {
      setIsSavingSnapshot(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div className={`fixed top-0 right-0 h-full w-80 sm:w-96 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 z-50 transition-transform duration-300 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
              <span className="text-xl">🦞</span>
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider">Control Center</h2>
              <p className="text-[10px] text-white/40">Customize your experience</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/50 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Wallet Connect Section - When Disconnected */}
        {!address && (
          <div className="px-4 py-3 border-b border-white/10">
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="text-[10px] font-black uppercase text-sky-300">Connect Wallet</span>
              </div>
              <p className="text-[9px] text-white/50 mb-2">Link your wallet to join the queue and drive vehicles.</p>
              <ConnectWallet 
                source="control_panel"
                buttonClassName="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-black rounded-lg shadow transition-all flex items-center justify-center gap-2"
              />
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="px-4 pt-4">
          <div className="flex gap-1 bg-black/20 p-1 rounded-xl">
            {(['weather', 'vehicles', 'stats'] as const).map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-sky-900 shadow-xl' : 'text-white/40 hover:text-white'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-y-auto scrollbar-hide">
          {activeTab === 'weather' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="rounded-2xl border border-sky-400/15 bg-sky-500/5 px-3 py-2 text-[10px] text-sky-100/80">
                {playerStrategy ? `${playerStrategy.icon} ${playerStrategy.label}` : 'No strategy set'} recommends <span className="font-black uppercase tracking-widest text-sky-200">{recommendedWeatherPreset}</span> for the current loadout.
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['custom', 'stormy', 'sunset', 'candy', 'cosmic'] as const).map((p) => (
                  <button key={p} onClick={() => updateConfig('preset', p)} className={`px-2 py-3 rounded-xl text-[10px] uppercase font-bold border transition-all ${cloudConfig.preset === p ? 'bg-white text-sky-900' : p === recommendedWeatherPreset ? 'border-sky-400/40 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                    <span className="flex items-center justify-center gap-1">
                      {p}
                      {p === recommendedWeatherPreset && <span className="rounded-full border border-sky-300/25 bg-sky-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-sky-200">bias</span>}
                    </span>
                  </button>
                ))}
              </div>
              
              {/* Strategy & Abilities (CONSOLIDATION: merged from PlayerStrategyPanel) */}
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/50">Strategy</div>
                <div className="mt-2 mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-white/55">
                  Current: {playerStrategy ? `${playerStrategy.icon} ${playerStrategy.label}` : 'Unset'}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {MEME_MARKET_STRATEGIES.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handleStrategySelect(preset)}
                      className={`px-3 py-2 rounded-lg border transition-all text-left ${
                        playerSession?.strategyId === preset.id
                          ? 'bg-sky-500/20 border-sky-400/40'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <span className="text-sm">{preset.icon}</span>
                      <div className="text-[9px] font-bold text-white">{preset.label}</div>
                      <div className="text-[7px] text-white/40">Agg: {Math.round(preset.aggressive * 100)}%</div>
                    </button>
                  ))}
                </div>

                <div className="border-t border-white/10 pt-3 mt-3">
                  <div className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-2">Manual Bid Override</div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={manualBidOverride ?? ''}
                      onChange={(e) => setManualBidOverride(Number(e.target.value))}
                      placeholder="0.000"
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white font-mono"
                    />
                    <button
                      onClick={handleManualBid}
                      className="px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-300 text-[9px] font-bold uppercase"
                    >
                      Bid
                    </button>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-3 mt-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-[8px] font-black uppercase tracking-widest text-white/30">MemeMarket Loadout</div>
                    <span className="text-[7px] font-bold uppercase tracking-widest text-white/25">Live abilities</span>
                  </div>
                  <div className="space-y-2">
                    {abilityStatus.map((ability) => {
                      const isFloodDrain = ability.key === 'flood_drain'
                      const isActive = ability.remainingSeconds > 0
                      const canUseDrain = isFloodDrain && ability.charges > 0
                      return (
                        <div key={ability.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-[9px] font-bold text-white">{ability.label}</div>
                              <div className="text-[7px] text-white/40">{ability.source} · Token #{ability.id}</div>
                            </div>
                            {isFloodDrain ? (
                              <button
                                onClick={handleUseFloodDrain}
                                disabled={!canUseDrain}
                                className={`rounded-md px-2 py-1 text-[8px] font-black uppercase tracking-wider transition-colors ${
                                  canUseDrain
                                    ? 'border border-sky-400/25 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20'
                                    : 'border border-white/10 bg-white/5 text-white/30 cursor-not-allowed'
                                }`}
                              >
                                Use Drain
                              </button>
                            ) : (
                              <span className={`rounded-md border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${
                                isActive
                                  ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
                                  : 'border-white/10 bg-white/5 text-white/40'
                              }`}>
                                {isActive ? `${ability.remainingSeconds}s left` : 'Ready'}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[8px] text-white/45">
                            {isFloodDrain
                              ? `${ability.charges} charge${ability.charges === 1 ? '' : 's'} available`
                              : isActive
                                ? `${ability.remainingSeconds}s remaining`
                                : 'Passive until minted'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className={`space-y-5 ${cloudConfig.preset !== 'custom' ? 'opacity-30 pointer-events-none' : ''}`}>
                <div className="space-y-2">
                  <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">Intensity <span className="text-sky-400">{spawnRate}</span></label>
                  <input type="range" min="0.2" max="10" step="0.2" value={spawnRate} onChange={(e) => setSpawnRate(Number(e.target.value))} className="w-full accent-sky-400" />
                </div>
                <div className="space-y-2">
                  <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">Density <span className="text-sky-400">{cloudConfig.volume}</span></label>
                  <input type="range" min="1" max="20" value={cloudConfig.volume} onChange={(e) => updateConfig('volume', Number(e.target.value))} className="w-full accent-sky-400" />
                </div>
                <div className="space-y-2">
                  <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">Puffiness <span className="text-sky-400">{cloudConfig.growth}</span></label>
                  <input type="range" min="1" max="10" value={cloudConfig.growth} onChange={(e) => updateConfig('growth', Number(e.target.value))} className="w-full accent-sky-400" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-2 block">Sky Tints</label>
                  <div className="flex gap-2 flex-wrap">
                    {['#ffffff', '#ffcccc', '#ccffcc', '#2c3e50'].map(c => (
                      <button key={c} onClick={() => updateConfig('color', c)} className={`w-10 h-10 rounded-full border-2 transition-all ${cloudConfig.color === c ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-80'}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'vehicles' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <div className="rounded-2xl border border-sky-400/15 bg-sky-500/5 px-3 py-2 text-[10px] text-sky-100/80">
                {playerStrategy ? `${playerStrategy.icon} ${playerStrategy.label}` : 'No strategy set'} prefers <span className="font-black uppercase tracking-widest text-sky-200">{recommendedVehicle}</span> for this session.
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Handling Mode</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'arcade', label: 'Arcade' },
                    { key: 'offroad', label: 'Offroad' },
                    { key: 'chaos', label: 'Chaos' },
                  ] as const).map((mode) => (
                    <button
                      key={mode.key}
                      onClick={() => setHandlingMode(mode.key)}
                      className={`px-2 py-2 rounded-lg text-[9px] uppercase font-black transition-all border ${
                        handlingMode === mode.key
                          ? 'bg-white text-sky-900 border-white'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced Tuning: collapsed by default, expands on V-key pulse or click */}
              <div className="mt-2">
                <button
                  onClick={() => setShowAdvancedTuning(!showAdvancedTuning)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all"
                >
                  <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/50">
                    <span className="text-sky-400">⚙</span> Advanced Tuning
                    {(() => {
                      const count = Object.keys(steerRetentionOverrides).length + Object.keys(lateralGripOverrides).length + Object.keys(accelerationOverrides).length + Object.keys(maxSpeedOverrides).length
                      return count > 0 && <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-sky-200">{count}</span>
                    })()}
                  </span>
                  <span className={`text-white/30 transition-transform duration-200 ${showAdvancedTuning ? 'rotate-180' : ''}`}>▾</span>
                </button>

                {showAdvancedTuning && (
                  <div className={`mt-2 space-y-3 transition-all duration-700 ${sliderGlow ? 'rounded-xl p-2 animate-glow-pulse' : ''}`}>
                    {/* Steer Retention */}
                    <div className="space-y-3">
                      <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Steer Retention</p>
                      <p className="text-[9px] text-white/40 -mt-2">Higher = more steering authority at high speed</p>
                      {VEHICLE_PROFILES.map(({ profile, label, icon, stats: vehicleStats }) => {
                        const def = vehicleStats.steerRetention
                        const value = steerRetentionOverrides[profile] ?? def
                        const isModified = steerRetentionOverrides[profile] !== undefined
                        return (
                          <div key={profile} className="space-y-1">
                            <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">
                              <span className="flex items-center gap-1">
                                {icon} {label}
                                {isModified && <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-sky-200">custom</span>}
                              </span>
                              <span className="text-sky-400">{value.toFixed(2)}</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <input type="range" min="0.2" max="3.0" step="0.05" value={value} onChange={(e) => setSteerRetentionOverride(profile, Number(e.target.value))} className="flex-1 accent-sky-400" />
                              {isModified && <button onClick={() => clearSteerRetentionOverride(profile)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-white/50 hover:bg-white/10 hover:text-white" title="Reset to default">Reset</button>}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Lateral Grip */}
                    <div className="space-y-3">
                      <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Lateral Grip</p>
                      <p className="text-[9px] text-white/40 -mt-2">Higher = more traction, less drifting</p>
                      {VEHICLE_PROFILES.map(({ profile, label, icon, stats: vehicleStats }) => {
                        const def = vehicleStats.lateralGrip
                        const value = lateralGripOverrides[profile] ?? def
                        const isModified = lateralGripOverrides[profile] !== undefined
                        return (
                          <div key={profile} className="space-y-1">
                            <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">
                              <span className="flex items-center gap-1">
                                {icon} {label}
                                {isModified && <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-sky-200">custom</span>}
                              </span>
                              <span className="text-sky-400">{value.toFixed(2)}</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <input type="range" min="0.1" max="2.0" step="0.05" value={value} onChange={(e) => setLateralGripOverride(profile, Number(e.target.value))} className="flex-1 accent-sky-400" />
                              {isModified && <button onClick={() => clearLateralGripOverride(profile)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-white/50 hover:bg-white/10 hover:text-white" title="Reset to default">Reset</button>}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Max Speed */}
                    <div className="space-y-3">
                      <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Max Speed</p>
                      <p className="text-[9px] text-white/40 -mt-2">Higher = faster top speed</p>
                      {VEHICLE_PROFILES.map(({ profile, label, icon, stats: vehicleStats }) => {
                        const def = vehicleStats.maxSpeed
                        const value = maxSpeedOverrides[profile] ?? def
                        const isModified = maxSpeedOverrides[profile] !== undefined
                        return (
                          <div key={profile} className="space-y-1">
                            <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">
                              <span className="flex items-center gap-1">
                                {icon} {label}
                                {isModified && <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-sky-200">custom</span>}
                              </span>
                              <span className="text-sky-400">{value.toFixed(0)}</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <input type="range" min="10" max="150" step="5" value={value} onChange={(e) => setMaxSpeedOverride(profile, Number(e.target.value))} className="flex-1 accent-sky-400" />
                              {isModified && <button onClick={() => clearMaxSpeedOverride(profile)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-white/50 hover:bg-white/10 hover:text-white" title="Reset to default">Reset</button>}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Acceleration */}
                    <div className="space-y-3">
                      <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Acceleration</p>
                      <p className="text-[9px] text-white/40 -mt-2">Higher = faster pickup</p>
                      {VEHICLE_PROFILES.map(({ profile, label, icon, stats: vehicleStats }) => {
                        const def = vehicleStats.acceleration
                        const value = accelerationOverrides[profile] ?? def
                        const isModified = accelerationOverrides[profile] !== undefined
                        return (
                          <div key={profile} className="space-y-1">
                            <label className="flex justify-between text-[10px] font-black text-white/50 uppercase tracking-widest">
                              <span className="flex items-center gap-1">
                                {icon} {label}
                                {isModified && <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-sky-200">custom</span>}
                              </span>
                              <span className="text-sky-400">{value.toFixed(0)}</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <input type="range" min="50" max="1500" step="25" value={value} onChange={(e) => setAccelerationOverride(profile, Number(e.target.value))} className="flex-1 accent-sky-400" />
                              {isModified && <button onClick={() => clearAccelerationOverride(profile)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-white/50 hover:bg-white/10 hover:text-white" title="Reset to default">Reset</button>}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {(() => {
                      const hasAnyOverride = Object.keys(steerRetentionOverrides).length > 0
                        || Object.keys(lateralGripOverrides).length > 0
                        || Object.keys(accelerationOverrides).length > 0
                        || Object.keys(maxSpeedOverrides).length > 0
                      return hasAnyOverride && (
                        <button
                          onClick={() => clearAllHandlingOverrides()}
                          className="w-full rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-red-200 hover:bg-red-500/20 hover:text-red-100 transition-all"
                        >
                          Reset all tuning to defaults
                        </button>
                      )
                    })()}
                  </div>
                )}
              </div>

              <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">Select Platform</p>
              <div className="grid grid-cols-1 gap-2">
                {(['truck', 'tank', 'monster', 'speedster'] as VehicleType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setPlayerVehicle(type)}
                    className={`flex justify-between items-center px-4 py-4 rounded-xl text-[11px] uppercase font-black transition-all border ${
                      playerVehicle === type ? 'bg-white text-sky-900 border-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {type}
                      {type === recommendedVehicle && <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2 py-0.5 text-[8px] uppercase tracking-widest text-sky-200">bias</span>}
                    </span>
                    {playerVehicle === type && <span className="text-[8px] bg-sky-900/10 px-2 py-0.5 rounded-full">Active</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="animate-in fade-in slide-in-from-right-4 h-full flex flex-col">
              <Leaderboard />

              {/* Network & Persistence (user-facing transparency) */}
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/50">Network</div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="text-sm font-black text-white">{activeChain.name}</div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
                        chainHasContracts
                          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                          : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                      }`}>
                        {chainHasContracts ? 'Contracts Live' : 'No Contracts'}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white/60">
                        chainId {chainId}
                      </span>
                    </div>
                  </div>

                  {!chainHasContracts && (
                    <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-200">
                      ⚠️ No contracts deployed on this chain. Switch to{' '}
                      {Object.keys(CONTRACT_ADDRESSES).map(id => {
                        const c = supportedChains.find(ch => ch.id === Number(id))
                        return c?.name ?? `Chain ${id}`
                      }).join(' or ')}.
                    </div>
                  )}

                  <div className="mt-3 space-y-2 text-[10px] text-white/70">
                    {([
                      ['WeatherAuction', contracts.weatherAuction],
                      ['VehicleRent', contracts.vehicleRent],
                      ['MemeMarket', contracts.memeMarket],
                    ] as const).map(([label, addr]) => (
                      <div key={label} className="flex items-center justify-between gap-2">
                        <span className="text-white/45 font-black uppercase tracking-widest">{label}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copy(`${label} address`, addr)}
                            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-white/80 hover:bg-white/10"
                            title="Copy"
                          >
                            {addr === ZERO_ADDR ? 'Not deployed' : shorten(addr)}
                          </button>
                          {contractLink(addr) && (
                            <a
                              href={contractLink(addr)!}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-sky-400/20 bg-sky-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-sky-200 hover:bg-sky-500/20"
                            >
                              Explorer
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/50">Persistence</div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-sm font-black text-white">0G Storage</div>
                    <span
                      className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
                        zgStorage.available && zgStorage.configured
                          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                          : zgStorage.available === false
                          ? 'border-red-400/30 bg-red-500/10 text-red-200'
                          : 'border-white/10 bg-white/5 text-white/60'
                      }`}
                    >
                      {zgStorage.available && zgStorage.configured
                        ? 'Live'
                        : zgStorage.available === false
                        ? 'Offline'
                        : 'Checking…'}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      onClick={saveSnapshotNow}
                      disabled={!zgStorage.available || !zgStorage.configured || isSavingSnapshot}
                      className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest border transition-all ${
                        !zgStorage.available || !zgStorage.configured || isSavingSnapshot
                          ? 'border-white/10 bg-white/5 text-white/30 cursor-not-allowed'
                          : 'border-sky-400/25 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20'
                      }`}
                      title="Save your current progress to decentralized storage"
                    >
                      {isSavingSnapshot ? 'Saving…' : 'Save now'}
                    </button>
                    <span className="text-[10px] text-white/40">
                      {zgStorage.lastUpload?.timestamp
                        ? `Last saved ${Math.max(1, Math.round((Date.now() - zgStorage.lastUpload.timestamp) / 1000))}s ago`
                        : 'Cloud save keeps your progress across sessions'}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2 text-[10px] text-white/65">
                    {zgStorage.lastUpload?.rootHash ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white/45 font-black uppercase tracking-widest">Last snapshot</span>
                        <button
                          onClick={() => copy('rootHash', zgStorage.lastUpload?.rootHash)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-white/80 hover:bg-white/10"
                          title="Copy rootHash"
                        >
                          {shorten(zgStorage.lastUpload.rootHash, 8, 6)}
                        </button>
                      </div>
                    ) : (
                      <div className="text-white/45">No decentralized snapshot yet (will appear after the first sync).</div>
                    )}

                    {zgStorage.lastUpload?.txHash && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white/45 font-black uppercase tracking-widest">Upload tx</span>
                        <button
                          onClick={() => copy('txHash', zgStorage.lastUpload?.txHash)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-white/80 hover:bg-white/10"
                          title="Copy txHash"
                        >
                          {shorten(zgStorage.lastUpload.txHash, 10, 6)}
                        </button>
                      </div>
                    )}

                    {zgStorage.lastError && (
                      <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[10px] text-red-200">
                        {zgStorage.lastError}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/50">Transactions</div>
                  <div className="mt-3 space-y-2 text-[10px] text-white/70">
                    {recentTransactions.length === 0 ? (
                      <div className="text-white/45">No recent on-chain transactions yet.</div>
                    ) : (
                      recentTransactions.map((tx) => (
                        <div key={tx.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-black uppercase tracking-widest text-white/80">{tx.type.replace('_', ' ')}</span>
                            <span className={`text-[9px] font-black uppercase tracking-wider ${getStatusColor(tx.status)}`}>
                              {formatTransactionStatus(tx.status)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2 text-white/50">
                            <span>{tx.amount.toFixed(3)} ETH</span>
                            {tx.hash ? (
                              transactionLink(tx.hash) ? (
                                <a href={transactionLink(tx.hash)!} target="_blank" rel="noreferrer" className="text-sky-200 hover:text-sky-100">
                                  View tx
                                </a>
                              ) : (
                                <span className="font-mono">{shorten(tx.hash, 8, 6)}</span>
                              )
                            ) : (
                              <span className="font-mono">pending</span>
                            )}
                          </div>
                          {tx.error && <div className="mt-1 text-red-200">{tx.error}</div>}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/50">MemeMarket</div>
                  {!isMemeMarketConfigured ? (
                    <div className="mt-3 text-[10px] text-white/45">Configure `NEXT_PUBLIC_MEME_MARKET_ADDRESS` to enable ability minting.</div>
                  ) : (
                    <>
                      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-white/70">
                        <span className="font-black uppercase tracking-widest text-white/80">Owner</span>
                        <span className="font-mono text-white/55">{memeMarketOwner ? shorten(memeMarketOwner as string) : 'Checking…'}</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {marketBalances.map((ability) => {
                          const isReady = canMintAbilities && Boolean(address)
                          return (
                            <div key={ability.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-[10px] font-black uppercase tracking-widest text-white/80">{ability.label}</div>
                                  <div className="text-[9px] text-white/45">{ability.source} · Token #{ability.id}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white/70">
                                    {ability.balance} owned
                                  </span>
                                  <button
                                    onClick={() => mintAbility(ability.id, ability.label)}
                                    disabled={!isReady}
                                    className={`rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wider transition-colors ${
                                      isReady
                                        ? 'border border-sky-400/25 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20'
                                        : 'border border-white/10 bg-white/5 text-white/30 cursor-not-allowed'
                                    }`}
                                  >
                                    Mint
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-2 text-[10px] text-white/45">
                        {canMintAbilities ? 'Connected wallet can mint abilities on-chain.' : 'Only the contract owner can mint abilities.'}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black/20">
           <div className="flex justify-between items-center opacity-30">
              <span className="text-[8px] font-black tracking-tighter italic">CLAWDY</span>
              <span className="text-[8px] font-black tracking-widest">0G CHAIN SETTLED</span>
           </div>
        </div>
      </div>
    </>
  )
}
