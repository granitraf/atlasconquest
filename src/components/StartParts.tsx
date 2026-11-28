import { useState, type ReactNode } from 'react';
import { FLAG_COLOURS, FLAG_PATTERNS, type Empire } from '../game/flag';
import { EMPIRE_NAME_MAX, EMPIRE_NAME_MIN, typedName, validateEmpireName } from '../names/validateEmpireName';
import { sound } from '../sound';
import { FlagIcon } from './FlagIcon';
import { Logo } from './Logo';

// The parts of the start menu that the Daily Game and the classic game share: the title with its doors
// to the rule book and the leaderboard, and the empire designer.

/** An empty name is fine (the empire is named after its home country); any other name must pass. */
export function nameBlocksStart(name: string): boolean {
  const check = validateEmpireName(name);
  return !check.valid && check.reason !== 'empty';
}

interface HeadProps {
  /** Opens the rule book. (On narrow screens this panel covers the map, and the button above the map with it.) */
  onRules: () => void;
  /** Opens the leaderboard, the same way. */
  onLeaderboard: () => void;
  /** Anything else for the row of doors: the lock, on narrow screens. */
  children?: ReactNode;
}

export function StartHead({ onRules, onLeaderboard, children }: HeadProps) {
  return (
    <div className="start-head">
      <h1>
        Atlas <span>Conquest</span>
        <Logo />
      </h1>
      <p className="tagline">Conquer the map. Geography knowledge is your army.</p>
      <div className="start-doors">
        <button
          type="button"
          className="btn primary rules-open"
          onMouseEnter={() => sound.pulse()}
          onClick={() => {
            sound.snap();
            onRules();
          }}
          data-testid="rules-open"
        >
          Rules
        </button>
        <button
          type="button"
          className="btn primary rules-open"
          onMouseEnter={() => sound.pulse()}
          onClick={() => {
            sound.snap();
            onLeaderboard();
          }}
          data-testid="leaderboard-open"
        >
          Leaderboard
        </button>
        {children}
      </div>
    </div>
  );
}

interface DesignerProps {
  empire: Empire;
  onEmpire: (empire: Empire) => void;
}

/** Name the empire and design its flag. */
export function EmpireDesigner({ empire, onEmpire }: DesignerProps) {
  /** Which of the flag's three colours the palette is currently changing. */
  const [slot, setSlot] = useState(0);
  const setFlag = (flag: Partial<Empire['flag']>) => {
    sound.select();
    onEmpire({ ...empire, flag: { ...empire.flag, ...flag } });
  };
  const setColour = (colour: string) => {
    const colours = [...empire.flag.colours] as Empire['flag']['colours'];
    colours[slot] = colour;
    setFlag({ colours });
  };
  const nameCheck = validateEmpireName(empire.name);
  const nameBlocks = nameBlocksStart(empire.name);
  return (
    <div className="start-section empire" data-testid="empire">
      <h2>Your empire</h2>
      <div className="empire-row">
        <FlagIcon flag={empire.flag} scale={8} className="empire-preview" label="Your flag" />
        <div className="empire-fields">
          <input
            type="text"
            className="search empire-name"
            placeholder="Name your empire"
            value={empire.name}
            maxLength={EMPIRE_NAME_MAX}
            // Anything but letters, apostrophes and single spaces never reaches the field.
            onChange={(e) => onEmpire({ ...empire, name: typedName(e.target.value) })}
            aria-label="Empire name"
            aria-describedby="empire-name-hint"
            aria-invalid={nameBlocks}
            data-testid="empire-name"
            autoComplete="off"
            spellCheck={false}
          />
          {nameCheck.reason === 'not_allowed' ? (
            <p id="empire-name-hint" className="name-hint bad" role="alert" data-testid="name-warning">
              That name isn't allowed. Try another.
            </p>
          ) : (
            <p id="empire-name-hint" className={`name-hint ${nameBlocks ? 'bad' : ''}`} data-testid="name-hint">
              Letters and apostrophes, {EMPIRE_NAME_MIN} to {EMPIRE_NAME_MAX} characters
            </p>
          )}
          <div className="flag-colours">
            <div className="slots" role="radiogroup" aria-label="Which flag colour to change">
              {empire.flag.colours.map((colour, i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={slot === i}
                  aria-label={`Flag colour ${i + 1}`}
                  className={`slot ${slot === i ? 'active' : ''}`}
                  style={{ background: colour }}
                  onClick={() => {
                    sound.select();
                    setSlot(i);
                  }}
                  data-testid={`slot-${i}`}
                />
              ))}
            </div>
            <div className="palette" role="group" aria-label="Colours">
              {FLAG_COLOURS.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  aria-label={`Use colour ${colour}`}
                  aria-pressed={empire.flag.colours[slot] === colour}
                  className={`colour ${empire.flag.colours[slot] === colour ? 'active' : ''}`}
                  style={{ background: colour }}
                  onClick={() => setColour(colour)}
                  data-testid={`colour-${colour.slice(1)}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flag-presets" role="radiogroup" aria-label="Flag design">
        {FLAG_PATTERNS.map((pattern, i) => (
          <button
            key={pattern.name}
            type="button"
            role="radio"
            aria-checked={empire.flag.pattern === i}
            aria-label={pattern.name}
            title={pattern.name}
            className={`preset ${empire.flag.pattern === i ? 'active' : ''}`}
            onClick={() => setFlag({ pattern: i })}
            data-testid={`flag-${i}`}
          >
            <FlagIcon flag={{ pattern: i, colours: empire.flag.colours }} fluid />
          </button>
        ))}
      </div>
    </div>
  );
}
