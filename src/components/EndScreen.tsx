import { flagUrl } from '../data';
import { CONTINENT_BONUS } from '../game/rules';
import type { GameStats } from '../game/state';
import type { Country, GameState } from '../game/types';
import { formatScore, type RunRecord } from '../leaderboard';
import { FlagIcon } from './FlagIcon';
import { RunBoard } from './Leaderboard';

interface Props {
  state: GameState;
  stats: GameStats;
  start: Country;
  /** This run as the daily leaderboard records it; null for a classic game, which is not recorded. */
  run: RunRecord | null;
  byId: Record<string, Country>;
  onPlayAgain: () => void;
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** The reckoning: your empire, how much it took, and what that was worth. */
export function EndScreen({ state, stats, start, run, byId, onPlayAgain }: Props) {
  const won = state.phase === 'victory';
  const landScore = stats.score - stats.continentBonus;
  return (
    <div className="end-backdrop" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div className={`end ${won ? 'victory' : 'defeat'}`} data-testid={won ? 'victory-screen' : 'gameover-screen'}>
        <div className="end-empire" data-testid="end-empire">
          <FlagIcon flag={state.empire.flag} scale={8} label="Your flag" />
          <div>
            <strong>{state.empire.name}</strong>
            <span>
              {state.daily ? 'Daily conquest' : state.mode === 'World' ? 'World conquest' : `${state.mode} campaign`} · rose from{' '}
              <img className="px-flag inline-flag" src={flagUrl(start.cca2)} alt="" />
              {start.name}
            </span>
          </div>
        </div>
        <h1 id="end-title">{won ? 'Victory!' : 'Game over'}</h1>
        <p className="end-sub">
          {won
            ? `Every one of the ${stats.total} countries flies your flag.`
            : state.lastEvent?.kind === 'surrendered'
              ? `You ended the conquest with ${plural(stats.owned, 'country', 'countries')} under your flag.`
              : `Your empire fell with ${plural(stats.owned, 'country', 'countries')} under its flag.`}
        </p>
        <dl className="end-stats">
          <div>
            <dt>Countries conquered</dt>
            <dd data-testid="stat-conquered">
              {stats.conquered}
              <small> of {stats.total - 1}</small>
            </dd>
          </div>
          <div>
            <dt>Best streak</dt>
            <dd data-testid="stat-streak">{stats.bestStreak}</dd>
          </div>
          <div>
            <dt>Battles fought</dt>
            <dd data-testid="stat-battles">{stats.battles}</dd>
          </div>
          <div className="continents" data-testid="stat-continents" data-value={stats.continents.length}>
            <dt>Continents conquered</dt>
            <dd>
              {stats.continents.length === 0 ? (
                <small>None yet. Each whole continent is worth +{CONTINENT_BONUS}.</small>
              ) : (
                stats.continents.map((continent) => (
                  <span key={continent} className="continent-chip">
                    {continent} <b>+{CONTINENT_BONUS}</b>
                  </span>
                ))
              )}
            </dd>
          </div>
          <div className="score">
            <dt>Final score</dt>
            <dd data-testid="stat-score">{formatScore(stats.score)}</dd>
            <p data-testid="score-sum">
              {state.daily
                ? `${plural(stats.conquered, 'country', 'countries')}, a point each`
                : `${plural(stats.conquered, 'country', 'countries')} × ${stats.multiplier} (${state.startLabel} start) = ${formatScore(landScore)}`}
              {stats.continentBonus > 0 &&
                `, plus ${plural(stats.continents.length, 'continent')} × ${CONTINENT_BONUS} = ${stats.continentBonus} bonus`}
            </p>
          </div>
        </dl>
        {run && <RunBoard run={run} byId={byId} />}
        <button type="button" className="btn primary big" onClick={onPlayAgain} data-testid="play-again" autoFocus>
          {state.daily ? 'Back to the menu' : 'Play again'}
        </button>
      </div>
    </div>
  );
}
