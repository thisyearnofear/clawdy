'use client'

import { Play, Trophy } from 'lucide-react'
import type { ArenaTournament, TournamentMatch } from '../../services/arenaTournament'
import type { ArenaPhase } from '../../services/arenaProtocol'
import styles from '../environment/ArenaScene.module.css'

export function TournamentBracket({
  tournament,
  running,
  visualReady,
  phase,
  onRun,
  onWatch,
}: {
  tournament: ArenaTournament | null
  running: boolean
  visualReady: boolean
  phase: ArenaPhase
  onRun: () => void
  onWatch: (match: TournamentMatch) => void
}) {
  const entrantName = (id: string | null) =>
    id === null ? 'bye' : (tournament?.entrants.find(entrant => entrant.id === id)?.name ?? id)
  return (
    <section className={styles.replay} aria-label="Tournament bracket">
      <div>
        <strong>Tournament · single elimination</strong>
        <span>
          {running
            ? 'Running bracket…'
            : tournament?.status === 'done'
              ? `Champion: ${entrantName(tournament.champion)}`
              : 'Your trained champion vs the house field'}
        </span>
        <button
          type="button"
          className={styles.frameCoachButton}
          onClick={onRun}
          disabled={running || !visualReady}
          title="Run a seeded bracket on the current layout; every match is fully recorded"
        >
          <Trophy size={13} />
          {tournament ? 'Run again' : 'Run bracket'}
        </button>
      </div>
      {tournament && tournament.rounds.map((round, roundIndex) => (
        <div key={roundIndex} className={styles.bracketRound}>
          <strong>{roundIndex === tournament.rounds.length - 1 ? 'Final' : `Round ${roundIndex + 1}`}</strong>
          {round.map(match => (
            <div key={match.id} className={styles.bracketMatch}>
              <span>{entrantName(match.slotA)} vs {entrantName(match.slotB)}</span>
              <span>
                {match.status === 'done'
                  ? match.recording
                    ? `${match.banked[match.slotA!] ?? 0}–${match.banked[match.slotB!] ?? 0} · ${entrantName(match.winner)}`
                    : `${entrantName(match.winner)} · bye`
                  : 'pending'}
              </span>
              {match.recording && (
                <button
                  type="button"
                  className={styles.frameCoachButton}
                  onClick={() => onWatch(match)}
                  disabled={phase === 'running'}
                  title="Replay this match with the cinematic camera"
                >
                  <Play size={13} /> Watch
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
