import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameData } from '../data';
import type { Empire } from '../game/flag';
import { START_LABELS, START_TROOPS, soldiers, startDifficulty } from '../game/rules';
import { sound } from '../sound';
import { FlagIcon } from './FlagIcon';
import { EmpireDesigner, StartHead, nameBlocksStart } from './StartParts';
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
  /** Extra buttons for the row of doors in the header (the lock, on narrow screens). */
  doors?: ReactNode;
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

export function StartScreen({ data, mode, selectedId, empire, onEmpire, onMode, onSelect, onStart, onRules, onLeaderboard, doors }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'All' | StartLabel>('All');
  const world = data.worlds[mode];
  const nameBlocks = nameBlocksStart(empire.name);
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
    <aside className="start" data-testid="start-screen" data-mode="classic">
      <StartHead onRules={onRules} onLeaderboard={onLeaderboard}>
        {doors}
      </StartHead>

      <EmpireDesigner empire={empire} onEmpire={onEmpire} />

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
                onDoubleClick={() => !nameBlocks && onStart(country.id)}
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
          disabled={!selected || nameBlocks}
          onMouseEnter={() => sound.pulse()}
          onClick={() => selected && !nameBlocks && onStart(selected.country.id)}
          data-testid="begin"
        >
          Begin conquest
        </button>
      </div>
    </aside>
  );
}
