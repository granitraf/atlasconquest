import { useCallback, useEffect, useState } from 'react';
import { flagUrl, type GameData } from '../data';
import { countdown, dailyCountryId, dayLabel } from '../daily/daily';
import { LEADERBOARD_PAGE_SIZE, LEADERBOARD_SIZE, RunRejected, dayScores, formatScore, submitRun, topRuns, type LeaderboardRow, type RunRecord, type ScoreCount } from '../leaderboard';
import { sound } from '../sound';
import type { Country } from '../game/types';
import { FlagIcon } from './FlagIcon';
import { ScoreCurve } from './ScoreCurve';

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

interface RowsProps {
  rows: LeaderboardRow[];
  byId: Record<string, Country>;
  /** The run to pick out in gold: the player's own. */
  mine?: string;
  /** Say where each empire started and how far it got. */
  detailed?: boolean;
}

/** Runs of one campaign, best first: place, pixel flag, empire name, score. */
export function BoardRows({ rows, byId, mine, detailed = false }: RowsProps) {
  return (
    <ol className="board-rows">
      {rows.map((row) => {
        const start = byId[row.startCountry];
        return (
          <li key={row.runId} className={`board-row ${row.runId === mine ? 'mine' : ''}`} data-testid="board-row" data-rank={row.rank} data-run={row.runId}>
            <span className="board-rank">{row.rank}</span>
            <FlagIcon flag={row.flag} scale={3} label={`Flag of ${row.empireName}`} />
            <span className="board-who">
              <strong className="board-name">{row.empireName}</strong>
              {detailed && (
                <small className="board-detail">
                  {start && <img className="px-flag inline-flag" src={flagUrl(start.cca2)} alt="" />}
                  {start ? `${start.name} · ` : ''}
                  {row.outcome === 'victory' ? 'conquered it all' : plural(row.conquered, 'country', 'countries')}
                </small>
              )}
            </span>
            <span className="board-score">{formatScore(row.score)}</span>
          </li>
        );
      })}
    </ol>
  );
}

type RunBoard =
  | { status: 'loading' }
  | { status: 'unavailable' }
  /** `rank` is null when the leaderboard answered but would not take this run. */
  | { status: 'ready'; rows: LeaderboardRow[]; scores: ScoreCount[]; rank: number | null };

/**
 * The end of a Daily Game: sends the run to the leaderboard, then shows the day's top five around it and
 * where its score falls among everyone who has finished today.
 */
export function RunBoard({ run, byId }: { run: RunRecord; byId: Record<string, Country> }) {
  const [board, setBoard] = useState<RunBoard>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    setBoard({ status: 'loading' });
    (async () => {
      let rank: number | null = null;
      try {
        rank = await submitRun(run);
      } catch (err) {
        // A refused run is not on the board, but the board can still be shown.
        if (!(err instanceof RunRejected)) throw err;
      }
      const [rows, scores] = await Promise.all([topRuns(run.day), dayScores(run.day)]);
      if (alive) setBoard({ status: 'ready', rows, scores, rank });
    })().catch(() => alive && setBoard({ status: 'unavailable' }));
    return () => {
      alive = false;
    };
    // The run is fixed once the game has ended; its id stands for all of it.
  }, [run.runId]); // eslint-disable-line react-hooks/exhaustive-deps

  const outside = board.status === 'ready' && board.rank !== null && !board.rows.some((row) => row.runId === run.runId);
  return (
    <section className="end-board" data-testid="end-board" data-status={board.status} data-rank={board.status === 'ready' ? (board.rank ?? '') : ''}>
      <h2>
        Today's top {LEADERBOARD_SIZE} <span>{dayLabel(run.day)}</span>
      </h2>
      {board.status === 'loading' && <p className="board-note">Consulting the scribes…</p>}
      {board.status === 'unavailable' && (
        <p className="board-note" data-testid="board-unavailable">
          Leaderboard unavailable. This run was not recorded.
        </p>
      )}
      {board.status === 'ready' && (
        <>
          {board.rows.length > 0 ? <BoardRows rows={board.rows} byId={byId} mine={run.runId} /> : <p className="board-note">Nobody has finished today yet.</p>}
          {outside && (
            <>
              <p className="board-gap" aria-hidden="true">
                · · ·
              </p>
              <BoardRows rows={[{ ...run, rank: board.rank!, createdAt: '' }]} byId={byId} mine={run.runId} />
            </>
          )}
          <p className="board-note" data-testid="board-standing">
            {board.rank === null
              ? 'This run could not be recorded.'
              : board.rank === 1
                ? 'Your empire leads the day.'
                : `Your empire ranks #${board.rank.toLocaleString('en-US')} today.`}
          </p>
          {board.rank !== null && <ScoreCurve scores={board.scores} mine={run.score} />}
        </>
      )}
    </section>
  );
}

