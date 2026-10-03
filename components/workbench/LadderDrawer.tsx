'use client'

import { useAction, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../convex/_generated/api'
import { useArenaStore } from '../../services/arenaStore'
import { exportCheckpointJson } from '../../services/checkpointStorage'
import styles from '../environment/ArenaScene.module.css'

const MESSAGES: Record<string, string> = {
  'rate-limited': 'One verification per minute. Try again shortly.',
  'ladder-not-configured': 'The ladder is not configured on this deployment yet.',
  'sign-in-required': 'Sign in to submit.',
}

function describeError(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === 'string') return MESSAGES[error.data] ?? error.data
  return 'Verification failed. Try again.'
}

export function LadderDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null)
  const checkpoint = useArenaStore(state => state.activeCheckpoint)
  const board = useQuery(api.ladder.top, open ? { limit: 10 } : 'skip')
  const mine = useQuery(api.ladder.mine, open ? {} : 'skip')
  const submit = useAction(api.ladderRun.submit)
  const [status, setStatus] = useState<{ kind: 'idle' | 'running' | 'done' | 'error'; text?: string }>({ kind: 'idle' })

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const run = async () => {
    setStatus({ kind: 'running' })
    try {
      const result = await submit({ checkpointJson: exportCheckpointJson(checkpoint) })
      setStatus({ kind: 'done', text: `Verified: ${result.score.toFixed(1)} points${result.improved ? ' (new best)' : ` (best ${result.best.toFixed(1)})`}.` })
    } catch (error) {
      setStatus({ kind: 'error', text: describeError(error) })
    }
  }

  return (
    <div className={styles.helpScrim} role="presentation" onClick={onClose}>
      <aside ref={panelRef} className={styles.helpDrawer} role="dialog" aria-label="Ladder" tabIndex={-1} onClick={event => event.stopPropagation()}>
        <div className={styles.helpHeader}>
          <h2>Ladder</h2>
          <button type="button" className={styles.helpClose} onClick={onClose} aria-label="Close ladder">Close</button>
        </div>
        <p className={styles.helpFooterNote}>
          The server replays your brain on fresh hidden layouts against every house bot. Scores come from that replay, never from your browser.
        </p>
        <div className={styles.helpFooter}>
          <button type="button" className={styles.helpClose} onClick={() => void run()} disabled={status.kind === 'running'}>
            {status.kind === 'running' ? 'Verifying…' : `Submit ${checkpoint.name}`}
          </button>
          {status.text && <span className={styles.helpFooterNote} role="status">{status.text}</span>}
        </div>
        {mine && (
          <p className={styles.helpFooterNote}>Your best: {mine.score.toFixed(1)} · {mine.submissions} verified run{mine.submissions === 1 ? '' : 's'}</p>
        )}
        <ol className={styles.helpSteps}>
          {board === undefined && <li>Loading…</li>}
          {board?.length === 0 && <li>No verified entries yet. Be the first.</li>}
          {board?.map(entry => (
            <li key={`${entry.displayName}-${entry.weightsHash}`}>
              <strong>{entry.displayName}</strong> · {entry.score.toFixed(1)} pts · {entry.checkpointId}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  )
}
