import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DailyRecord, GameData } from '../data';
import { DAILY_ORDER, countdown, dayLabel } from '../daily/daily';
import type { Empire } from '../game/flag';
import { START_TROOPS, soldiers } from '../game/rules';
import { formatScore } from '../leaderboard';
import type { CountryShape } from '../map/geo';
import { sound } from '../sound';
import { EmpireDesigner, StartHead, nameBlocksStart } from './StartParts';

/** The reel's window, in its own pixels: drawn small and scaled up without smoothing. */
const REEL_W = 84;
const REEL_H = 56;
/** How many countries flash past before the reel lands, and how long a step takes at its start and end. */
const REEL_STEPS = 44;
const REEL_FAST_MS = 45;
const REEL_SLOW_MS = 340;
/** How long the landed country is shown before the game begins. */
const REEL_HOLD_MS = 1500;

/** A country's outline as the reel shows it: hard pixels, gold on dark, scaled up without smoothing. */
function ReelShape({ shape, landed }: { shape: CountryShape | null; landed: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, REEL_W, REEL_H);
    if (!shape) return;
    const [[x0, y0], [x1, y1]] = shape.bounds;
    const scale = Math.min((REEL_W - 8) / Math.max(x1 - x0, 0.01), (REEL_H - 8) / Math.max(y1 - y0, 0.01));
    ctx.setTransform(scale, 0, 0, scale, (REEL_W - (x1 - x0) * scale) / 2 - x0 * scale, (REEL_H - (y1 - y0) * scale) / 2 - y0 * scale);
    ctx.fillStyle = '#000';
    ctx.fill(new Path2D(shape.d));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Snap the soft edge to whole pixels: a bright outline round a darker fill.
    const image = ctx.getImageData(0, 0, REEL_W, REEL_H);
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < REEL_W && y < REEL_H && image.data[(y * REEL_W + x) * 4 + 3] > 110;
    const out = ctx.createImageData(REEL_W, REEL_H);
    let drawn = 0;
    for (let y = 0; y < REEL_H; y++) {
      for (let x = 0; x < REEL_W; x++) {
        if (!inside(x, y)) continue;
        drawn++;
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        const [r, g, b] = edge ? (landed ? [255, 240, 184] : [255, 207, 74]) : landed ? ((x + y) % 2 ? [61, 220, 132] : [47, 191, 112]) : (x + y) % 2 ? [168, 118, 15] : [200, 150, 28];
        out.data.set([r, g, b, 255], (y * REEL_W + x) * 4);
      }
    }
    // A country too small to leave a mark on the grid still gets a dot, so the reel is never blank.
    if (drawn === 0) {
      for (let y = REEL_H / 2 - 1; y <= REEL_H / 2; y++) for (let x = REEL_W / 2 - 1; x <= REEL_W / 2; x++) out.data.set(landed ? [61, 220, 132, 255] : [255, 207, 74, 255], (y * REEL_W + x) * 4);
    }
    ctx.putImageData(out, 0, 0);
  }, [shape, landed]);
  return <canvas ref={ref} className="reel-shape" width={REEL_W} height={REEL_H} aria-hidden="true" />;
}

interface Props {
  data: GameData;
  /** Today in the daily game's time zone, and the country everyone starts from. */
  day: string;
  countryId: string;
  /** Seconds until the next day's country. */
  secondsLeft: number;
  /** What this device has done with today's game; null if nothing yet. */
  record: DailyRecord | null;
  empire: Empire;
  onEmpire: (empire: Empire) => void;
  /** The reel has landed: show the country on the map. */
  onReveal: (id: string) => void;
  /** Begin today's conquest from its country. */
  onBegin: (id: string) => void;
  onRules: () => void;
  onLeaderboard: () => void;
  /** Extra buttons for the row of doors in the header (the lock, on narrow screens). */
  doors?: ReactNode;
}

/**
 * The start menu of the Daily Game. There is nothing to choose but the empire: the day's country is the
 * same for everyone, and a slot-machine reel of country outlines spins through the world and lands on it.
 */
