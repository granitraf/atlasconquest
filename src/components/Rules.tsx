import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { GameData } from '../data';
import {
  CONTINENT_BONUS,
  DECIMATE_STREAK,
  DEFENDERS_PER_TROOP,
  ESCALATION_EVERY,
  MIN_DEFENDERS,
  MIN_TARGETS,
  QUESTION_TIMER_SECONDS,
  RECRUIT_QUESTIONS,
  RETREAT_SHARE,
  SEA_RANGE_KM,
  SEA_TIMER_SECONDS,
  START_LABELS,
  START_MULTIPLIER,
  START_RATING,
  START_TROOPS,
  WOUND_HEAL_PER_BATTLE,
  WRONG_ANSWER_TROOP_LOSS,
  conquestTroops,
  defenderKills,
  defendersFor,
  seaBonus,
  soldiers,
  startDifficulty,
  streakMultiplier,
  troopReward,
} from '../game/rules';
import { MODES, type Difficulty, type StartLabel, type StartPosition } from '../game/types';
import type { CountryShape } from '../map/geo';

interface Props {
  data: GameData;
  onClose: () => void;
  /** The rule book of the Daily Game (one country a day, no start ratings) rather than of the classic game. */
  daily?: boolean;
}

const slug = (label: string) => label.toLowerCase().replace(/\s+/g, '-');

/** A defender, as a 5 x 6 pixel helmet. One stands for a thousand. */
const HELMET = ['.OOO.', 'OHHHO', 'OHHHO', 'OOOOO', 'O.O.O', '.O.O.'];

function Helmet({ tone }: { tone: 'them' | 'you' }) {
  const colours = tone === 'them' ? { O: '#7a161b', H: '#ff5a5f' } : { O: '#0f5a31', H: '#3ddc84' };
  return (
    <svg className="helmet" viewBox="0 0 5 6" shapeRendering="crispEdges" aria-hidden="true">
      {HELMET.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colours[cell as 'O' | 'H']} />,
        ),
      )}
    </svg>
  );
}

/** A row of helmets: one for every thousand soldiers. */
function Ranks({ units, tone, label }: { units: number; tone: 'them' | 'you'; label: string }) {
  return (
    <span className="ranks" role="img" aria-label={label} data-units={units}>
      {Array.from({ length: units }, (_, i) => (
        <Helmet key={i} tone={tone} />
      ))}
    </span>
  );
}

const SHAPE_W = 60;
const SHAPE_H = 44;

/**
 * A country drawn the way the map draws one under attack: a small grid of hard
 * pixels, filled red with a pale outline, scaled up without smoothing.
 */
function CountryPixels({ shape, name }: { shape: CountryShape; name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;
    const [[x0, y0], [x1, y1]] = shape.bounds;
    const scale = Math.min((SHAPE_W - 4) / Math.max(x1 - x0, 0.01), (SHAPE_H - 4) / Math.max(y1 - y0, 0.01));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, SHAPE_W, SHAPE_H);
    ctx.setTransform(scale, 0, 0, scale, (SHAPE_W - (x1 - x0) * scale) / 2 - x0 * scale, (SHAPE_H - (y1 - y0) * scale) / 2 - y0 * scale);
    ctx.fillStyle = '#000';
    ctx.fill(new Path2D(shape.d));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Snap the soft edge to whole pixels, then give the shape a one-pixel outline.
    const image = ctx.getImageData(0, 0, SHAPE_W, SHAPE_H);
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < SHAPE_W && y < SHAPE_H && image.data[(y * SHAPE_W + x) * 4 + 3] > 110;
    const out = ctx.createImageData(SHAPE_W, SHAPE_H);
    for (let y = 0; y < SHAPE_H; y++) {
      for (let x = 0; x < SHAPE_W; x++) {
        if (!inside(x, y)) continue;
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        const [r, g, b] = edge ? [255, 170, 165] : (x + y) % 2 ? [201, 62, 58] : [214, 74, 68];
        out.data.set([r, g, b, 255], (y * SHAPE_W + x) * 4);
      }
    }
    ctx.putImageData(out, 0, 0);
  }, [shape]);
  return <canvas ref={ref} className="country-pixels" width={SHAPE_W} height={SHAPE_H} role="img" aria-label={`${name}, drawn in pixels`} />;
}

