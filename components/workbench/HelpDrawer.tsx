'use client'

import { useEffect, useRef } from 'react'
import styles from '../environment/ArenaScene.module.css'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function HelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null)

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
          <li><strong>Play</strong> a Practice round — watch your rover race the house rival.</li>
          <li><strong>Replay</strong> a bad turn, then open <strong>Coach</strong> and pick a focus chip.</li>
          <li><strong>Approve</strong> fixes and <strong>Train</strong> a new brain.</li>
          <li>Switch to <strong>Match</strong> to test it with coaching locked.</li>
        </ol>
        <dl className={styles.helpFaq}>
          <div>
            <dt>Practice vs Match?</dt>
            <dd>Practice is for teaching. Match uses a held-out layout and freezes coaching.</dd>
          </div>
          <div>
            <dt>How do I train?</dt>
            <dd>Coach panel → specialize chips or rules → Approve → Train. Style “Your trained brain” runs the new weights.</dd>
          </div>
          <div>
            <dt>Train did nothing?</dt>
            <dd>You need at least one approved example, and Style must be set to Your trained brain after training.</dd>
          </div>
          <div>
            <dt>Name & look?</dt>
            <dd>Edit under Your champion card while Practice is Ready. Saved in this browser.</dd>
          </div>
          <div>
            <dt>How do I save?</dt>
            <dd>Export JSON in Coach, or Save run for the recording. Cloud sync uses a guest key when Convex is on.</dd>
          </div>
        </dl>
      </aside>
    </div>
  )
}
