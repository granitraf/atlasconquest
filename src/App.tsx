import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttackPanel } from './components/AttackPanel';
import { EndScreen } from './components/EndScreen';
import { AnswerFlash, BattleProgress, Toast, TopBar, TugOfWar, type ToastMessage } from './components/Hud';
import { QuestionCard } from './components/QuestionCard';
import { Rules } from './components/Rules';
import { StartScreen } from './components/StartScreen';
import { WorldMap, type CountryStatus, type FocusRequest, type MapPadding, type TooltipInfo } from './components/WorldMap';
import { loadEmpire, loadGameData, loadSave, saveEmpire, writeSave, type GameData } from './data';
import { cleanEmpireName, defaultEmpireName, type Empire } from './game/flag';
import { CONTINENT_BONUS, SEA_TIMER_SECONDS, canRetreat, conquestTroops, escalation, getTargets, retreatCost, soldiers, startDifficulty } from './game/rules';
import { sound, soundLog } from './sound';
import { createGame, gameStats, reduce, targetStrength, type Action } from './game/state';
import type { GameState, ModeId, Targets } from './game/types';
import { WORLD_BOUNDS, unionBounds, type Bounds } from './map/geo';

const NO_TARGETS: Targets = { land: [], sea: [], seaFallback: false };

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
  /** The rule book, which takes the place of the map on the start screen. */
  const [rulesOpen, setRulesOpen] = useState(false);
  const closeRules = useCallback(() => setRulesOpen(false), []);
  const [targetId, setTargetId] = useState<string | null>(null);
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
    for (const id of targets.land) out[id] = 'land';
    for (const id of targets.sea) out[id] = 'sea';
    if (selectedTarget) out[selectedTarget] = 'selected';
    if (game.phase === 'battle' && game.battle) out[game.battle.targetId] = 'battle';
    return out;
  }, [data.countries, world, game?.owned, game?.phase, game?.battle?.targetId, targets, selectedTarget, startId, !game]); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = useMemo((): FocusRequest => {
    const boundsOf = (ids: readonly string[]): Bounds =>
      unionBounds(ids.map((id) => geometry.byId[id]?.bounds).filter((b): b is Bounds => Boolean(b))) ?? WORLD_BOUNDS;
    if (!game) {
      if (startId && geometry.byId[startId]) {
        return { key: `start:${startId}`, bounds: geometry.byId[startId].bounds, maxZoom: 7 };
      }
      return { key: `mode:${mode}`, bounds: mode === 'World' ? WORLD_BOUNDS : boundsOf(world.ids) };
    }
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
  }, [geometry, game, mode, startId, world, targets, targetFocus, selectedTarget]);

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
      const defendersText = (target: string, sea: boolean) => {
        const { full, standing } = targetStrength(world, game!, target, sea);
        const held = standing < full ? `${soldiers(standing)} of ${soldiers(full)} defenders (wounded)` : `${soldiers(full)} defenders`;
        return `${held} · worth +${soldiers(conquestTroops(full))} troops`;
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
      if (targets.land.includes(id)) {
        return { title, detail: `Attackable by land · ${defendersText(id, false)}` };
      }
      if (targets.sea.includes(id)) {
        return {
          title,
          detail: `Sea crossing · ${defendersText(id, true)} · ${SEA_TIMER_SECONDS}s timer`,
        };
      }
      return { title, detail: game.phase === 'attack' ? 'Out of reach for now' : country.continent };
    },
    [byId, world, game, targets],
  );

  const onCountryClick = useCallback(
    (id: string) => {
      if (!game) {
        if (world.inPlay.has(id)) setStartId(id);
        return;
      }
      if (game.phase !== 'attack') return;
      const attackable = targets.land.includes(id) || targets.sea.includes(id);
      setTargetId(attackable ? id : null);
      setTargetFocus(null);
    },
    [game, world, targets],
  );

  const startGame = (id: string) => {
    const seed = (Math.random() * 4294967296) >>> 0;
    seenSeq.current = 0;
    setRulesOpen(false);
    setTargetId(null);
    setTargetFocus(null);
    // An empire left unnamed is named after its home country.
    const name = cleanEmpireName(empire.name) || defaultEmpireName(byId[id].name);
    setGame(createGame(data.worlds[mode], id, seed, { name, flag: empire.flag }));
  };

  const quit = () => {
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
          title: `${byId[event.countryId].name} conquered!`,
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
          detail: `It cost ${soldiers(event.troopsLost)} troops and your streak. ${soldiers(event.defendersLeft)} of ${soldiers(event.defendersFull)} defenders still stand.`,
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

  return (
    <div className={`app ${game ? `phase-${game.phase}` : 'phase-start'} ${!game && rulesOpen ? 'showing-rules' : ''}`} data-terrain={data.terrainKind}>
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
        empireFlag={game ? game.empire.flag : empire.flag}
        // Your flag flies over everything you hold; on the start screen it previews on the country you picked.
        flagOn={game ? 'owned' : 'selected'}
        describe={describe}
        onCountryClick={onCountryClick}
      />

      {!game && rulesOpen && <Rules data={data} onClose={closeRules} />}
      {!game && (
        <button
          type="button"
          className="btn primary rules-toggle"
          onClick={() => setRulesOpen((open) => !open)}
          aria-expanded={rulesOpen}
          data-testid="rules-toggle"
        >
          {rulesOpen ? 'Back to the map' : 'Rules'}
        </button>
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
          onRules={() => setRulesOpen(true)}
        />
      )}

      {game && (
        <>
          <div ref={topRef} className="top-dock">
            <TopBar state={game} total={world.ids.length} onQuit={quit} />
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
              {game.phase === 'attack' && (
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
                />
              )}
            </div>
          )}

          {ended && (
            <EndScreen state={game} stats={gameStats(world, game)} start={byId[game.startId]} onPlayAgain={quit} />
          )}
        </>
      )}
    </div>
  );
}