export function DailyStart({ data, day, countryId, secondsLeft, record, empire, onEmpire, onReveal, onBegin, onRules, onLeaderboard, doors }: Props) {
  const [reel, setReel] = useState<{ id: string | null; phase: 'idle' | 'spinning' | 'landed' }>({ id: null, phase: 'idle' });
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  // A new day while the menu is open: the reel goes back to its question mark.
  useEffect(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setReel({ id: null, phase: 'idle' });
  }, [day]);

  const finished = record?.day === day ? (record.finished ?? null) : null;
  const nameBlocks = nameBlocksStart(empire.name);
  const country = data.byId[countryId];
  const shown = reel.id ? data.byId[reel.id] : null;

  const spin = () => {
    if (reel.phase !== 'idle' || finished || nameBlocks || !country) return;
    const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // A run of countries from all over the world, ending on today's.
    const pool = DAILY_ORDER.filter((id) => id !== countryId && data.geometry.byId[id]);
    const steps = reducedMotion ? [] : Array.from({ length: REEL_STEPS }, () => pool[Math.floor(Math.random() * pool.length)]);
    let at = 0;
    steps.forEach((id, i) => {
      // Fast at first, slowing to a crawl, like a reel running down.
      at += REEL_FAST_MS + (REEL_SLOW_MS - REEL_FAST_MS) * (i / steps.length) ** 3;
      timers.current.push(
        window.setTimeout(() => {
          setReel({ id, phase: 'spinning' });
          sound.reel();
        }, at),
      );
    });
    setReel({ id: steps[0] ?? null, phase: 'spinning' });
    timers.current.push(
      window.setTimeout(() => {
        setReel({ id: countryId, phase: 'landed' });
        sound.zoom();
        onReveal(countryId);
      }, at + REEL_SLOW_MS),
      window.setTimeout(() => onBegin(countryId), at + REEL_SLOW_MS + REEL_HOLD_MS),
    );
  };

  return (
    <aside className="start daily" data-testid="start-screen" data-mode="daily">
      <StartHead onRules={onRules} onLeaderboard={onLeaderboard}>
        {doors}
      </StartHead>

      <EmpireDesigner empire={empire} onEmpire={onEmpire} />

      <div className="start-section grow daily-section" data-testid="daily" data-day={day} data-phase={finished ? 'finished' : reel.phase}>
        <h2>
          Today's conquest <small>{dayLabel(day)}</small>
        </h2>
        <div className={`reel ${reel.phase}`} data-testid="reel" data-country={reel.phase === 'landed' ? countryId : ''}>
          <div className="reel-window">
            {finished ? (
              <ReelShape shape={data.geometry.byId[countryId] ?? null} landed />
            ) : reel.id ? (
              <ReelShape shape={data.geometry.byId[reel.id] ?? null} landed={reel.phase === 'landed'} />
            ) : (
              <span className="reel-mystery" aria-hidden="true">
                ?
              </span>
            )}
          </div>
          <p className="reel-name" data-testid="reel-name" aria-live="polite">
            {finished ? country?.name : reel.phase === 'idle' ? 'Where will you rise from?' : shown?.name}
          </p>
        </div>
        {finished ? (
          <div className="daily-result" data-testid="daily-result">
            <strong>{finished.outcome === 'victory' ? 'The world is yours.' : "Today's conquest is over."}</strong>
            <span>
              Score <b>{formatScore(finished.score)}</b> · {finished.conquered} {finished.conquered === 1 ? 'country' : 'countries'} conquered
            </span>
          </div>
        ) : (
          <p className="hint">
            One country a day, the same for everyone. {soldiers(START_TROOPS)} troops, one life, one attempt.
          </p>
        )}
      </div>

      <div className="start-foot">
        <p className="daily-clock" data-testid="daily-clock">
          {finished ? 'Next conquest in' : 'A new country in'} <b>{countdown(secondsLeft)}</b>
        </p>
        {finished ? (
          <button
            type="button"
            className="btn primary big"
            onMouseEnter={() => sound.pulse()}
            onClick={() => {
              sound.snap();
              onLeaderboard();
            }}
            data-testid="daily-leaderboard"
          >
            Today's leaderboard
          </button>
        ) : (
          <button type="button" className="btn primary big" disabled={reel.phase !== 'idle' || nameBlocks} onMouseEnter={() => sound.pulse()} onClick={spin} data-testid="begin">
            {reel.phase === 'idle' ? 'Begin conquest' : reel.phase === 'spinning' ? 'Spinning…' : `${country?.name}!`}
          </button>
        )}
      </div>
    </aside>
  );
}
