import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameData } from '../data';
import { EMPIRE_NAME_MAX, FLAG_COLOURS, FLAG_PATTERNS, cleanEmpireName, type Empire } from '../game/flag';
import { nameAllowed } from '../game/names';
import { START_LABELS, START_TROOPS, soldiers, startDifficulty } from '../game/rules';
import { sound } from '../sound';
import { FlagIcon } from './FlagIcon';
import { Logo } from './Logo';
import { MODES, type ModeId, type StartLabel } from '../game/types';

interface Props {
  data: GameData;
  mode: ModeId;
  selectedId: string | null;
  empire: Empire;
  onEmpire: (empire: Empire) => void;
  onMode: (mode: ModeId) => void;
  onSelect: (id: string | null) => void;
  onStart: (id: string) => void;
  /** Opens the rule book. (On narrow screens this panel covers the map, and the button above the map with it.) */
  onRules: () => void;
  /** Opens the leaderboard, the same way. */
  onLeaderboard: () => void;
}

const FILTERS: ('All' | StartLabel)[] = ['All', ...START_LABELS];
const slug = (label: string) => label.toLowerCase().replace(/\s+/g, '-');
/** Short labels so the seven campaigns fit on two rows of buttons. */
const MODE_LABEL: Partial<Record<ModeId, string>> = { 'North America': 'N. America', 'South America': 'S. America' };
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function StartScreen({ data, mode, selectedId, empire, onEmpire, onMode, onSelect, onStart, onRules, onLeaderboard }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'All' | StartLabel>('All');
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
  const world = data.worlds[mode];
  const listRef = useRef<HTMLUListElement>(null);

  const rows = useMemo(
    () =>
      world.ids
        .map((id) => ({ country: world.byId[id], difficulty: startDifficulty(world, id) }))
        .sort((a, b) => a.country.name.localeCompare(b.country.name)),
    [world],
  );
  const needle = fold(query.trim());
  const visible = rows.filter(
    ({ country, difficulty }) =>
      (filter === 'All' || difficulty.label === filter) &&
      (needle === '' || fold(country.name).includes(needle) || fold(country.capital).includes(needle)),
  );
  const selected = selectedId ? rows.find((r) => r.country.id === selectedId) : undefined;

  // When a country is picked on the map, bring its row into view.
  useEffect(() => {
    if (!selectedId) return;
    listRef.current?.querySelector(`[data-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  return (
    <aside className="start" data-testid="start-screen">
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
        </div>
      </div>

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
              onChange={(e) => onEmpire({ ...empire, name: e.target.value })}
              aria-label="Empire name"
              data-testid="empire-name"
              autoComplete="off"
              spellCheck={false}
            />
            {!nameAllowed(cleanEmpireName(empire.name)) && (
              <p className="name-warning" role="alert" data-testid="name-warning">
                That name is not allowed. Your empire will be named after its home country.
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

      <div className="start-section">
        <h2>Campaign</h2>
        <div className="modes" role="radiogroup" aria-label="Game mode">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={m === mode}
              aria-label={`${m}, ${data.worlds[m].ids.length} countries`}
              className={`mode ${m === mode ? 'active' : ''}`}
              onClick={() => {
                // The campaign is announced by name: "North America", not the short label on the button.
                sound.say(m);
                onMode(m);
              }}
              data-testid={`mode-${m}`}
            >
              {MODE_LABEL[m] ?? m}
              <small>{data.worlds[m].ids.length}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="start-section grow">
        <h2>Starting country</h2>
        <div className="search-row">
          <input
            type="search"
            className="search"
            placeholder={`Search ${rows.length} countries…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search starting countries"
            data-testid="search"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="filters" role="group" aria-label="Filter by difficulty">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className={`filter ${slug(f)} ${f === filter ? 'active' : ''}`}
                aria-pressed={f === filter}
                onClick={() => {
                  sound.select();
                  setFilter(f);
                }}
                data-testid={`filter-${slug(f)}`}
              >
                {f}
                {f !== 'All' && <small>{rows.filter((r) => r.difficulty.label === f).length}</small>}
              </button>
            ))}
          </div>
        </div>
        <ul className="country-list" ref={listRef} data-testid="country-list">
          {visible.map(({ country, difficulty }) => (
            <li key={country.id}>
              <button
                type="button"
                className={`country-row ${country.id === selectedId ? 'active' : ''}`}
                onMouseEnter={() => sound.pulse()}
                onClick={() => {
                  sound.zoom();
                  onSelect(country.id);
                }}
                onDoubleClick={() => onStart(country.id)}
                data-id={country.id}
                data-testid={`start-${country.id}`}
                data-difficulty={difficulty.label}
              >
                <span className="country-text">
                  <span className="country-name">{country.name}</span>
                  <span className="country-reason">{difficulty.reason}</span>
                </span>
                <span className={`badge ${slug(difficulty.label)}`}>
                  {difficulty.label} <b>×{difficulty.multiplier}</b>
                </span>
              </button>
            </li>
          ))}
          {visible.length === 0 && <li className="empty">No country matches “{query.trim()}”{filter !== 'All' ? ` at ${filter} difficulty` : ''}.</li>}
        </ul>
      </div>

      <div className="start-foot">
        {selected ? (
          <div className="pick" data-testid="pick">
            <FlagIcon flag={empire.flag} scale={4} />
            <div>
              <strong>{selected.country.name}</strong>
              <span>
                {selected.difficulty.label} ×{selected.difficulty.multiplier} · {selected.difficulty.reason}
              </span>
            </div>
          </div>
        ) : (
          <p className="hint">
            Choose where your conquest begins. Every start gets {soldiers(START_TROOPS)} troops and a single life.
          </p>
        )}
        <button
          type="button"
          className="btn primary big"
          disabled={!selected}
          onMouseEnter={() => sound.pulse()}
          onClick={() => selected && onStart(selected.country.id)}
          data-testid="begin"
        >
          Begin conquest
        </button>
      </div>
    </aside>
  );
}
