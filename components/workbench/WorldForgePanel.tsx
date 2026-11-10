'use client'

import { useState } from 'react'
import { Mountain, RotateCcw, Sparkles } from 'lucide-react'
import type { WorldSpec, WorldgenCertificate } from '../../services/arenaWorldgen'
import { WORLD_PRESETS } from '../../services/arenaWorldIntent'
import styles from './WorldForgePanel.module.css'

/**
 * Track H — the forge front door.
 *
 * The first screen is a prompt field over the live world, not a Play button:
 * the player describes a terrain (or picks a preset), the resolver builds and
 * certifies it, and racing it is act two. The panel is props-driven — the
 * translator request (`requestWorldSpec` in services/arenaWorldIntent.ts),
 * the spec→session swap (`loadGeneratedCourse`) and the certificate all live
 * in ArenaScene's entry flow.
 */

export const WORLD_DESCRIPTION_MAX = 280

/** What the receipts strip shows about the current world. */
export interface WorldReceipt {
  kind: 'authored' | 'generated'
  name: string
  certificate?: {
    stationsGrounded: { ok: number; total: number }
    routesCleared: { ok: number; total: number }
    repairsApplied: number
    worldDigest: string
    msElapsed: number
  }
}

/** Track F's certificate, reshaped for the strip's ok/total segments. */
export function worldReceiptCertificate(cert: WorldgenCertificate): NonNullable<WorldReceipt['certificate']> {
  return {
    stationsGrounded: { ok: cert.stationsGrounded, total: cert.stationsTotal },
    routesCleared: { ok: cert.routesCleared, total: cert.routesTotal },
    repairsApplied: cert.repairsApplied,
    worldDigest: cert.worldDigest,
    msElapsed: cert.msElapsed,
  }
}

export interface WorldForgeProps {
  open: boolean
  busy: boolean
  /** Honest status/failure line — deterministic fallbacks, never a dead end. */
  status: string | null
  /** Label for the dismiss path — 'race the authored basin' vs 'close'. */
  dismissLabel: string
  onDescribe: (text: string) => void
  onPreset: (spec: WorldSpec) => void
  onDismiss: () => void
}

export function WorldForgePanel({ open, busy, status, dismissLabel, onDescribe, onPreset, onDismiss }: WorldForgeProps) {
  const [text, setText] = useState('')
  if (!open) return null

  const submit = () => {
    const description = text.trim()
    if (!description || busy) return
    onDescribe(description)
  }

  return (
    <section className={styles.forge} aria-label="Describe a world" data-busy={busy}>
      <p className={styles.eyebrow}>DESCRIBE A WORLD</p>
      <h2 className={styles.heading}>Say it. Watch it get built. Race it.</h2>
      <p className={styles.lede}>
        A sentence becomes terrain — heightfield, flood line and paint — and every generated world
        carries a machine-checked playability certificate before it can be raced.
      </p>

      <div className={styles.promptRow}>
        <input
          className={styles.prompt}
          type="text"
          value={text}
          maxLength={WORLD_DESCRIPTION_MAX}
          disabled={busy}
          placeholder="a flooded salt flat under a copper sky"
          aria-label="Describe the world to generate"
          onChange={event => setText(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') submit() }}
        />
        <button
          type="button"
          className={styles.generate}
          disabled={busy || text.trim().length === 0}
          onClick={submit}
        >
          <Sparkles size={14} />
          {busy ? 'Building…' : 'Build world'}
        </button>
      </div>

      <div className={styles.presets} role="group" aria-label="Preset worlds">
        <span className={styles.presetsLabel}>or pick one</span>
        {WORLD_PRESETS.map(preset => (
          <button
            key={preset.spec.scenarioName}
            type="button"
            className={styles.preset}
            disabled={busy}
            title={preset.description}
            onClick={() => onPreset(preset.spec)}
          >
            <Mountain size={13} />
            {preset.spec.scenarioName}
          </button>
        ))}
      </div>

      {status && <p className={styles.status} role="status">{status}</p>}

      <button type="button" className={styles.skip} disabled={busy} onClick={onDismiss}>
        <RotateCcw size={12} />
        {dismissLabel}
      </button>
    </section>
  )
}
