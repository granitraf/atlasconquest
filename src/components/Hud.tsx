import { useEffect, useRef, useState } from 'react';
import { flagUrl } from '../data';
import { sound } from '../sound';
import { battleProgress, soldiers, soldiersShort } from '../game/rules';
import { FlagIcon } from './FlagIcon';
import type { BattleState, Feedback, GameState } from '../game/types';

/** Pixel rows of the hardcore heart: outline, body, highlight, and the hard-eyed centre. */
const HEART = [
  '.OO.OO.',
  'OHRORRO',
  'ORRRRRO',
  'ORDRDRO',
  '.ORRRO.',
  '..ORO..',
  '...O...',
];
const HEART_COLOURS: Record<string, string> = { O: '#2a060a', R: '#e0262f', H: '#ff8a8f', D: '#7a0d14' };

/** One life, hardcore style. */
export function HardcoreHeart() {
  return (
    <svg className="heart" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
      {HEART.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={HEART_COLOURS[cell]} />,
        ),
      )}
    </svg>
  );
}

const FlameIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 1c.6 2.6 3.8 4.2 3.8 8A3.9 3.9 0 0 1 8 15a3.9 3.9 0 0 1-3.8-4c0-1.7.8-2.8 1.7-3.8.2 1 .7 1.7 1.3 2C7 6.600 6.800 3.600 8 1z" fill="currentColor" />
  </svg>
);

const TroopIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 1 2.500 3v4.500c0 3.400 2.300 6 5.500 7.500 3.200-1.500 5.500-4.100 5.500-7.500V3z" fill="currentColor" />
  </svg>
);

const SpeakerIcon = ({ muted }: { muted: boolean }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
    <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
    {muted ? (
      <path d="M11 6l4 4M15 6l-4 4" fill="none" stroke="currentColor" strokeWidth="1.500" />
    ) : (
      <path d="M11 5v6M13 3v10" fill="none" stroke="currentColor" strokeWidth="1.500" />
    )}
  </svg>
);

const GlobeIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.250" fill="none" stroke="currentColor" strokeWidth="1.500" />
    <path d="M1.750 8h12.500M8 1.750c-2.600 2-2.600 10.500 0 12.500M8 1.750c2.600 2 2.600 10.500 0 12.500" fill="none" stroke="currentColor" strokeWidth="1.300" />
  </svg>
);

interface TopBarProps {
  state: GameState;
  total: number;
  onQuit: () => void;
}

export function TopBar({ state, total, onQuit }: TopBarProps) {
  const [confirming, setConfirming] = useState(false);
  const [muted, setMuted] = useState(() => sound.isMuted());
  const toggleSound = () => {
    const next = !muted;
    sound.setMuted(next);
    setMuted(next);
    if (!next) sound.select();
  };
  const phaseLabel =
    state.phase === 'recruit' ? 'Recruit' : state.phase === 'attack' ? 'Choose a target' : state.phase === 'battle' ? `Battle ${state.battles}` : '';

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="brand" data-testid="empire-brand">
          <FlagIcon flag={state.empire.flag} scale={3} />
          <span>{state.empire.name}</span>
        </span>
        {phaseLabel && (
          <span className="turn-chip" data-testid="phase-chip">
            <b>{phaseLabel}</b>
          </span>
        )}
        {confirming ? (
          <span className="quit-confirm">
            Abandon game?
            <button type="button" className="link danger" onClick={onQuit}>
              Yes, quit
            </button>
            <button type="button" className="link" onClick={() => setConfirming(false)}>
              No
            </button>
          </span>
        ) : (
          <button type="button" className="link quit" onClick={() => setConfirming(true)}>
            New game
          </button>
        )}
      </div>
      <div className="stats" aria-label="Your status">
        <button
          type="button"
          className={`stat sound-toggle ${muted ? 'off' : ''}`}
          onClick={toggleSound}
          aria-pressed={!muted}
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          title={muted ? 'Sound is off' : 'Sound is on'}
          data-testid="sound-toggle"
        >
          <SpeakerIcon muted={muted} />
        </button>
        <div className="stat lives" title="Hardcore: one life. Lose a battle and the game is over." data-testid="lives" data-value={state.lives}>
          <HardcoreHeart />
          <span className="lives-text">1 heart</span>
        </div>
        <div
          className={`stat streak ${state.streak >= 5 ? 'hot' : ''}`}
          title={`Streak: ${state.streak} correct in a row.`}
          data-testid="streak"
          data-value={state.streak}
        >
          <FlameIcon />
          <span className="stat-value">{state.streak}</span>
        </div>
        <div className="stat troops" title="Your army. After the opening recruit phase, new troops come only from conquering countries." data-testid="troops" data-value={state.troops}>
          <TroopIcon />
          <span className="stat-value">
            <Soldiers units={state.troops} />
          </span>
          <span className="stat-label">troops</span>
        </div>
        <div className="stat countries" title="Countries owned" data-testid="countries" data-value={state.owned.length}>
          <GlobeIcon />
          <span className="stat-value">
            {state.owned.length}
            <small>/{total}</small>
          </span>
        </div>
      </div>
    </header>
  );
}

/**
 * A number of troops or defenders. Written out in full ("20,000"), with a short
 * form ("20k") that the stylesheet swaps in where there is no room for it.
 */
function Soldiers({ units }: { units: number }) {
  return (
    <>
      <span className="num-full">{soldiers(units)}</span>
      <span className="num-short">{soldiersShort(units)}</span>
    </>
  );
}

