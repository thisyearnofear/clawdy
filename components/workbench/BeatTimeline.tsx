/**
 * BeatTimeline — the director's forecast as a scrub bar.
 *
 * matchTimeline.ts already predicts every clash, sighting, bank, flood
 * flip, rescue, and the finish. This surfaces that structure: pips on a
 * timeline you can read at a glance and click to jump to (landing a few
 * ticks ahead of the beat so the approach stays watchable). Flood windows
 * render as shaded spans.
 */
import { MOMENT_LABELS, MOMENT_LEAD_TICKS, type MatchMoment } from '../../services/matchTimeline'
import styles from '../environment/ArenaScene.module.css'

const PIP_CLASS: Record<string, string> = {
  clash: styles.beatClash,
  sighting: styles.beatSighting,
  bank: styles.beatBank,
  'flood-on': styles.beatFlood,
  'flood-off': styles.beatFlood,
  rescue: styles.beatRescue,
  finish: styles.beatFinish,
}

export function BeatTimeline({ moments, floods, tick, durationTicks, onJump }: {
  moments: MatchMoment[] | null
  floods: readonly { startTick: number; endTick: number }[]
  tick: number
  durationTicks: number
  onJump: (tick: number) => void
}) {
  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / durationTicks) * 100))}%`
  return (
    <div className={styles.beatTrack} role="group" aria-label="Match moments timeline">
      {floods.map((f, i) => (
        <div
          key={i}
          className={styles.beatFloodSpan}
          style={{ left: pct(f.startTick), width: `${((f.endTick - f.startTick) / durationTicks) * 100}%` }}
          title="Flood window"
        />
      ))}
      {moments?.map((moment, i) => (
        <button
          key={`${moment.kind}-${moment.tick}-${i}`}
          type="button"
          className={`${styles.beatPip} ${PIP_CLASS[moment.kind] ?? styles.beatPip}`}
          style={{ left: pct(moment.tick) }}
          title={`${MOMENT_LABELS[moment.kind]} · t${moment.tick}`}
          aria-label={`Jump to ${MOMENT_LABELS[moment.kind]} at tick ${moment.tick}`}
          onClick={() => onJump(Math.max(0, moment.tick - MOMENT_LEAD_TICKS[moment.kind]))}
        />
      ))}
      <div className={styles.beatPlayhead} style={{ left: pct(tick) }} />
    </div>
  )
}