const POSITIONS: { key: StartPosition; title: string; detail: string }[] = [
  { key: 'open', title: 'Open', detail: 'several weak neighbours' },
  { key: 'cheapExit', title: 'A way out', detail: 'one weak neighbour' },
  { key: 'boxedIn', title: 'Boxed in', detail: 'every neighbour is strong' },
  { key: 'island', title: 'Island', detail: 'sea crossings only' },
];
const FAME: { fame: 0 | 1 | 2; title: string; detail: string }[] = [
  { fame: 0, title: 'Well known', detail: 'France, Japan, Brazil' },
  { fame: 1, title: 'Mid-known', detail: 'Romania, Kenya, Iceland' },
  { fame: 2, title: 'Obscure', detail: 'Andorra, Laos, Palau' },
];
const TIER_NAME: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
/** The five recruit questions a well-known start is asked: its recruiting is capped at Medium, so the last one is Medium. */
const FAMOUS_RECRUIT: Difficulty[] = ['easy', 'easy', 'medium', 'medium', 'medium'];
/** Countries shown as examples of what a number of defenders means. */
const EXAMPLES = ['LUX', 'IRL', 'FRA', 'IND'];

const Badge = ({ label }: { label: StartLabel }) => (
  <span className={`badge ${slug(label)}`}>
    {label} <b>×{START_MULTIPLIER[label]}</b>
  </span>
);

