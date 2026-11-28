import { useEffect, useRef, useState } from 'react';
import { passcodeMatches } from '../daily/daily';
import { sound } from '../sound';

/** A padlock in pixels: shut, or with its shackle swung open. */
function LockIcon({ open }: { open: boolean }) {
  const shackle = open ? ['..XXX...', '.X...X..', '.X......', '.X......'] : ['..XXXX..', '.X....X.', '.X....X.', '.X....X.'];
  const rows = [...shackle, 'XXXXXXXX', 'XXXooXXX', 'XXXooXXX', 'XXXXXXXX', 'XXXXXXXX'];
  return (
    <svg className="lock-icon" viewBox="0 0 8 9" shapeRendering="crispEdges" aria-hidden="true">
      {rows.flatMap((row, y) => [...row].map((cell, x) => (cell === '.' ? null : <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} className={cell === 'o' ? 'keyhole' : y < 4 ? 'shackle' : 'body'} />)))}
    </svg>
  );
}

interface LockProps {
  /** The classic game has been unlocked on this device. */
  unlocked: boolean;
  /** The classic menu is the one showing. */
  classic: boolean;
  onClick: () => void;
  /** Where it sits: over the corner of the map, or in the menu's header on a narrow screen. */
  place: 'corner' | 'menu';
}

/** The door to the classic game: a small padlock. Locked, it asks for the passcode; unlocked, it switches menus. */
export function ClassicLock({ unlocked, classic, onClick, place }: LockProps) {
  const label = !unlocked ? 'Classic game (locked)' : classic ? 'Back to the Daily Game' : 'Classic game';
  return (
    <button
      type="button"
      className={`lock-toggle ${place} ${unlocked ? 'unlocked' : ''} ${classic ? 'active' : ''}`}
      onMouseEnter={() => sound.pulse()}
      onClick={() => {
        sound.snap();
        onClick();
      }}
      aria-label={label}
      title={label}
      data-testid={place === 'corner' ? 'classic-lock' : 'classic-lock-menu'}
      data-unlocked={unlocked}
    >
      <LockIcon open={unlocked} />
      {classic && <span>Daily</span>}
    </button>
  );
}

interface GateProps {
  onUnlock: () => void;
  onClose: () => void;
}

/** Asks for the passcode to the classic game. */
export function PasscodeGate({ onUnlock, onClose }: GateProps) {
  const [typed, setTyped] = useState('');
  const [wrong, setWrong] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="gate-backdrop" role="dialog" aria-modal="true" aria-labelledby="gate-title" data-testid="passcode-gate">
      <form
        className={`gate ${wrong ? 'wrong' : ''}`}
        key={wrong}
        onSubmit={(event) => {
          event.preventDefault();
          if (passcodeMatches(typed)) {
            sound.charged();
            onUnlock();
          } else {
            sound.wrong();
            setTyped('');
            setWrong((n) => n + 1);
          }
        }}
      >
        <LockIcon open={false} />
        <h2 id="gate-title">Classic game</h2>
        <p>Choose any campaign and any starting country. Enter the passcode to unlock it.</p>
        <input
          ref={input}
          type="password"
          className="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Passcode"
          aria-label="Passcode"
          autoComplete="off"
          data-testid="passcode"
        />
        {wrong > 0 && (
          <p className="gate-error" role="alert" data-testid="passcode-error">
            Wrong passcode.
          </p>
        )}
        <div className="gate-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" data-testid="passcode-submit">
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}
