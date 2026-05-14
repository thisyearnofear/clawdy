import React, { useState, useEffect, useRef } from 'react'
import { agentProtocol } from '../../services/AgentProtocol'
import { isLocalPlayMode } from '../../services/runtimeConfig'

export function PerformanceStats() {
  const [visible, setVisible] = useState(isLocalPlayMode())
  const [fps, setFps] = useState(0)
  const [agents, setAgents] = useState(0)
  const framesRef = useRef(0)
  const lastTimeRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' && e.shiftKey) setVisible(v => !v)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!visible) return

    const tick = () => {
      framesRef.current += 1
      const now = performance.now()
      if (now - lastTimeRef.current >= 1000) {
        setFps(Math.round((framesRef.current * 1000) / (now - lastTimeRef.current)))
        framesRef.current = 0
        lastTimeRef.current = now
        setAgents(agentProtocol.getSessions().length)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [visible])

  if (!visible) return null

  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      left: '20px',
      padding: '10px',
      background: 'rgba(15, 23, 42, 0.8)',
      color: '#00ff88',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: '11px',
      pointerEvents: 'none',
      zIndex: 9999,
      borderRadius: '4px',
      borderLeft: '2px solid #00ff88',
      backdropFilter: 'blur(4px)',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    }}>
      <div style={{ fontWeight: 'bold', borderBottom: '1px solid rgba(0,255,136,0.2)', paddingBottom: '4px', marginBottom: '2px' }}>
        RUNTIME STATS
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
        <span>FPS</span>
        <span style={{ color: fps < 30 ? '#ef4444' : fps < 55 ? '#fbbf24' : '#00ff88' }}>{fps}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
        <span>AGENTS</span>
        <span>{agents}</span>
      </div>
      <div style={{ marginTop: '4px', fontSize: '9px', opacity: 0.6 }}>
        SHIFT+P TO TOGGLE
      </div>
    </div>
  )
}
