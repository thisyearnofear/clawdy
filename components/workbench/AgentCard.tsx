'use client'

import { ARENA_RULES, type ArenaAgentState } from '../../services/arenaEpisode'
import type { CollectorStrategy } from '../../services/arenaPolicy'
import { fingerprintLine } from '../../services/arenaEncounter'
import { SPECIALIZATION_FOCI, type FocusVector } from '../../services/coachingEngine'
import { CHAMPION_LOOKS, getChampionLook, type ChampionIdentity } from '../../services/championIdentity'
import styles from '../environment/ArenaScene.module.css'
import { describeArenaDecision, formatStat, POLICY_LABELS } from './readouts'

export function AgentCard({
  agent,
  policy,
  unlocked,
  onPolicy,
  championIdentity,
  onChampionIdentity,
  focusVector,
}: {
  agent: ArenaAgentState
  policy: CollectorStrategy
  unlocked: boolean
  onPolicy: (policy: CollectorStrategy) => void
  championIdentity?: ChampionIdentity
  onChampionIdentity?: (next: ChampionIdentity) => void
  focusVector?: FocusVector
}) {
  const champion = agent.id === 'champion'
  const look = championIdentity ? getChampionLook(championIdentity.lookId) : null
  const focus = focusVector ?? null
  return (
    <section className={styles.agentCard} data-entrant={agent.id} aria-label={champion ? 'Your champion' : 'House rival'}>
      <div className={styles.agentHeading}>
        <span
          className={styles.agentMark}
          aria-hidden="true"
          style={look ? { background: look.accent, color: '#233531' } : undefined}
        >
          {look?.mark ?? (champion ? 'C' : 'R')}
        </span>
        <div>
          <h3>{champion ? (championIdentity?.name ?? 'Your champion') : 'House rival'}</h3>
          <span>{POLICY_LABELS[policy]}</span>
        </div>
        <span className={styles.score}>{agent.banked}<small>banked</small></span>
      </div>
      {focus && (
        <div className={styles.fingerprint} title={fingerprintLine(focus)}>
          <span>{fingerprintLine(focus)}</span>
          <div className={styles.fingerprintBars} aria-hidden>
            {SPECIALIZATION_FOCI.map(key => (
              <i key={key} style={{ transform: `scaleY(${Math.max(0.08, focus[key])})` }} data-focus={key} />
            ))}
          </div>
        </div>
      )}
      {champion && championIdentity && onChampionIdentity && (
        <div className={styles.identityBlock}>
          <label className={styles.identityName}>
            <span>Name</span>
            <input
              type="text"
              maxLength={24}
              value={championIdentity.name}
              disabled={!unlocked}
              onChange={event => onChampionIdentity({ ...championIdentity, name: event.target.value })}
              onBlur={event => onChampionIdentity({ ...championIdentity, name: event.target.value.trim() || 'Champion' })}
              aria-label="Champion name"
            />
          </label>
          <div className={styles.lookRow} role="group" aria-label="Champion look">
            {CHAMPION_LOOKS.map(option => (
              <button
                key={option.id}
                type="button"
                className={styles.lookSwatch}
                aria-pressed={championIdentity.lookId === option.id}
                disabled={!unlocked}
                title={option.label}
                style={{ background: option.accent }}
                onClick={() => onChampionIdentity({ ...championIdentity, lookId: option.id })}
              >
                <span className={styles.srOnly}>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <label className={styles.policyLabel}>
        <span>Style</span>
        <select value={policy} disabled={!unlocked} onChange={event => onPolicy(event.target.value as CollectorStrategy)}>
          {Object.entries(POLICY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <dl className={styles.agentStats}>
        <div><dt>Cargo</dt><dd>{formatStat(agent.cargo)}<small> / {ARENA_RULES.capacity}</small></dd></div>
        <div><dt>Energy</dt><dd>{formatStat(agent.energy)}<small> / {ARENA_RULES.initialEnergy}</small></dd></div>
        <div><dt>Recovery</dt><dd>{agent.recoveries}</dd></div>
      </dl>
      <p className={styles.decision}>{describeArenaDecision(agent)}</p>
    </section>
  )
}
