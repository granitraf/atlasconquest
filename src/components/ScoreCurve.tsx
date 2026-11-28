import { standing, type ScoreCount } from '../leaderboard';

const W = 300;
const H = 86;
const BASE = 70;
const BINS = 20;

interface Props {
  /** How many players finished the day on each score. */
  scores: readonly ScoreCount[];
  /** The player's own score, marked on the curve; null to show the spread alone. */
  mine?: number | null;
}

/**
 * The day's scores as a curve: a bar for each band of scores, a bell curve fitted over them, and a
 * marker where the player's own score falls, with the share of the other players it beat.
 */
export function ScoreCurve({ scores, mine = null }: Props) {
  const { players, beat } = standing(scores, mine ?? 0);
  if (players === 0) return null;
  const top = Math.max(10, ...scores.map((s) => s.score), mine ?? 0);
  const width = top / BINS;
  const binOf = (score: number) => Math.min(BINS - 1, Math.floor(score / width));
  const bins = Array.from({ length: BINS }, () => 0);
  for (const s of scores) bins[binOf(s.score)] += s.players;
  const tallest = Math.max(...bins);
  const barW = W / BINS;
  const x = (score: number) => (score / top) * W;

  // A bell curve with the same mean and spread as the scores, scaled to the tallest bar.
  const mean = scores.reduce((sum, s) => sum + s.score * s.players, 0) / players;
  const sd = Math.sqrt(scores.reduce((sum, s) => sum + (s.score - mean) ** 2 * s.players, 0) / players);
  const bell =
    players >= 3 && sd > 0
      ? Array.from({ length: 61 }, (_, i) => {
          const score = (i / 60) * top;
          const y = BASE - Math.exp(-((score - mean) ** 2) / (2 * sd * sd)) * (BASE - 8);
          return `${i === 0 ? 'M' : 'L'}${x(score).toFixed(1)} ${y.toFixed(1)}`;
        }).join(' ')
      : null;

  return (
    <figure className="score-curve" data-testid="score-curve" data-players={players} data-beat={beat ?? ''}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`How ${players} players scored today`} shapeRendering="crispEdges">
        {bins.map((count, i) =>
          count > 0 ? (
            <rect
              key={i}
              className={mine !== null && binOf(mine) === i ? 'bar mine' : 'bar'}
              x={i * barW + 1}
              y={BASE - Math.max(3, (count / tallest) * (BASE - 8))}
              width={barW - 2}
              height={Math.max(3, (count / tallest) * (BASE - 8))}
            />
          ) : null,
        )}
        {bell && <path className="bell" d={bell} shapeRendering="auto" />}
        <rect className="axis" x={0} y={BASE} width={W} height={2} />
        {mine !== null && (
          <g className="you" transform={`translate(${Math.min(W - 4, Math.max(4, x(mine)))} 0)`}>
            <rect x={-1} y={6} width={2} height={BASE - 6} />
            <path d="M-5 0 L5 0 L0 7 Z" shapeRendering="auto" />
          </g>
        )}
        <text className="tick" x={0} y={H - 2}>
          0
        </text>
        <text className="tick" x={W} y={H - 2} textAnchor="end">
          {Math.round(top)}
        </text>
      </svg>
      <figcaption data-testid="curve-caption">
        {mine === null
          ? `${players} ${players === 1 ? 'player has' : 'players have'} finished today.`
          : beat === null
            ? 'You are the first to finish today.'
            : `You beat ${beat}% of the other ${players - 1 === 1 ? 'player' : `${players - 1} players`} today.`}
      </figcaption>
    </figure>
  );
}
