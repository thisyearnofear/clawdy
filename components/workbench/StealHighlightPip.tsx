'use client'

import { useEffect, useState } from 'react'
import type { StealClipResult } from '../../services/stealHighlightClip'
import type { StealStoryboard } from '../../services/stealHighlight'
import styles from '../environment/ArenaScene.module.css'

/**
 * Picture-in-picture overlay for a Raider full-load steal highlight.
 * Storyboard beats show immediately from recorded facts; clip is optional
 * and non-blocking. Presentation only — dismiss never affects score.
 */

export type StealHighlightPipProps = {
  storyboard: StealStoryboard
  clip: StealClipResult
  /** Auto-dismiss after this many ms (default 5200). */
  durationMs?: number
  onDismiss: () => void
}

export function StealHighlightPip({
  storyboard,
  clip,
  durationMs = 5200,
  onDismiss,
}: StealHighlightPipProps) {
  const [beatIndex, setBeatIndex] = useState(0)

  useEffect(() => {
    const dismissTimer = window.setTimeout(onDismiss, durationMs)
    return () => window.clearTimeout(dismissTimer)
  }, [durationMs, onDismiss])

  useEffect(() => {
    if (storyboard.beats.length <= 1) return
    const step = Math.max(600, Math.floor(durationMs / storyboard.beats.length) - 80)
    const timer = window.setInterval(() => {
      setBeatIndex(prev => Math.min(prev + 1, storyboard.beats.length - 1))
    }, step)
    return () => window.clearInterval(timer)
  }, [durationMs, storyboard.beats.length])

  const beat = storyboard.beats[beatIndex] ?? storyboard.beats[0]

  return (
    <aside
      className={styles.stealHighlightPip}
      role="status"
      aria-live="polite"
      aria-label="Full-load steal highlight"
      data-mode={clip.mode}
    >
      <div className={styles.stealHighlightStage}>
        {clip.videoUrl ? (
          <video
            className={styles.stealHighlightVideo}
            src={clip.videoUrl}
            poster={clip.posterUrl}
            autoPlay
            muted
            playsInline
            loop
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- data-URI stub poster
          <img className={styles.stealHighlightVideo} src={clip.posterUrl} alt="" />
        )}
        <div className={styles.stealHighlightCaption}>
          <strong>{storyboard.title}</strong>
          <span>{storyboard.subtitle}</span>
          {beat && (
            <em>
              {beat.label}: {beat.line}
            </em>
          )}
          <small>{clip.label}</small>
        </div>
      </div>
      <button type="button" className={styles.stealHighlightDismiss} onClick={onDismiss} aria-label="Dismiss steal highlight">
        Dismiss
      </button>
    </aside>
  )
}
