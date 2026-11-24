import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttackPanel } from './components/AttackPanel';
import { EndScreen } from './components/EndScreen';
import { AnswerFlash, BattleProgress, Toast, TopBar, TugOfWar, type ToastMessage } from './components/Hud';
import { QuestionCard } from './components/QuestionCard';
import { Leaderboard } from './components/Leaderboard';
import { Rules } from './components/Rules';
import { StartScreen } from './components/StartScreen';
import { BLAST_MS, WorldMap, type CountryStatus, type FocusRequest, type MapPadding, type TooltipInfo, type TooltipPart } from './components/WorldMap';
import { loadEmpire, loadGameData, loadMemory, loadSave, runIdFor, saveEmpire, saveMemory, writeSave, type GameData } from './data';
import { defaultEmpireName, type Empire } from './game/flag';
import { validateEmpireName } from './names/validateEmpireName';
import { runRecord } from './leaderboard';
import { CONTINENT_BONUS, DECIMATE_STREAK, SEA_TIMER_SECONDS, canRetreat, conquestTroops, escalation, getTargets, isLastStand, lanesNeeded, retreatCost, soldiers, startDifficulty } from './game/rules';
import { sound, soundLog } from './sound';
import { createGame, gameStats, reduce, targetStrength, type Action } from './game/state';
import type { GameState, ModeId, Targets } from './game/types';
import { WORLD_BOUNDS, unionBounds, type Bounds } from './map/geo';

const NO_TARGETS: Targets = { land: [], sea: [], seaFallback: false };
/** How long "[ LOCATION LOCKED ]" flickers before a DECIMATE strikes. */
const LOCK_MS = 1100;

export function App() {
  const [data, setData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadGameData()
      .then((loaded) => alive && setData(loaded))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <div className="splash" role="alert">
        <h1>Atlas Conquest</h1>
        <p>The game data could not be loaded.</p>
        <p className="splash-detail">{error}</p>
        <button type="button" className="btn primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="splash" role="status">
        <h1>Atlas Conquest</h1>
        <p className="loading">Unrolling the map…</p>
      </div>
    );
  }
  return <Game data={data} />;
}

/** Tracks an element's rendered height, so the map camera can avoid whatever covers it. */
function useMeasuredHeight(): [(el: HTMLElement | null) => void, number] {
  const [height, setHeight] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) {
      setHeight(0);
      return;
    }
    const measure = () => setHeight(Math.round(el.getBoundingClientRect().height));
    observer.current = new ResizeObserver(measure);
    observer.current.observe(el);
    measure();
  }, []);
  return [ref, height];
}

