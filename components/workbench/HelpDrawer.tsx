'use client'

import { useEffect, useRef, useState } from 'react'
import { formatFunnelLog, getFunnelEvents } from '../../services/funnelLog'
import styles from '../environment/ArenaScene.module.css'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function HelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)

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
          <li><strong>Watch</strong> a Practice round — your rover races the house rival.</li>
          <li><strong>Call the next route</strong> once per Practice run: at a junction, pick the route it should take. Your call is saved as an approved lesson — it does not steer the current race.</li>
          <li><strong>Teach</strong> in Replay: scrub to a decision, prefer a different legal route or action, draft the correction.</li>
          <li><strong>Approve</strong> fixes and <strong>Train</strong> a new brain, then compare the two recorded runs.</li>
          <li>Switch to <strong>Match</strong> to test it with coaching locked.</li>
        </ol>
        <dl className={styles.helpFaq}>
          <div>
            <dt>What does coaching change?</dt>
            <dd>Navigation, legal actions, pickup and full-cargo return are shared controller rules. Coaching changes route preferences, target choices and supported interventions — nothing else.</dd>
          </div>
          <div>
            <dt>Practice vs Match?</dt>
            <dd>Practice is for teaching. Match uses a held-out layout and freezes coaching.</dd>
          </div>
          <div>
            <dt>How do I train?</dt>
            <dd>Replay a decision → Prefer an alternative → Draft correction → Approve → Train. Style “Trained brain” runs the new weights.</dd>
          </div>
          <div>
            <dt>Train did nothing?</dt>
            <dd>You need at least one approved example, and Style must be set to Trained brain after training.</dd>
          </div>
          <div>
            <dt>Name & look?</dt>
            <dd>Open “Champion setup” on your card while Practice is Ready. Saved in this browser.</dd>
          </div>
          <div>
            <dt>How do I save?</dt>
            <dd>Export JSON under Coach → “Brains, storage &amp; sync”, or Save run for the recording. Cloud sync uses a guest key when Convex is on.</dd>
          </div>
        </dl>
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
