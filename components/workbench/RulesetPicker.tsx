'use client'

import { useId } from 'react'
import type { RulesetId } from '../../services/chassis'
import styles from '../environment/ArenaScene.module.css'

export function RulesetPicker({
  rulesetId,
  unlocked,
  canSkip = false,
  disabled = false,
  onChange,
  onSkip,
  onProve,
  proveSelected = false,
}: {
  rulesetId?: RulesetId
  unlocked: boolean
  canSkip?: boolean
  disabled?: boolean
  onChange: (next: RulesetId | undefined) => void
  onSkip: () => void
  /** Optional Prove door — held-out Match. When set, replaces the Season-0 radio. */
  onProve?: () => void
  proveSelected?: boolean
}) {
  const descriptionId = useId()
  const clashSelected = !proveSelected && rulesetId === 'skirmish'
  const otherSelected = !proveSelected && rulesetId === undefined
  return (
    <section aria-label="Ruleset" className={`${styles.buildScreen} ${styles.rulesetPicker}`}>
      <div role="radiogroup" aria-label="Play door" aria-describedby={descriptionId} className={styles.buildChassisRow}>
        <button type="button" role="radio" aria-checked={clashSelected}
          className={styles.chassisPicker} data-selected={clashSelected}
          disabled={disabled || !unlocked} onClick={() => onChange('skirmish')}>
          <strong>Clash</strong>
          <span>Unranked race. Each chassis has a signature perk.</span>
        </button>
        <button type="button" role="radio" aria-checked={proveSelected || (!onProve && otherSelected)}
          className={styles.chassisPicker} data-selected={proveSelected || (!onProve && otherSelected)}
          disabled={disabled} onClick={() => (onProve ? onProve() : onChange(undefined))}>
          <strong>Prove</strong>
          <span>{onProve ? 'Held-out Match. Coaching locked.' : 'Season 0 board — coaching depth when you want it.'}</span>
        </button>
      </div>
      <p id={descriptionId} className={styles.buildReadout}>
        {proveSelected
          ? 'Prove uses a held-out layout and freezes coaching. Switch to Clash for an unranked race with chassis perks.'
          : rulesetId === 'skirmish'
          ? "Hauler carries 4 cargo. Raider steals a whole load when it wins a bump, up to its free space. Scout sees two route hops. Existing brains can play; Clash is not balanced (the Hauler leads). House brains for each chassis are bundled."
          : 'Clash is the game. Collect cores, bank at base and survive the flood. Open Clash for chassis perks.'}
      </p>
      {!unlocked && canSkip && (
        <button type="button" className={styles.primaryButton} disabled={disabled} onClick={onSkip}>
          Skip to Clash — race first
        </button>
      )}
      <p className={styles.buildReadout}>
        {disabled ? 'Reset to a fresh setup to change doors.' : unlocked || canSkip
          ? 'Player doors are Clash vs Prove only.'
          : 'Publish your first brain to unlock Clash permanently.'}
      </p>
    </section>
  )
}