/** The rule book. Takes the place of the map on the start screen. Every number comes from the rules themselves. */
export function Rules({ data, daily = false, onClose }: Props) {
  // Chapters are numbered as they come: the Daily Game has one fewer than the classic game.
  let chapter = 0;
  const next = () => ++chapter;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const world = data.worlds.World;
  const ratings = useMemo(() => {
    const counts = Object.fromEntries(START_LABELS.map((label) => [label, 0])) as Record<StartLabel, number>;
    for (const id of world.ids) counts[startDifficulty(world, id).label]++;
    return counts;
  }, [world]);

  // The recruit ladder for a well-known start, step by step.
  let army = START_TROOPS;
  const ladder = FAMOUS_RECRUIT.map((tier, i) => {
    const multiplier = streakMultiplier(i + 1);
    const gain = troopReward(tier) * multiplier;
    army += gain;
    return { tier, gain, multiplier, army };
  });
  const famousBest = army;
  // The best possible round: four Medium questions and a doubled Hard one, for a start with no Easy questions.
  const overallBest = START_TROOPS + troopReward('medium') * 4 + troopReward('hard') * streakMultiplier(RECRUIT_QUESTIONS);
  const mistakes = (troops: number) => Math.ceil(troops / WRONG_ANSWER_TROOP_LOSS);

  const examples = EXAMPLES.filter((id) => data.byId[id] && data.geometry.byId[id]).map((id) => {
    const defenders = defendersFor(data.byId[id].population);
    return { id, name: data.byId[id].name, defenders, worth: conquestTroops(defenders), shape: data.geometry.byId[id] };
  });
  // The spoils table: a spread of country sizes, from the smallest to the largest, and what each pays.
  const spoils = [...new Set([MIN_DEFENDERS, 4, 6, 8, 10, defendersFor(1.4e9)])].map((enemies) => ({ enemies, worth: conquestTroops(enemies) }));

  return (
    <section className="rules" aria-label="Rules of Atlas Conquest" data-testid="rules">
      {/* A plank across the top that the page scrolls under; the button that brought you here sits on it. */}
      <div className="rules-bar" aria-hidden="true" />
      <div className="rules-page">
        <header className="rules-hero">
          <p className="rules-kicker">How to play</p>
          <h1>
            Atlas <span>Conquest</span>
          </h1>
          <p className="rules-lead">One map. One army. Everything you know about the world.</p>
        </header>

        <article className="rule wide" data-rule="game">
          <h2>
            <i>{next()}</i> The game
          </h2>
          <p>
            Atlas Conquest is a game of conquest where <b>your knowledge is your army</b>.{' '}
            {daily ? 'Every day you are given a country: raise your troops, and take the map' : 'Pick a country, raise your troops, and take the map'}{' '}
            one country at a time. Every battle is a run of questions on the geography, history and culture of the country you are attacking. Answer right and its
            enemies fall. Answer wrong and your own troops do.
          </p>
          <p>Nobody attacks you back. The only thing between you and the whole map is what you know.</p>
        </article>

        <article className="rule" data-rule="goal">
          <h2>
            <i>{next()}</i> The goal
          </h2>
          <p>
            <b>{daily ? 'Fly your flag over every country in the world.' : 'Fly your flag over every country in your campaign.'}</b> You have a
            single heart: run out of troops in a battle and your empire falls.
          </p>
          {daily ? (
            <p className="rule-formula">
              Score = countries conquered <em>+</em> {CONTINENT_BONUS} for every continent you hold in full
            </p>
          ) : (
            <p className="rule-formula">
              Score = countries conquered <em>×</em> your start's multiplier <em>+</em> {CONTINENT_BONUS} for every continent you hold in full
            </p>
          )}
          <p className="rule-note">
            {daily
              ? "Every finished Daily Game goes on today's leaderboard under your empire's name and flag, and shows where you stand among everyone who played."
              : 'The classic game is for practice: only the Daily Game goes on the leaderboard.'}
          </p>
        </article>

        {daily ? (
          <article className="rule" data-rule="daily">
            <h2>
              <i>{next()}</i> The daily conquest
            </h2>
            <p>
              <b>One country a day, the same for every player.</b> The reel spins through the world and lands on it. A new country arrives at
              midnight, US Eastern time.
            </p>
            <p>
              <b>One attempt a day.</b> Giving up ends the run, and it counts as it stands. Everyone starts level, and every country you take
              is worth one point.
            </p>
            <p className="rule-note">The leaderboard starts afresh every day.</p>
          </article>
        ) : (
          <>
            <article className="rule" data-rule="campaigns">
              <h2>
                <i>{next()}</i> {MODES.length} campaigns
              </h2>
              <p>Take on the whole world, or keep it to one continent.</p>
              <ul className="rule-chips" data-testid="rules-campaigns">
                {MODES.map((mode) => (
                  <li key={mode}>
                    {mode} <b>{data.worlds[mode].ids.length}</b>
                  </li>
                ))}
              </ul>
            </article>

            <article className="rule wide" data-rule="start">
              <h2>
                <i>{next()}</i> Where you start
              </h2>
              <p>
                Every start gets the same {soldiers(START_TROOPS)} troops. What changes is how hard the road is, and each country is graded for it
                by two things: <b>how well known it is</b>, and <b>where it sits</b>.
              </p>
              <div className="rule-scroll">
                <table className="rule-grid" data-testid="rules-grades">
                  <thead>
                    <tr>
                      <th />
                      {POSITIONS.map((p) => (
                        <th key={p.key}>
                          {p.title}
                          <small>{p.detail}</small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FAME.map((row) => (
                      <tr key={row.fame}>
                        <th>
                          {row.title}
                          <small>{row.detail}</small>
                        </th>
                        {POSITIONS.map((p) => (
                          <td key={p.key}>
                            <Badge label={START_RATING[row.fame][p.key]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                <b>Why?</b> The less famous a country, the harder its questions: fewer people know its flag, its capital or its neighbours. And an
                island has no border to walk across, so every step is a sea crossing against extra enemies and half the time. The grade is the
                multiplier on your score, from ×{START_MULTIPLIER.Easy} to ×{START_MULTIPLIER.Extreme}: the harder the start, the more every
                conquest counts.
              </p>
              <p className="rule-note" data-testid="rules-rating-counts">
                In the World campaign:{' '}
                {START_LABELS.map((label, i) => (
                  <span key={label}>
                    {i > 0 && ' · '}
                    {ratings[label]} {label}
                  </span>
                ))}
                .
              </p>
            </article>
          </>
        )}

        <article className="rule wide" data-rule="recruit">
          <h2>
            <i>{next()}</i> Recruitment
          </h2>
          <p>
            Before the first battle comes your <b>one round of recruitment</b>: {RECRUIT_QUESTIONS} questions about your own country. It opens
            with your flag and gets harder. Every right answer enlists troops:
          </p>
          <ul className="rule-chips">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((tier) => (
              <li key={tier} className={tier}>
                {TIER_NAME[tier]} <b>+{soldiers(troopReward(tier))}</b>
              </li>
            ))}
            <li className="gold">
              {RECRUIT_QUESTIONS} right in a row <b>last one ×{streakMultiplier(RECRUIT_QUESTIONS)}</b>
            </li>
          </ul>
          <ol className="ladder" data-testid="rules-ladder" aria-label="A perfect recruit round for a well-known start">
            <li className="from">
              <span>Start</span>
              <b>{soldiers(START_TROOPS)}</b>
            </li>
            {ladder.map((step, i) => (
              <li key={i} style={{ '--rise': (step.army - START_TROOPS) / (famousBest - START_TROOPS) } as CSSProperties}>
                <span>
                  {TIER_NAME[step.tier]}
                  {step.multiplier > 1 && ` ×${step.multiplier}`}
                </span>
                <em>+{soldiers(step.gain)}</em>
                <b>{soldiers(step.army)}</b>
              </li>
            ))}
          </ol>
          <p>
            A perfect round takes a well-known start from {soldiers(START_TROOPS)} to <b>{soldiers(famousBest)}</b>. Lesser-known starts are
            asked harder questions that pay more: up to <b>{soldiers(overallBest)}</b>.
          </p>
          <p className="rule-callout">
            <b>Why it matters.</b> This is the only time troops come from questions alone. After it, the only way to grow is to conquer. A wrong
            answer in battle costs {soldiers(WRONG_ANSWER_TROOP_LOSS)} troops, so an army of {soldiers(START_TROOPS)} is gone after{' '}
            {mistakes(START_TROOPS)} mistakes, and an army of {soldiers(famousBest)} survives {mistakes(famousBest) - 1}. Recruitment is the
            difference between a campaign and a short walk.
          </p>
        </article>

        <article className="rule wide" data-rule="defenders">
          <h2>
            <i>{next()}</i> Enemies
          </h2>
          <p>
            Every country is held by enemies, from {soldiers(MIN_DEFENDERS)} for the smallest to {soldiers(defendersFor(1.4e9))} for the
            most populous. A right answer defeats {soldiers(defenderKills('easy'))} of them, so{' '}
            <b>
              every {soldiers(1)} enemies is about one question
            </b>
            .
          </p>
          <div className="rule-countries" data-testid="rules-countries">
            {examples.map((c) => (
              <figure key={c.id} className="rule-country" data-id={c.id} data-defenders={c.defenders}>
                <CountryPixels shape={c.shape} name={c.name} />
                <figcaption>
                  <strong>{c.name}</strong>
                  <span className="defenders">{soldiers(c.defenders)} enemies</span>
                  <Ranks units={c.defenders} tone="them" label={`${c.defenders} helmets, one for every thousand enemies`} />
                  <span className="questions">about {c.defenders} questions</span>
                  <span className="worth">worth +{soldiers(c.worth)} troops</span>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="rule-note">
            "About", because a Hard question defeats {soldiers(defenderKills('hard'))} at once, and every wrong answer is one more question to
            get through.
          </p>
        </article>

        <article className="rule" data-rule="battle">
          <h2>
            <i>{next()}</i> In battle
          </h2>
          <div className="rule-versus" aria-hidden="true">
            <span className="you">
              <Ranks units={START_TROOPS * 2} tone="you" label="" />
              <b>{soldiers(START_TROOPS * 2)}</b>
            </span>
            <span className="vs">vs</span>
            <span className="them">
              <b>{soldiers(9)}</b>
              <Ranks units={9} tone="them" label="" />
            </span>
          </div>
          <ul className="rule-list">
            <li>
              You can attack any neighbour over a land border, and by sea any shore within {SEA_RANGE_KM.toLocaleString('en-US')} km of your own coast that lies
              on a sea you already have a coast on. Ships follow the water: from the North Sea you can reach Morocco, but the Mediterranean
              only opens once you hold a coast on it. Far from everything? The nearest shores open up, so there are always at least{' '}
              {MIN_TARGETS} countries to attack.
            </li>
            <li>Every battle opens with the country's flag. After that the difficulty is shuffled: any question can be Easy, Medium or Hard.</li>
            <li>
              The siege bar on the left is the enemy's wall: a brick falls for every {soldiers(1)} enemies beaten. It shows how many right
              answers you still need, and how many mistakes you can still survive.
            </li>
            <li>
              Anything about the country can come up: its capital, borders and seas, and also its national sport, its biggest export, its
              famous people, its largest religion, the year it gained independence and even which side of the road it drives on.
            </li>
            <li className="good">
              Right answer: <b>−{soldiers(defenderKills('easy'))} enemies killed</b> (a Hard question: −{soldiers(defenderKills('hard'))}).
            </li>
            <li className="bad">
              Wrong, or too slow: <b>−{soldiers(WRONG_ANSWER_TROOP_LOSS)} of your own troops</b>.
            </li>
            <li>
              You have {QUESTION_TIMER_SECONDS} seconds a question. Across the sea it is {SEA_TIMER_SECONDS}, against a third more enemies (
              {soldiers(6)} becomes {soldiers(6 + seaBonus(6))}).
            </li>
            <li>While a question is open the map hides the surrounding country names. No peeking.</li>
          </ul>
        </article>

        <article className="rule" data-rule="spoils">
          <h2>
            <i>{next()}</i> The spoils
          </h2>
          <p>
            A conquered country joins your empire and sends you troops:{' '}
            <b>
              {soldiers(1)} for every {soldiers(DEFENDERS_PER_TROOP)} enemies it had
            </b>
            , to the last soldier: a quarter of what you beat. The bigger the fight, the bigger the reward.
          </p>
          <table className="rule-table" data-testid="rules-spoils">
            <thead>
              <tr>
                <th>Enemies</th>
                <th>You gain</th>
              </tr>
            </thead>
            <tbody>
              {spoils.map((row) => (
                <tr key={row.enemies}>
                  <td>{soldiers(row.enemies)}</td>
                  <td>+{soldiers(row.worth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="rule" data-rule="retreat">
          <h2>
            <i>{next()}</i> Retreat
          </h2>
          <p>
            Stuck on a question? <b>Retreat</b>. It costs a {RETREAT_SHARE * 100 === 25 ? 'quarter' : `${RETREAT_SHARE * 100}%`} of your army
            and your streak, but you live. The country stays wounded: the enemies you beat stay down, and {soldiers(WOUND_HEAL_PER_BATTLE)}{' '}
            return each time you attack somewhere else.
          </p>
          <p className="rule-note">Your last {soldiers(1)} cannot retreat. They fight to the end.</p>
        </article>

        <article className="rule" data-rule="empire">
          <h2>
            <i>{next()}</i> A growing empire
          </h2>
          <p>
            The world notices. For every {ESCALATION_EVERY} countries you hold, <b>every country gains {soldiers(1)} enemies</b>. The last
            conquests are the hardest, and the best paid.
          </p>
          <p className="rule-note">
            Scroll, pinch or use + and − to zoom the map, drag to move it. Answer with a click, or with 1–4 or A–D.
          </p>
        </article>

        <article className="rule" data-rule="streak">
          <h2>
            <i>{next()}</i> On a streak
          </h2>
          <p>
            Every right answer in a row adds to your <b>streak</b>. A wrong answer, running out of time or retreating sets it back to 0.
          </p>
          <p>
            Reach <b>{DECIMATE_STREAK} in a row</b> and the streak flame starts to pulse. Take the country you are fighting without another
            mistake and you earn a <b className="decimate-word">DECIMATE</b>: every target turns gold, and the one you pick falls without a
            single question, with all its spoils.
          </p>
          <p className="rule-note">It counts as a battle won and spends your streak. Use it on your next attack: it cannot be saved.</p>
        </article>

        <footer className="rules-foot">
          <button type="button" className="btn primary" onClick={onClose} data-testid="rules-close">
            Back to the map
          </button>
          <p className="rules-credit" data-testid="rules-credit">
            Created by Granit Raf
          </p>
        </footer>
      </div>
    </section>
  );
}