function Game({ data }: { data: GameData }) {
  const [game, setGame] = useState<GameState | null>(() => loadSave(data));
  const [mode, setMode] = useState<ModeId>('World');
  const [startId, setStartId] = useState<string | null>(null);
  const [empire, setEmpire] = useState<Empire>(loadEmpire);
  useEffect(() => saveEmpire(empire), [empire]);
  /** The rule book or the leaderboard, either of which takes the place of the map on the start screen. */
  const [panel, setPanel] = useState<'rules' | 'leaderboard' | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);
  const [targetId, setTargetId] = useState<string | null>(null);
  /** A DECIMATE under way: the target is locked on, then blown up, then taken. */
  const [decimating, setDecimating] = useState<{ id: string; stage: 'lock' | 'blast' } | null>(null);
  const decimateTimers = useRef<number[]>([]);
  useEffect(() => () => decimateTimers.current.forEach((timer) => window.clearTimeout(timer)), []);
  /** Set when a target is chosen from the list, so the camera goes and finds it. */
  const [targetFocus, setTargetFocus] = useState<string | null>(null);
  const [topRef, topHeight] = useMeasuredHeight();
  const [dockRef, dockHeight] = useMeasuredHeight();
  const [tugRef, tugHeight] = useMeasuredHeight();
  /** Events up to this sequence number were seen before a reload; do not toast them again. */
  const seenSeq = useRef(game?.eventSeq ?? 0);

  const world = data.worlds[game?.mode ?? mode];
  const { geometry, byId } = data;

  useEffect(() => writeSave(game), [game]);
  // What this device has been asked carries over to the next game.
  useEffect(() => {
    if (game) saveMemory({ sigs: game.recentSigs, decoys: game.recentDecoys });
  }, [game?.recentSigs, game?.recentDecoys]); // eslint-disable-line react-hooks/exhaustive-deps

  const dispatch = useCallback(
    (action: Action) => setGame((current) => (current ? reduce(data.worlds[current.mode], current, action) : current)),
    [data],
  );

  // Development hook used by the end-to-end checks to read state; stripped from production builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__atlas = { state: game, dispatch, data, sounds: soundLog };
  }, [game, dispatch, data]);

  const phase = game?.phase ?? null;
  const targets = useMemo(
    () => (game && game.phase === 'attack' ? getTargets(world, game.owned) : NO_TARGETS),
    [game?.phase, game?.owned, world], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // A selected target only makes sense while it is still attackable.
  const selectedTarget =
    targetId && (targets.land.includes(targetId) || targets.sea.includes(targetId)) ? targetId : null;
  useEffect(() => {
    if (targetId && !selectedTarget) {
      setTargetId(null);
      setTargetFocus(null);
    }
  }, [targetId, selectedTarget]);

  const status = useMemo(() => {
    const out: Record<string, CountryStatus> = {};
    for (const c of data.countries) if (!world.inPlay.has(c.id)) out[c.id] = 'out';
    if (!game) {
      if (startId && world.inPlay.has(startId)) out[startId] = 'selected';
      return out;
    }
    for (const id of game.owned) out[id] = 'owned';
    // With a DECIMATE ready, every target shimmers gold: any of them can be taken outright.
    for (const id of targets.land) out[id] = game.decimateReady ? 'decimate' : 'land';
    for (const id of targets.sea) out[id] = game.decimateReady ? 'decimate' : 'sea';
    if (selectedTarget) out[selectedTarget] = 'selected';
    if (game.phase === 'battle' && game.battle) out[game.battle.targetId] = 'battle';
    return out;
  }, [data.countries, world, game?.owned, game?.phase, game?.battle?.targetId, game?.decimateReady, targets, selectedTarget, startId, !game]); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = useMemo((): FocusRequest => {
    const boundsOf = (ids: readonly string[]): Bounds =>
      unionBounds(ids.map((id) => geometry.byId[id]?.bounds).filter((b): b is Bounds => Boolean(b))) ?? WORLD_BOUNDS;
    if (!game) {
      if (startId && geometry.byId[startId]) {
        return { key: `start:${startId}`, bounds: geometry.byId[startId].bounds, maxZoom: 7 };
      }
      return { key: `mode:${mode}`, bounds: mode === 'World' ? WORLD_BOUNDS : boundsOf(world.ids) };
    }
    // A DECIMATE closes in on its target.
    if (decimating) return { key: `decimate:${decimating.id}`, bounds: boundsOf([decimating.id]), maxZoom: 6 };
    switch (game.phase) {
      case 'battle':
        return {
          key: `battle:${game.battle!.targetId}:${game.eventSeq}`,
          bounds: boundsOf([game.battle!.targetId]),
          // Small islands and micro-states get the closest view there is, so the fight is visible.
          maxZoom: geometry.byId[game.battle!.targetId]?.tiny ? 40 : 16,
        };
      case 'attack':
        if (targetFocus && selectedTarget === targetFocus) {
          return { key: `target:${targetFocus}`, bounds: boundsOf([targetFocus]), maxZoom: 5 };
        }
        return {
          key: `attack:${game.battles}:${game.owned.length}`,
          bounds: boundsOf([...game.owned, ...(targets.land.length > 0 ? targets.land : targets.sea)]),
          maxZoom: 6,
        };
      case 'recruit':
        return { key: 'recruit', bounds: boundsOf(game.owned), maxZoom: 5 };
      default:
        return { key: `end:${game.phase}`, bounds: boundsOf(game.owned), maxZoom: 3 };
    }
  }, [geometry, game, mode, startId, world, targets, targetFocus, selectedTarget, decimating]);

  const inBattle = phase === 'battle' && game?.battle != null;
  // Width of the battle progress bar on the left, which is narrower on phones (see .progress in styles.css).
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 560);
  const [viewHeight, setViewHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => {
      setNarrow(window.innerWidth <= 560);
      setViewHeight(window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const progressWidth = narrow ? 56 : 84;
  const padding = useMemo((): MapPadding => {
    // On the start screen the map simply sits beside the panel (see .phase-start .map), so nothing covers it.
    if (!game) return { top: 0, right: 0, bottom: 0, left: 0 };
    return {
      top: topHeight + (inBattle ? tugHeight + 12 : 0),
      right: 0,
      bottom: dockHeight > 0 ? dockHeight + 12 : 0,
      left: inBattle ? progressWidth + 12 : 0,
    };
  }, [game === null, topHeight, dockHeight, tugHeight, inBattle, progressWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  const describe = useCallback(
    (id: string): TooltipInfo => {
      // Enemies in pink and what the conquest is worth in green: the same colours as the target list.
      const strengthParts = (target: string, sea: boolean): TooltipPart[] => {
        const { full, standing } = targetStrength(world, game!, target, sea);
        return [
          { text: standing < full ? `${soldiers(standing)} of ${soldiers(full)} enemies (wounded)` : `${soldiers(full)} enemies`, tone: 'enemy' },
          { text: `worth +${soldiers(conquestTroops(full))} troops`, tone: 'gain' },
        ];
      };
      const country = byId[id];
      if (!country) return { title: id };
      const title = country.name;
      // While a question is open the map keeps its names to itself: hovering a neighbour would answer
      // "which country borders…" for you. Only the country being attacked is named (it is in the question).
      if (game && (game.phase === 'battle' || game.phase === 'recruit')) {
        if (game.battle?.targetId === id) return { title, detail: 'Under attack' };
        return { title: '???', detail: 'Names are hidden during questions' };
      }
      if (!world.inPlay.has(id)) return { title, detail: 'Not part of this campaign' };
      if (!game) {
        const d = startDifficulty(world, id);
        return { title, detail: `${d.label} start · score ×${d.multiplier}` };
      }
      if (game.owned.includes(id)) return { title, detail: 'Your territory' };
      if (game.decimateReady && (targets.land.includes(id) || targets.sea.includes(id))) {
        const { full } = targetStrength(world, game, id, targets.sea.includes(id));
        return { title, detail: [{ text: 'DECIMATE: taken without a fight' }, { text: `worth +${soldiers(conquestTroops(full))} troops`, tone: 'gain' }] };
      }
      if (targets.land.includes(id)) {
        return { title, detail: [{ text: 'Attackable by land' }, ...strengthParts(id, false)] };
      }
      if (targets.sea.includes(id)) {
        return { title, detail: [{ text: 'Sea crossing', tone: 'sea' }, ...strengthParts(id, true), { text: `${SEA_TIMER_SECONDS}s timer` }] };
      }
      if (game.phase !== 'attack') return { title, detail: country.continent };
      // Near enough to sail to, but on a sea the empire has no coast on yet.
      const lanes = lanesNeeded(world, game.owned, id);
      if (lanes) return { title, detail: [{ text: 'No sea route yet' }, { text: `take a coast on the ${lanes.join(' or the ')} first`, tone: 'sea' }] };
      return { title, detail: 'Out of reach for now' };
    },
    [byId, world, game, targets],
  );

  const onCountryClick = useCallback(
    (id: string) => {
      if (!game) {
        if (world.inPlay.has(id)) {
          // Picking where to begin: a snap, and a whoosh as the map zooms in on it.
          sound.zoom();
          setStartId(id);
        }
        return;
      }
      if (game.phase !== 'attack') return;
      const attackable = targets.land.includes(id) || targets.sea.includes(id);
      if (attackable) sound.snap();
      setTargetId(attackable ? id : null);
      setTargetFocus(null);
    },
    [game, world, targets],
  );

  // A light pulse as the pointer passes over a country that can be picked: any country in the campaign
  // before the game, any target between battles. While a question is open the map stays silent.
  const onCountryHover = useCallback(
    (id: string) => {
      if (!game) {
        if (world.inPlay.has(id)) sound.pulse();
      } else if (game.phase === 'attack' && (targets.land.includes(id) || targets.sea.includes(id))) sound.pulse();
    },
    [game, world, targets],
  );

  const startGame = (id: string) => {
    const seed = (Math.random() * 4294967296) >>> 0;
    seenSeq.current = 0;
    // The siege begins.
    sound.siege();
    setPanel(null);
    setTargetId(null);
    setTargetFocus(null);
    // An empire left unnamed is named after its home country. (A name that fails cannot get this far:
    // the Begin button is disabled until it is changed.)
    const checked = validateEmpireName(empire.name);
    const name = checked.valid ? checked.name : defaultEmpireName(byId[id].name);
    setGame(createGame(data.worlds[mode], id, seed, { name, flag: empire.flag }, loadMemory()));
  };

  /**
   * DECIMATE: the camera closes in, "[ LOCATION LOCKED ]" flickers, the target blows up, and then it falls
   * like any conquest, with its flash, fanfare and troops.
   */
  const startDecimate = (id: string) => {
    if (decimating) return;
    setTargetId(null);
    setTargetFocus(null);
    setDecimating({ id, stage: 'lock' });
    sound.lockOn();
    decimateTimers.current.push(
      window.setTimeout(() => {
        setDecimating({ id, stage: 'blast' });
        sound.explosion();
      }, LOCK_MS),
      window.setTimeout(() => {
        setDecimating(null);
        dispatch({ type: 'decimate', targetId: id });
      }, LOCK_MS + BLAST_MS),
    );
  };

  const quit = () => {
    decimateTimers.current.forEach((timer) => window.clearTimeout(timer));
    decimateTimers.current = [];
    setDecimating(null);
    setGame(null);
    setTargetId(null);
    setTargetFocus(null);
    setStartId(null);
  };

  const changeMode = (next: ModeId) => {
    setMode(next);
    if (startId && !data.worlds[next].inPlay.has(startId)) setStartId(null);
  };

  const toast = useMemo((): ToastMessage | null => {
    if (!game?.lastEvent || game.eventSeq <= seenSeq.current) return null;
    const event = game.lastEvent;
    const seq = game.eventSeq;
    switch (event.kind) {
      case 'recruited':
        return {
          seq,
          tone: event.earned > 0 ? 'good' : 'info',
          title: event.earned > 0 ? `Recruited ${soldiers(event.earned)} troops` : 'No troops recruited',
          detail: `${event.correct} of 5 correct. From here on, troops come only from conquests.`,
        };
      case 'conquered': {
        const gained = `+${soldiers(event.troopsGained)} troops join your army.`;
        return {
          seq,
          tone: 'good',
          title: event.decimated ? `${byId[event.countryId].name} DECIMATED!` : `${byId[event.countryId].name} conquered!`,
          detail: event.continent ? `${gained} All of ${event.continent} is yours: +${CONTINENT_BONUS} bonus points` : gained,
        };
      }
      case 'defeated':
        return {
          seq,
          tone: 'bad',
          title: `The attack on ${byId[event.countryId].name} failed`,
          detail: 'Your empire has fallen.',
        };
      case 'retreated':
        return {
          seq,
          tone: 'info',
          title: `Retreated from ${byId[event.countryId].name}`,
          detail: `It cost ${soldiers(event.troopsLost)} troops and your streak. ${soldiers(event.defendersLeft)} of ${soldiers(event.defendersFull)} enemies still stand.`,
        };
    }
  }, [game?.eventSeq, game?.lastEvent, game?.phase, byId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sound effects follow what just changed in the game.
  const heard = useRef(game);
  useEffect(() => {
    const before = heard.current;
    heard.current = game;
    if (!game || !before || before === game) return;
    if (game.feedback && game.feedback !== before.feedback) {
      if (game.feedback.correct) sound.correct(game.streak);
      else sound.wrong();
    }
    // A DECIMATE has just been earned: a shimmer after the conquest fanfare.
    if (game.decimateReady && !before.decimateReady) sound.charged();
    if (game.eventSeq !== before.eventSeq && game.lastEvent) {
      const kind = game.lastEvent.kind;
      if (kind === 'conquered') game.phase === 'victory' ? sound.victory() : sound.conquer();
      else if (kind === 'defeated') sound.gameOver();
      else if (kind === 'recruited') sound.recruited();
      else sound.retreat();
    }
  }, [game]);

  // A country that has just fallen blinks on the map so the conquest is unmissable, even for a tiny island.
  const flash = useMemo(
    () =>
      game?.lastEvent?.kind === 'conquered' && game.eventSeq > seenSeq.current
        ? { id: game.lastEvent.countryId, key: `conquered:${game.eventSeq}` }
        : null,
    [game?.lastEvent, game?.eventSeq], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // The streak as it stood when the current question appeared (the answer has already changed it).
  const streakAtQuestion = useRef(game?.streak ?? 0);
  if (game && !game.feedback) streakAtQuestion.current = game.streak;

  const answerSeq = game ? game.answersCorrect + game.answersWrong : 0;
  const ended = phase === 'gameover' || phase === 'victory';
  // The last stand: in a battle with 2,000 troops or fewer, the next wrong answer ends the game. A heartbeat plays.
  const lastStand = inBattle && game !== null && isLastStand(game.troops);
  useEffect(() => {
    sound.heartbeat(lastStand);
  }, [lastStand]);
  useEffect(() => () => sound.heartbeat(false), []);
  // The finished run as the leaderboard records it. Its id is made once and kept beside the save.
  const run = useMemo(
    () => (game && ended ? runRecord(game, gameStats(world, game), runIdFor(game.seed)) : null),
    [game, ended, world],
  );

  return (
    <div
      className={`app ${game ? `phase-${game.phase}` : 'phase-start'} ${!game && panel ? `showing-${panel}` : ''} ${lastStand ? 'last-stand' : ''} ${decimating?.stage === 'blast' ? 'blasting' : ''}`}
      data-terrain={data.terrainKind}
    >
      <WorldMap
        geometry={geometry}
        terrainUrl={data.terrainUrl}
        status={status}
        focus={focus}
        padding={padding}
        // In a game the empty space below the map stays out of sight.
        pinBottom={game !== null}
        scene={game ? `${game.phase}:${game.battles}:${game.battle?.targetId ?? ''}` : 'start'}
        flash={flash}
        blast={decimating?.stage === 'blast' ? { id: decimating.id, key: `blast:${decimating.id}` } : null}
        empireFlag={game ? game.empire.flag : empire.flag}
        // Your flag flies over everything you hold; on the start screen it previews on the country you picked.
        flagOn={game ? 'owned' : 'selected'}
        describe={describe}
        onCountryClick={onCountryClick}
        onCountryHover={onCountryHover}
      />

      {!game && panel === 'rules' && <Rules data={data} onClose={closePanel} />}
      {!game && panel === 'leaderboard' && <Leaderboard data={data} onClose={closePanel} />}
      {!game && (
        // Rules stays centred above the map; Leaderboard sits to its right.
        <div className="map-buttons">
          <button
            type="button"
            className="btn primary rules-toggle"
            onMouseEnter={() => sound.pulse()}
            onClick={() => {
              sound.snap();
              setPanel((open) => (open === 'rules' ? null : 'rules'));
            }}
            aria-expanded={panel === 'rules'}
            data-testid="rules-toggle"
          >
            {panel === 'rules' ? 'Back to the map' : 'Rules'}
          </button>
          <button
            type="button"
            className="btn primary leaderboard-toggle"
            onMouseEnter={() => sound.pulse()}
            onClick={() => {
              sound.snap();
              setPanel((open) => (open === 'leaderboard' ? null : 'leaderboard'));
            }}
            aria-expanded={panel === 'leaderboard'}
            data-testid="leaderboard-toggle"
          >
            {panel === 'leaderboard' ? 'Back to the map' : 'Leaderboard'}
          </button>
        </div>
      )}
      {!game && (
        <StartScreen
          data={data}
          mode={mode}
          selectedId={startId}
          empire={empire}
          onEmpire={setEmpire}
          onMode={changeMode}
          onSelect={setStartId}
          onStart={startGame}
          onRules={() => setPanel('rules')}
          onLeaderboard={() => setPanel('leaderboard')}
        />
      )}

      {game && (
        <>
          <div ref={topRef} className="top-dock">
            <TopBar
              state={game}
              total={world.ids.length}
              onQuit={quit}
              charge={game.decimateReady ? 'armed' : game.phase === 'battle' && game.streak >= DECIMATE_STREAK ? 'charging' : 'none'}
            />
          </div>

          {inBattle && game.battle && (
            <>
              <div ref={tugRef} className="tug-dock" style={{ top: topHeight + 6 }}>
                <TugOfWar
                  troops={game.troops}
                  battle={game.battle}
                  feedback={game.feedback}
                  targetName={byId[game.battle.targetId].name}
                  targetFlag={
                    game.battle.asked.includes(`flag:${game.battle.targetId}`) ? byId[game.battle.targetId].cca2 : null
                  }
                  seq={answerSeq}
                />
              </div>
              <BattleProgress
                troops={game.troops}
                battle={game.battle}
                feedback={game.feedback}
                seq={answerSeq}
                top={topHeight + tugHeight + 16}
                bottom={dockHeight + 20}
                viewHeight={viewHeight}
              />
            </>
          )}

          {/* Battles have their own feedback; a leftover toast would only cover the map. */}
          <Toast message={inBattle ? null : toast} top={topHeight + 10} />
          <AnswerFlash feedback={game.feedback} seq={answerSeq} />

          {!ended && (
            <div ref={dockRef} className="dock">
              {game.phase === 'recruit' && game.recruit && (
                <QuestionCard
                  question={game.recruit.question}
                  feedback={game.feedback}
                  context={{
                    kind: 'recruit',
                    index: game.recruit.index,
                    streak: game.feedback ? (game.feedback.correct ? game.streak - 1 : streakAtQuestion.current) : game.streak,
                  }}
                  onAnswer={(index) => dispatch({ type: 'answer', index })}
                  onContinue={() => dispatch({ type: 'continue' })}
                />
              )}
              {game.phase === 'battle' && game.battle && (
                <QuestionCard
                  question={game.battle.question}
                  feedback={game.feedback}
                  context={{
                    kind: 'battle',
                    targetName: byId[game.battle.targetId].name,
                    sea: game.battle.sea,
                    onRetreat: () => dispatch({ type: 'retreat' }),
                    retreatCost: retreatCost(game.troops),
                    canRetreat: canRetreat(game.troops),
                  }}
                  onAnswer={(index) => dispatch({ type: 'answer', index })}
                  onContinue={() => dispatch({ type: 'continue' })}
                />
              )}
              {game.phase === 'attack' && !decimating && (
                <AttackPanel
                  targets={targets}
                  byId={byId}
                  escalation={escalation(game.owned.length)}
                  strength={(id, sea) => targetStrength(world, game, id, sea)}
                  selectedId={selectedTarget}
                  onSelect={(id) => {
                    setTargetId(id);
                    setTargetFocus(id);
                  }}
                  onAttack={(id) => {
                    setTargetId(null);
                    setTargetFocus(null);
                    dispatch({ type: 'attack', targetId: id });
                  }}
                  decimate={game.decimateReady}
                  onDecimate={startDecimate}
                />
              )}
            </div>
          )}

          {decimating?.stage === 'lock' && (
            <div className="lock-on" role="status" data-testid="location-locked">
              <strong>[ LOCATION LOCKED ]</strong>
              <span>{byId[decimating.id].name}</span>
            </div>
          )}

          {ended && run && (
            <EndScreen state={game} stats={gameStats(world, game)} start={byId[game.startId]} run={run} byId={byId} onPlayAgain={quit} />
          )}
        </>
      )}
    </div>
  );
}
