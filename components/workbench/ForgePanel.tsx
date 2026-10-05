'use client'

import { useAction, useConvexAuth, useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../convex/_generated/api'
import { CHASSIS_IDS, type ChassisId } from '../../services/chassis'
import { FORGE_PAINTS, type ForgePaint } from '../../services/forge'
import {
  FORGED_LOOK_KEY,
  STANDARD_LOOK,
  describeForgeError,
  forgeFormState,
  latestFailure,
  parseLookChoice,
  pickForgedLook,
  readyForges,
  type ForgeRow,
  type ForgedLook,
} from '../../services/forgeView'
import { useConvexClient } from '../ConvexClientProvider'
import styles from './ForgePanel.module.css'

function readChoice(): string {
  try {
    return parseLookChoice(window.localStorage.getItem(FORGED_LOOK_KEY))
  } catch {
    return 'auto'
  }
}

function ForgePanelInner({ onLookChange }: { onLookChange?: (look: ForgedLook | null) => void }) {
  const { isAuthenticated } = useConvexAuth()
  const rows = (useQuery(api.forge.mine, isAuthenticated ? {} : 'skip') ?? []) as ForgeRow[]
  const start = useAction(api.forge.start)
  const [chassis, setChassis] = useState<ChassisId>('hauler')
  const [paint, setPaint] = useState<ForgePaint>('moss')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Lazy initializer: this component only renders on the client behind the Convex gate.
  const [choice, setChoice] = useState<string>(() => (typeof window === 'undefined' ? 'auto' : readChoice()))

  const look = pickForgedLook(rows, choice)
  const lookKey = look ? `${look.forgeId}|${look.url}` : ''
  const onLookRef = useRef(onLookChange)
  useEffect(() => { onLookRef.current = onLookChange })
  useEffect(() => { onLookRef.current?.(look) }, [lookKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const form = forgeFormState({ signedIn: isAuthenticated, rows, submitting })
  const failure = latestFailure(rows)
  const ready = readyForges(rows)

  const choose = (next: string) => {
    setChoice(next)
    try { window.localStorage.setItem(FORGED_LOOK_KEY, next) } catch { /* private mode: the choice just will not persist */ }
  }

  const forge = async () => {
    if (!form.canForge) return
    setSubmitting(true)
    setError(null)
    try {
      await start({ chassis, paint })
      // A fresh forge becomes the look once it is ready, unless the player pinned another.
      if (choice !== STANDARD_LOOK) choose('auto')
    } catch (caught) {
      setError(describeForgeError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className={styles.forge} aria-label="Forge your champion">
      <h3 className={styles.heading}>Forge your champion</h3>
      <p className={styles.lede}>Build a one-of-a-kind body for your champion. It looks different; it does not change how it drives.</p>

      <fieldset className={styles.group}>
        <legend>Chassis</legend>
        <div className={styles.choices}>
          {CHASSIS_IDS.map(id => (
            <button key={id} type="button" className={styles.choice} aria-pressed={chassis === id} disabled={submitting} onClick={() => setChassis(id)}>{id}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>Paint</legend>
        <div className={styles.choices}>
          {FORGE_PAINTS.map(id => (
            <button key={id} type="button" className={styles.choice} aria-pressed={paint === id} disabled={submitting} onClick={() => setPaint(id)}>{id}</button>
          ))}
        </div>
      </fieldset>

      <button type="button" className={styles.forgeButton} disabled={!form.canForge} onClick={forge}>
        {submitting ? 'Forging…' : 'Forge'}
      </button>
      {form.reason && <p className={styles.note} role="status">{form.reason}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!error && failure?.error && <p className={styles.error} role="alert">{failure.error}</p>}

      {rows.length > 0 && (
        <ul className={styles.list} aria-label="Your forges">
          {rows.map(row => (
            <li key={row.id} className={styles.row}>
              <span className={styles.rowLabel}>
                <strong>{row.chassis} · {row.paint}</strong>
                <span className={styles.rowStatus}>
                  {row.status === 'pending' ? 'Forging… this takes about a minute' : row.status === 'ready' ? 'Ready' : 'Did not finish'}
                </span>
              </span>
              {row.status === 'ready' && row.url && (
                <button type="button" className={styles.useButton} aria-pressed={look?.forgeId === row.id} onClick={() => choose(row.id)}>
                  {look?.forgeId === row.id ? 'In use' : 'Use this look'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {ready.length > 0 && (
        <button type="button" className={styles.useButton} aria-pressed={!look} onClick={() => choose(STANDARD_LOOK)}>
          {look ? 'Use the standard rover' : 'Standard rover in use'}
        </button>
      )}
    </section>
  )
}

/**
 * Mount this anywhere inside the app providers. It renders nothing when Convex is not
 * configured (offline play), so it is always safe to mount. `onLookChange` receives the
 * champion's forged look (or null) and should be passed to ArenaWorldView as `forgedLook`.
 */
export function ForgePanel({ onLookChange }: { onLookChange?: (look: ForgedLook | null) => void }) {
  const client = useConvexClient()
  if (!client) return null
  return <ForgePanelInner onLookChange={onLookChange} />
}
