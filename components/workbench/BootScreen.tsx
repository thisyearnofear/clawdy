'use client'

import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import styles from '../environment/ArenaScene.module.css'

const BOOT_STAGES = [
  'Grounding the sandstone basin…',
  'Wiring routes and flood windows…',
  'Rolling two rovers onto the field…',
  'Almost there — Play unlocks when the world settles.',
] as const

export function BootScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (error) return
    const id = window.setInterval(() => {
      setStage(current => Math.min(current + 1, BOOT_STAGES.length - 1))
    }, 1400)
    return () => window.clearInterval(id)
  }, [error])

  return (
    <section className={styles.boot} aria-live="polite" data-error={Boolean(error)}>
      <p className={styles.eyebrow}>TRAIN YOUR CHAMPION</p>
      <h1>{error ? 'The course could not load.' : 'Preparing the proving ground.'}</h1>
      <p>{error ?? BOOT_STAGES[stage]}</p>
      {error ? (
        <button className={styles.primaryButton} onClick={onRetry}>
          Retry loading <RotateCcw size={16} />
        </button>
      ) : (
        <div className={styles.bootProgress} aria-hidden>
          <div className={styles.bootLine} data-stage={stage} />
          <ol className={styles.bootSteps}>
            <li data-done={stage >= 0}>World</li>
            <li data-done={stage >= 1}>Routes</li>
            <li data-done={stage >= 2}>Rovers</li>
            <li data-done={stage >= 3}>Ready</li>
          </ol>
        </div>
      )}
      <small>Play → Replay → Coach · No wallet · Practice first</small>
    </section>
  )
}