/** Number that briefly shows how much it just changed by. */
function Delta({ value, seq }: { value: number; seq: number }) {
  if (value === 0) return null;
  return (
    <span key={seq} className="delta">
      {value > 0 ? `+${soldiers(value)}` : `−${soldiers(-value)}`}
    </span>
  );
}

interface TugProps {
  troops: number;
  battle: BattleState;
  feedback: Feedback | null;
  targetName: string;
  /** The target's flag, shown once the battle's opening flag question has been asked. */
  targetFlag: string | null;
  /** Changes on every answer, to restart the delta animations. */
  seq: number;
}

/** Top bar: player troops in green pushing against defenders in red. */
export function TugOfWar({ troops, battle, feedback, targetName, targetFlag, seq }: TugProps) {
  const total = troops + battle.defenders;
  const share = total > 0 ? (troops / total) * 100 : 50;
  return (
    <div className="tug" role="group" aria-label={`You have ${soldiers(troops)} troops against ${soldiers(battle.defenders)} defenders`}>
      <div className="tug-side you">
        <span className="tug-name">You</span>
        <span className="tug-count" data-testid="battle-troops" data-value={troops}>
          <Soldiers units={troops} />
          {feedback && <Delta value={-feedback.troopsLost} seq={seq} />}
        </span>
      </div>
      <div className="tug-track">
        <div className="tug-fill you" style={{ width: `${share}%` }} />
        <div className="tug-fill them" style={{ width: `${100 - share}%` }} />
        <div className="tug-knot" style={{ left: `${share}%` }} />
      </div>
      <div className="tug-side them">
        <span className="tug-count" data-testid="battle-defenders" data-value={battle.defenders}>
          <Soldiers units={battle.defenders} />
          {feedback && <Delta value={-feedback.defendersKilled} seq={seq} />}
        </span>
        <span className="tug-name">
          {targetFlag && <img className="px-flag" src={flagUrl(targetFlag)} alt="" />}
          {targetName}
        </span>
      </div>
    </div>
  );
}

interface ProgressProps {
  troops: number;
  battle: BattleState;
  feedback: Feedback | null;
  seq: number;
  top: number;
  bottom: number;
  /** Height of the screen, to know how much room the bar has between `top` and `bottom`. */
  viewHeight: number;
}

/** Below this much room the bar shows its percentage only; below PROGRESS_MIN_ROOM it steps aside altogether. */
const PROGRESS_FULL_ROOM = 150;
const PROGRESS_MIN_ROOM = 56;

/** Left bar: fills as defenders fall, and drops when a wrong answer costs troops. */
export function BattleProgress({ troops, battle, feedback, seq, top, bottom, viewHeight }: ProgressProps) {
  const room = viewHeight - top - bottom;
  // On a short screen the question card leaves no space for it; the bar across the top already tells the story.
  if (room < PROGRESS_MIN_ROOM) return null;
  const compact = room < PROGRESS_FULL_ROOM;
  const progress = battleProgress(battle.defenders, battle.maxDefenders, troops, battle.startTroops);
  const percent = Math.round(progress * 100);
  const hit = feedback !== null && !feedback.correct;
  const eliminated = battle.maxDefenders - battle.defenders;
  return (
    <div
      className={`progress ${compact ? 'compact' : ''} ${hit ? 'hit' : ''} ${feedback?.correct ? 'gain' : ''}`}
      style={{ top, bottom }}
      role="progressbar"
      aria-label="Battle progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      data-testid="battle-progress"
      data-value={percent}
      key={hit ? `hit-${seq}` : 'steady'}
    >
      <span className="progress-title">Battle</span>
      <span className="progress-label">{percent}%</span>
      <div className="progress-track">
        <div className="progress-fill" style={{ height: `${percent}%` }} />
        {Array.from({ length: battle.maxDefenders - 1 }, (_, i) => (
          <span key={i} className="progress-tick" style={{ bottom: `${((i + 1) / battle.maxDefenders) * 100}%` }} />
        ))}
      </div>
      <span className="progress-caption">
        {soldiersShort(eliminated)}/{soldiersShort(battle.maxDefenders)}
      </span>
    </div>
  );
}

export interface ToastMessage {
  seq: number;
  tone: 'good' | 'bad' | 'info';
  title: string;
  detail?: string;
}

export function Toast({ message, top }: { message: ToastMessage | null; top: number }) {
  const [visible, setVisible] = useState<ToastMessage | null>(null);
  const latest = useRef(message);
  latest.current = message;
  const seq = message?.seq ?? null;
  useEffect(() => {
    if (seq === null) {
      setVisible(null);
      return;
    }
    setVisible(latest.current);
    const timer = window.setTimeout(() => setVisible(null), 4200);
    return () => window.clearTimeout(timer);
  }, [seq]);
  if (!visible) return null;
  return (
    <div className={`toast ${visible.tone}`} style={{ top }} role="status" key={visible.seq}>
      <strong>{visible.title}</strong>
      {visible.detail && <span>{visible.detail}</span>}
    </div>
  );
}

/** Full-screen green or red flash on each answer. */
export function AnswerFlash({ feedback, seq }: { feedback: Feedback | null; seq: number }) {
  if (!feedback) return null;
  return <div key={seq} className={`flash ${feedback.correct ? 'good' : 'bad'}`} aria-hidden="true" />;
}
