import { useCallback, useEffect, useState } from 'react';
import { flagUrl, type GameData } from '../data';
import { LEADERBOARD_SIZE, RunRejected, campaignTitle, formatScore, submitRun, topRuns, type Leaderboard as Board, type LeaderboardRow, type RunRecord } from '../leaderboard';
import { sound } from '../sound';
import { MODES, type Country } from '../game/types';
import { FlagIcon } from './FlagIcon';

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
  | { status: 'ready'; rows: LeaderboardRow[]; rank: number | null };

/** The end of a run: sends it to the leaderboard and shows the campaign's top five around it. */
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
      const rows = (await topRuns(run.campaign))[run.campaign];
      if (alive) setBoard({ status: 'ready', rows, rank });
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
        Global top {LEADERBOARD_SIZE} <span>{campaignTitle(run.campaign)}</span>
      </h2>
      {board.status === 'loading' && <p className="board-note">Consulting the scribes…</p>}
      {board.status === 'unavailable' && (
        <p className="board-note" data-testid="board-unavailable">
          Leaderboard unavailable. This run was not recorded.
        </p>
      )}
      {board.status === 'ready' && (
        <>
          {board.rows.length > 0 ? <BoardRows rows={board.rows} byId={byId} mine={run.runId} /> : <p className="board-note">No empire has finished this campaign yet.</p>}
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
                ? 'Your empire is the greatest this campaign has seen.'
                : `Your empire ranks #${board.rank.toLocaleString('en-US')} in this campaign.`}
          </p>
        </>
      )}
    </section>
  );
}

type AllBoards = { status: 'loading' } | { status: 'unavailable' } | { status: 'ready'; board: Board };

interface Props {
  data: GameData;
  onClose: () => void;
}

/** The hall of empires: the top five of every campaign. It takes the place of the map, like the rule book. */
export function Leaderboard({ data, onClose }: Props) {
  const [state, setState] = useState<AllBoards>({ status: 'loading' });
  const load = useCallback(() => {
    let alive = true;
    setState({ status: 'loading' });
    topRuns()
      .then((board) => alive && setState({ status: 'ready', board }))
      .catch(() => alive && setState({ status: 'unavailable' }));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <section className="rules leaderboard" aria-label="Leaderboard" data-testid="leaderboard" data-status={state.status}>
      <div className="rules-bar" aria-hidden="true" />
      <div className="rules-page">
        <header className="rules-hero">
          <p className="rules-kicker">Hall of empires</p>
          <h1>
            Leader<span>board</span>
          </h1>
          <p className="rules-lead">The five greatest empires of every campaign, from players everywhere.</p>
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
        {state.status === 'ready' &&
          MODES.map((mode) => (
            <article key={mode} className={`rule board-card ${mode === 'World' ? 'wide' : ''}`} data-campaign={mode} data-testid={`board-${mode}`}>
              <h2>
                {campaignTitle(mode)}
                <small>{data.worlds[mode].ids.length} countries</small>
              </h2>
              {state.board[mode].length > 0 ? (
                <BoardRows rows={state.board[mode]} byId={data.byId} detailed />
              ) : (
                <p className="board-note">No empire has finished this campaign yet. Be the first.</p>
              )}
            </article>
          ))}

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
