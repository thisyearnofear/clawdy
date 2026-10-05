'use client'

import { useAction, useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { useArenaStore } from '../../services/arenaStore'
import { exportCheckpointJson } from '../../services/checkpointStorage'
import { BUILD_STORAGE_KEY, parseBuild } from '../../services/buildBudget'
import styles from '../environment/ArenaScene.module.css'

const MESSAGES: Record<string, string> = {
  'rate-limited': 'One verified run per minute. Try again shortly.',
  'ladder-not-configured': 'The ladder is not configured on this deployment yet.',
  'sign-in-required': 'Sign in to submit.',
  'unknown-brain': 'Publish your brain to the league first.',
  'unknown-opponent': 'That brain is no longer available.',
  'cannot-challenge-self': 'You cannot challenge your own brain.',
  'opponent-not-listed': 'That brain is not accepting challenges.',
  'mode-mismatch': 'Brains can only race within the same mode.',
}

function describeError(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === 'string') return MESSAGES[error.data] ?? error.data
  return 'Request failed. Try again.'
}

function replayHref(shareId: string): string {
  return `${window.location.origin}${window.location.pathname}?replay=${encodeURIComponent(shareId)}`
}

export function LadderDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null)
  const checkpoint = useArenaStore(state => state.activeCheckpoint)
  const board = useQuery(api.ladder.top, open ? { limit: 10 } : 'skip')
  const mine = useQuery(api.ladder.mine, open ? {} : 'skip')
  const chassisBoard = useQuery(api.league.topByChassis, open ? {} : 'skip')
  const brains = useQuery(api.league.mine, open ? {} : 'skip')
  const pool = useQuery(api.league.pool, open ? {} : 'skip')
  const history = useQuery(api.league.challenges, open ? {} : 'skip')
  const submit = useAction(api.ladderRun.submit)
  const publish = useAction(api.leagueRun.publish)
  const challenge = useAction(api.leagueRun.challenge)
  const setListed = useMutation(api.league.setListed)
  const [status, setStatus] = useState<{ kind: 'idle' | 'running' | 'done' | 'error'; text?: string }>({ kind: 'idle' })
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const currentBuild = () => parseBuild(window.localStorage.getItem(BUILD_STORAGE_KEY))

  const run = async () => {
    setStatus({ kind: 'running' })
    try {
      const result = await submit({ checkpointJson: exportCheckpointJson(checkpoint), build: currentBuild() })
      setStatus({ kind: 'done', text: `Verified: ${result.score.toFixed(1)} points${result.improved ? ' (new best)' : ` (best ${result.best.toFixed(1)})`}.` })
    } catch (error) {
      setStatus({ kind: 'error', text: describeError(error) })
    }
  }

  // The brain's league id is its checkpoint id: republishing the same brain
  // updates it in place rather than stacking copies.
  const publishBrain = async () => {
    setBusy('publish')
    try {
      const result = await publish({ brainId: checkpoint.id, name: checkpoint.name, checkpointJson: exportCheckpointJson(checkpoint), build: currentBuild() })
      setStatus({ kind: 'done', text: result.replaced ? `"${checkpoint.name}" updated in the league.` : `"${checkpoint.name}" is listed in the league.` })
    } catch (error) {
      setStatus({ kind: 'error', text: describeError(error) })
    } finally {
      setBusy(null)
    }
  }

  const runChallenge = async (defenderBrain: Id<'brains'>, brainId: string) => {
    setBusy(defenderBrain)
    try {
      const result = await challenge({ brainId, defenderBrain })
      const outcome = result.winnerSide === null ? 'draw' : result.winnerSide === 'challenger' ? 'you win' : 'you lose'
      setStatus({ kind: 'done', text: `Challenge complete — ${outcome} (${result.banked.join('–')} banked). Replay: ${replayHref(result.shareId)}` })
    } catch (error) {
      setStatus({ kind: 'error', text: describeError(error) })
    } finally {
      setBusy(null)
    }
  }

  const challenger = brains?.find(brain => brain.brainId === checkpoint.id) ?? brains?.[0]

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
          <button type="button" className={styles.helpClose} onClick={() => void publishBrain()} disabled={busy === 'publish'}>
            {busy === 'publish' ? 'Publishing…' : 'Publish to league'}
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
        {chassisBoard && chassisBoard.length > 0 && (
          <>
            <h3 className={styles.helpHeading}>Best per chassis</h3>
            <ol className={styles.helpSteps}>
              {chassisBoard.map(entry => (
                <li key={entry.chassis}><strong>{entry.chassis}</strong> · {entry.displayName} · {entry.score.toFixed(1)} pts</li>
              ))}
            </ol>
          </>
        )}

        <h3 className={styles.helpHeading}>League</h3>
        <p className={styles.helpFooterNote}>
          Published brains race other players&rsquo; brains on the pinned arena. Both sides run server-side and the replay is shared by link.
        </p>
        <ol className={styles.helpSteps}>
          {brains === undefined && <li>Loading…</li>}
          {brains?.length === 0 && <li>No published brains yet — publish {checkpoint.name} above.</li>}
          {brains?.map(brain => (
            <li key={brain.brainId}>
              <strong>{brain.name}</strong> · rating {brain.rating.toFixed(0)} · {brain.matchesPlayed} match{brain.matchesPlayed === 1 ? '' : 'es'}
              {' '}
              <button
                type="button"
                className={styles.helpClose}
                onClick={() => void setListed({ brainId: brain.brainId, listed: !brain.listed })}
              >
                {brain.listed ? 'Unlist' : 'List'}
              </button>
            </li>
          ))}
        </ol>

        <h3 className={styles.helpHeading}>Challenge pool</h3>
        <ol className={styles.helpSteps}>
          {pool === undefined && <li>Loading…</li>}
          {pool?.length === 0 && <li>No listed opponents yet.</li>}
          {pool?.map(brain => (
            <li key={brain._id}>
              <strong>{brain.owner}</strong> · {brain.name} · rating {brain.rating.toFixed(0)}
              {' '}
              <button
                type="button"
                className={styles.helpClose}
                disabled={!challenger || busy === brain._id}
                title={challenger ? `Challenge with ${challenger.name}` : 'Publish a brain first'}
                onClick={() => challenger && void runChallenge(brain._id, challenger.brainId)}
              >
                {busy === brain._id ? 'Racing…' : 'Challenge'}
              </button>
            </li>
          ))}
        </ol>

        {history && history.length > 0 && (
          <>
            <h3 className={styles.helpHeading}>Recent challenges</h3>
            <ol className={styles.helpSteps}>
              {history.map(row => (
                <li key={row._id}>
                  {row.challengerName} vs {row.defenderName} · {row.status === 'failed' ? 'failed' : row.winnerSide === null ? 'draw' : row.winnerSide === row.side ? 'won' : 'lost'} · banked {row.banked.join('–')}
                  {row.shareId && <> · <a href={replayHref(row.shareId)}>replay</a></>}
                </li>
              ))}
            </ol>
          </>
        )}
      </aside>
    </div>
  )
}
