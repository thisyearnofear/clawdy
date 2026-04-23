'use client'

import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { Leaderboard } from './Leaderboard'
import { ConnectWallet } from './ConnectWallet'
import { CloudConfig } from '../environment/CloudManager'
import { VehicleType, CHAIN_NAME, WEATHER_AUCTION_ADDRESS, VEHICLE_RENT_ADDRESS } from '../../services/AgentProtocol'
import { useGameStore } from '../../services/gameStore'
import { primaryChain } from '../../services/web3Config'
import { emitToast } from './GameToasts'

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
  const handlingMode = useGameStore(s => s.handlingMode)
  const setHandlingMode = useGameStore(s => s.setHandlingMode)
  const zgStorage = useGameStore(s => s.zgStorage)
  const setZgStorage = useGameStore(s => s.setZgStorage)
  const sessions = useGameStore(s => s.sessions)
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false)

  const explorerBase = primaryChain.blockExplorers?.default.url

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
              <div className="grid grid-cols-2 gap-2">
                {(['custom', 'stormy', 'sunset', 'candy', 'cosmic'] as const).map((p) => (
                  <button key={p} onClick={() => updateConfig('preset', p)} className={`px-2 py-3 rounded-xl text-[10px] uppercase font-bold border transition-all ${cloudConfig.preset === p ? 'bg-white text-sky-900' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>{p}</button>
                ))}
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
                    <span>{type}</span>
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
                    <div className="text-sm font-black text-white">{CHAIN_NAME}</div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white/60">
                      chainId {primaryChain.id}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2 text-[10px] text-white/70">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white/45 font-black uppercase tracking-widest">WeatherAuction</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copy('WeatherAuction address', WEATHER_AUCTION_ADDRESS)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-white/80 hover:bg-white/10"
                          title="Copy"
                        >
                          {shorten(WEATHER_AUCTION_ADDRESS)}
                        </button>
                        {contractLink(WEATHER_AUCTION_ADDRESS) && (
                          <a
                            href={contractLink(WEATHER_AUCTION_ADDRESS)!}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-sky-400/20 bg-sky-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-sky-200 hover:bg-sky-500/20"
                          >
                            Explorer
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white/45 font-black uppercase tracking-widest">VehicleRent</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copy('VehicleRent address', VEHICLE_RENT_ADDRESS)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-white/80 hover:bg-white/10"
                          title="Copy"
                        >
                          {shorten(VEHICLE_RENT_ADDRESS)}
                        </button>
                        {contractLink(VEHICLE_RENT_ADDRESS) && (
                          <a
                            href={contractLink(VEHICLE_RENT_ADDRESS)!}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-sky-400/20 bg-sky-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-sky-200 hover:bg-sky-500/20"
                          >
                            Explorer
                          </a>
                        )}
                      </div>
                    </div>
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
