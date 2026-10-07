'use client'

import { useEffect, useRef, useState } from 'react'
import { formatFunnelLog, getFunnelEvents } from '../../services/funnelLog'
import { setFlavourZh, useFlavourZh } from '../../services/flavour'
import styles from '../environment/ArenaScene.module.css'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function HelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)
  const flavourZh = useFlavourZh()

  const copySessionLog = () => {
    const log = formatFunnelLog()
    void navigator.clipboard?.writeText(log || '(no events recorded yet)')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className={styles.helpScrim} role="presentation" onClick={onClose}>
      <aside
        ref={panelRef}
        className={styles.helpDrawer}
        role="dialog"
        aria-modal="true"
        aria-label="How Clawdy works"
        tabIndex={-1}
        onClick={event => event.stopPropagation()}
      >
        <div className={styles.helpHeader}>
          <h2>How to play</h2>
          <button type="button" className={styles.helpClose} onClick={onClose} aria-label="Close help">Close</button>
        </div>
        <ol className={styles.helpSteps}>
          <li><strong>Clash</strong> first — Skip to Clash for an unranked race with chassis perks, or Press Play. Player doors are Clash vs Prove only.</li>
          <li><strong>Call the next route</strong> once per unranked Clash: at a junction, pick the route it should take. Call <em>steers this race</em> for the rest of the run and queues an approved Train lesson. Scored Prove stays locked.</li>
          <li><strong>Teach</strong> in Replay: scrub to a decision, prefer a different legal route or action, draft the correction.</li>
          <li><strong>Open Lessons</strong> to approve what you taught, then <strong>Train</strong> a new brain and compare the two recorded runs.</li>
          <li>Switch to <strong>Prove</strong> to test it on a held-out Match with coaching locked.</li>
        </ol>
        <dl className={styles.helpFaq}>
          <div>
            <dt>What does coaching change?</dt>
            <dd>Navigation, legal actions, pickup and full-cargo return are shared controller rules. Coaching changes route preferences, target choices and supported interventions — nothing else.</dd>
          </div>
          <div>
            <dt>Clash vs Prove?</dt>
            <dd>Clash is the unranked race (chassis perks live; Call steers). Prove is the held-out Match where coaching freezes. Practice/Rush taxonomy stays internal.</dd>
          </div>
          <div>
            <dt>How do I train?</dt>
            <dd>Call a route mid-Clash, or Replay a decision → Prefer an alternative. Then open Lessons, Approve, and Train. Style “Trained brain” runs the new weights.</dd>
          </div>
          <div>
            <dt>Train did nothing?</dt>
            <dd>You need at least one approved lesson, and Style must be set to Trained brain after training.</dd>
          </div>
          <div>
            <dt>Name & look?</dt>
            <dd>Open “Champion setup” on your card while Ready. Saved in this browser.</dd>
          </div>
          <div>
            <dt>How do I save?</dt>
            <dd>Export JSON under Lessons → “Brains, storage &amp; sync”, or Save run for the recording. Cloud sync uses a guest key when Convex is on.</dd>
          </div>
        </dl>
        <label className={styles.helpFooterNote} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
          <input type="checkbox" checked={flavourZh} onChange={event => setFlavourZh(event.target.checked)} />
          Show Chinese proverbs beside some lines (off by default)
        </label>
        <div className={styles.helpFooter}>
          <button type="button" className={styles.helpClose} onClick={copySessionLog}>
            {copied ? 'Copied!' : 'Copy session log'}
          </button>
          <span className={styles.helpFooterNote}>
            Local-only funnel events ({getFunnelEvents().length}) — nothing leaves this browser.
          </span>
        </div>
      </aside>
    </div>
  )
}
