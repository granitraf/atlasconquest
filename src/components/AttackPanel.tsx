import { DEFENDERS_PER_TROOP, SEA_TIMER_SECONDS, WOUND_HEAL_PER_BATTLE, conquestTroops, soldiers } from '../game/rules';
import { sound } from '../sound';
import type { Country, Targets } from '../game/types';

interface Props {
  targets: Targets;
  byId: Record<string, Country>;
  /** Extra defenders every country has because of the size of the player's empire. */
  escalation: number;
  /** Defenders a target has at full strength, and how many are standing if it is wounded. */
  strength: (id: string, sea: boolean) => { full: number; standing: number };
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAttack: (id: string) => void;
}

const troopsText = (troops: number) => `+${soldiers(troops)} troops`;

/** Between battles: pick a target (on the map or from the list) and attack it. */
export function AttackPanel({ targets, byId, escalation, strength, selectedId, onSelect, onAttack }: Props) {
  const selected = selectedId ? byId[selectedId] : null;
  const selectedSea = selectedId ? targets.sea.includes(selectedId) : false;
  const selectedStrength = selected ? strength(selected.id, selectedSea) : null;
  // A conquest pays for the country's full strength, wounded or not.
  const selectedReward = selectedStrength ? conquestTroops(selectedStrength.full) : 0;
  const byName = (a: string, b: string) => byId[a].name.localeCompare(byId[b].name);
  const land = [...targets.land].sort(byName);
  const sea = [...targets.sea].sort(byName);

  return (
    <section className="card attack" data-testid="attack-panel">
      <div className="card-head">
        <span className="chip context">Choose a target</span>
        <span className="legend">
          <i className="swatch land" /> land border
          <i className="swatch sea" /> sea crossing
        </span>
      </div>

      {selected ? (
        <div className="target" data-testid="target-card">
          <div className="target-info">
            <h2>{selected.name}</h2>
            <p data-standing={selectedStrength?.standing} data-full={selectedStrength?.full}>
              <b>{selectedStrength && soldiers(selectedStrength.standing)}</b>
              {selectedStrength && selectedStrength.standing < selectedStrength.full ? (
                <>
                  {' '}
                  of {soldiers(selectedStrength.full)} defenders{' '}
                  <em className="wounded">wounded, +{soldiers(WOUND_HEAL_PER_BATTLE)} back each time you attack elsewhere</em>
                </>
              ) : (
                ' defenders'
              )}
              {selectedSea ? ` · sea crossing (more defenders, ${SEA_TIMER_SECONDS}s per question)` : ' · land attack'}
            </p>
            <p className="target-reward" data-testid="target-reward" data-troops={selectedReward}>
              <b className="gain">{troopsText(selectedReward)} when it falls</b> · 1 troop for every {DEFENDERS_PER_TROOP} defenders
            </p>
          </div>
          <div className="target-actions">
            <button type="button" className="btn ghost" onClick={() => onSelect(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                sound.attack();
                onAttack(selected.id);
              }}
              data-testid="attack-button"
            >
              Attack
            </button>
          </div>
        </div>
      ) : (
        <p className="hint lead">
          Pick a highlighted country on the map or from the list to attack. Recruiting is over: new troops come only from
          conquests, 1 for every {DEFENDERS_PER_TROOP} defenders the country has.
        </p>
      )}

      <div className="target-list" role="list" aria-label="Attackable countries">
        {land.map((id) => (
          <TargetChip key={id} country={byId[id]} sea={false} strength={strength(id, false)} active={id === selectedId} onSelect={onSelect} />
        ))}
        {sea.map((id) => (
          <TargetChip key={id} country={byId[id]} sea strength={strength(id, true)} active={id === selectedId} onSelect={onSelect} />
        ))}
      </div>

      <div className="card-foot">
        <p className="hint">
          {land.length} by land · {sea.length} by sea
          {escalation > 0 && ` · every country +${soldiers(escalation)} defenders (your empire's size)`}
          {targets.seaFallback && sea.length > 0 ? ' (few shores within 2,500 km: the nearest ones beyond are open too)' : ''}
        </p>
      </div>
    </section>
  );
}

function TargetChip({
  country,
  sea,
  strength,
  active,
  onSelect,
}: {
  country: Country;
  sea: boolean;
  strength: { full: number; standing: number };
  active: boolean;
  onSelect: (id: string | null) => void;
}) {
  const reward = conquestTroops(strength.full);
  return (
    <button
      type="button"
      role="listitem"
      className={`target-chip ${sea ? 'sea' : 'land'} ${active ? 'active' : ''} ${strength.standing < strength.full ? 'wounded' : ''}`}
      onMouseEnter={() => sound.pulse()}
      onClick={() => {
        sound.snap();
        onSelect(active ? null : country.id);
      }}
      data-testid={`target-${country.id}`}
      data-kind={sea ? 'sea' : 'land'}
      data-standing={strength.standing}
      data-full={strength.full}
      data-reward={reward}
      title={`${country.name}: ${soldiers(strength.standing)}${strength.standing < strength.full ? ` of ${soldiers(strength.full)}` : ''} defenders${sea ? ', by sea' : ''}. Worth ${troopsText(reward)} when it falls.`}
    >
      <span className="chip-name">{country.name}</span>
      <b>
        {soldiers(strength.standing)}
        {strength.standing < strength.full && <small>/{soldiers(strength.full)}</small>}
      </b>
      <i className="chip-gain">+{soldiers(reward)}</i>
    </button>
  );
}
