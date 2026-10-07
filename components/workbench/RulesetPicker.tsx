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
}: {
  rulesetId?: RulesetId
  unlocked: boolean
  canSkip?: boolean
  disabled?: boolean
  onChange: (next: RulesetId | undefined) => void
  onSkip: () => void
}) {
  const descriptionId = useId()
  return (
    <section aria-label="Ruleset" className={`${styles.buildScreen} ${styles.rulesetPicker}`}>
      <div role="radiogroup" aria-label="Ruleset" aria-describedby={descriptionId} className={styles.buildChassisRow}>
        <button type="button" role="radio" aria-checked={rulesetId === undefined}
          className={styles.chassisPicker} data-selected={rulesetId === undefined}
          disabled={disabled} onClick={() => onChange(undefined)}>
          <strong>Tutor</strong>
          <span>Optional depth. Coaching loop when you want it.</span>
        </button>
        <button type="button" role="radio" aria-checked={rulesetId === 'skirmish'}
          className={styles.chassisPicker} data-selected={rulesetId === 'skirmish'}
          disabled={disabled || !unlocked} onClick={() => onChange('skirmish')}>
          <strong>Clash</strong>
          <span>Unranked race. Each chassis has a signature perk.</span>
        </button>
      </div>
      <p id={descriptionId} className={styles.buildReadout}>
        {rulesetId === 'skirmish'
          ? "Hauler carries 4 cargo. Raider steals a whole load when it wins a bump, up to its free space. Scout sees two route hops. Existing brains can play; Clash is not balanced (the Hauler leads). House brains for each chassis are bundled."
          : 'Collect cores, bank at base and survive the flood. All chassis carry 3 cargo and see one route hop here.'}
      </p>
      {!unlocked && canSkip && (
        <button type="button" className={styles.primaryButton} disabled={disabled} onClick={onSkip}>
          Skip to Clash — race first
        </button>
      )}
      <p className={styles.buildReadout}>
        {disabled ? 'Reset to a fresh setup to change rulesets.' : unlocked || canSkip
          ? 'Tutor stays available whenever you want the coaching depth.'
          : 'Publish your first brain to unlock Clash permanently.'}
      </p>
    </section>
  )
}