type DayBoard = { status: 'loading' } | { status: 'unavailable' } | { status: 'ready'; rows: LeaderboardRow[]; scores: ScoreCount[] };

interface Props {
  data: GameData;
  /** Today in the daily game's time zone, and the seconds left in it. */
  day: string;
  secondsLeft: number;
  /** This device's own finished run today, if any: picked out on the board and marked on the curve. */
  mine: { runId: string; score: number } | null;
  onClose: () => void;
}

/** Today's leaderboard: the best runs of the day and the spread of everyone's scores. It starts afresh every day. */
export function Leaderboard({ data, day, secondsLeft, mine, onClose }: Props) {
  const [state, setState] = useState<DayBoard>({ status: 'loading' });
  const load = useCallback(() => {
    let alive = true;
    setState({ status: 'loading' });
    Promise.all([topRuns(day, LEADERBOARD_PAGE_SIZE), dayScores(day)])
      .then(([rows, scores]) => alive && setState({ status: 'ready', rows, scores }))
      .catch(() => alive && setState({ status: 'unavailable' }));
    return () => {
      alive = false;
    };
  }, [day]);
  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const start = data.byId[dailyCountryId(day)];
  return (
    <section className="rules leaderboard" aria-label="Leaderboard" data-testid="leaderboard" data-status={state.status} data-day={day}>
      <div className="rules-bar" aria-hidden="true" />
      <div className="rules-page">
        <header className="rules-hero">
          <p className="rules-kicker">{dayLabel(day)}</p>
          <h1>
            Leader<span>board</span>
          </h1>
          <p className="rules-lead">Today's greatest empires. Everyone starts from the same country, and the board starts afresh every day.</p>
        </header>

        {state.status === 'loading' && (
          <article className="rule wide board-message" role="status">
            <p>Consulting the scribes…</p>
          </article>
        )}
        {state.status === 'unavailable' && (
          <article className="rule wide board-message" role="status" data-testid="leaderboard-unavailable">
            <h2>Leaderboard unavailable</h2>
            <p>The hall of empires cannot be reached right now. The game plays exactly the same without it.</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                sound.snap();
                load();
              }}
              data-testid="leaderboard-retry"
            >
              Try again
            </button>
          </article>
        )}
        {state.status === 'ready' && (
          <>
            <article className="rule board-card" data-testid="board-today">
              <h2>
                Today's top {LEADERBOARD_PAGE_SIZE}
                <small>resets in {countdown(secondsLeft)}</small>
              </h2>
              {state.rows.length > 0 ? (
                <BoardRows rows={state.rows} byId={data.byId} mine={mine?.runId} detailed />
              ) : (
                <p className="board-note">Nobody has finished today's conquest yet. Be the first.</p>
              )}
            </article>
            <article className="rule board-card" data-testid="board-curve">
              <h2>How everyone did</h2>
              {state.scores.length > 0 ? <ScoreCurve scores={state.scores} mine={mine?.score ?? null} /> : <p className="board-note">The curve fills in as players finish.</p>}
              <p className="rule-note">
                {mine ? 'The marker is your score.' : start ? "Finish today's conquest to see where you stand." : ''} Each bar is a band of scores; the line is the bell
                curve they follow.
              </p>
            </article>
          </>
        )}

        <footer className="rules-foot">
          {state.status === 'ready' && <p className="rule-note">Ranked by final score. Ties go to the empire that fought fewer battles, then to the earlier one.</p>}
          <button type="button" className="btn primary" onClick={onClose} data-testid="leaderboard-close">
            Back to the map
          </button>
        </footer>
      </div>
    </section>
  );
}
