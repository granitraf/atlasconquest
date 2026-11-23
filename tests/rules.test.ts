import { describe, expect, it } from 'vitest';
import {
  MAX_DEFENDERS,
  MIN_TARGETS,
  MIN_DEFENDERS,
  START_LABELS,
  START_MULTIPLIER,
  DEFENDERS_PER_TROOP,
  WOUND_HEAL_PER_BATTLE,
  canRetreat,
  conquestTroops,
  escalation,
  healWounds,
  standingDefenders,
  startPosition,
  SEA_RANGE_KM,
  battleDefenders,
  battleProgress,
  defendersFor,
  finalScore,
  getTargets,
  lanesNeeded,
  questionSeconds,
  resolveBattleAnswer,
  resolveRecruitAnswer,
  retreatCost,
  streakMultiplier,
  troopReward,
  seaBonus,
  startDifficulty,
} from '../src/game/rules';
import { MODES } from '../src/game/types';
import { buildWorld, distanceKm } from '../src/game/world';
import { ALL, FACTS, fake } from './helpers';

describe('defenders', () => {
  const world = buildWorld(ALL, 'World', FACTS);
  const of = (id: string) => defendersFor(world.byId[id].population);

  it('scales smoothly with population, 3 more per tenfold', () => {
    expect(defendersFor(500_000)).toBe(3);
    expect(defendersFor(5_000_000)).toBe(6);
    expect(defendersFor(50_000_000)).toBe(9);
    expect(defendersFor(500_000_000)).toBe(12);
  });

  it('gives sensible sizes to real countries', () => {
    expect(of('VAT')).toBe(3);
    expect(of('NRU')).toBe(3);
    expect(of('MLT')).toBe(3);
    expect(of('LUX')).toBe(3);
    expect(of('IRL')).toBe(6);
    expect(of('FRA')).toBe(9);
    expect(of('DEU')).toBe(10);
    expect(of('IND')).toBe(13);
    // Bigger populations never defend with fewer troops.
    const sorted = [...ALL].sort((a, b) => a.population - b.population).map((c) => defendersFor(c.population));
    expect(sorted).toEqual([...sorted].sort((a, b) => a - b));
  });

  it('never has fewer than 3 or more than 14 of its own', () => {
    expect(MIN_DEFENDERS).toBe(3);
    expect(defendersFor(35)).toBe(3);
    expect(defendersFor(1)).toBe(3);
    expect(defendersFor(50_000_000_000)).toBe(MAX_DEFENDERS);
    for (const c of ALL) {
      expect(defendersFor(c.population)).toBeGreaterThanOrEqual(3);
      expect(defendersFor(c.population)).toBeLessThanOrEqual(14);
    }
  });

  it('every country gains a defender for each 15 countries the player holds', () => {
    expect([0, 1, 14, 15, 29, 30, 44, 45, 229].map(escalation)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 15]);
    const france = world.byId.FRA.population;
    expect(battleDefenders(france, false, 1)).toBe(9);
    expect(battleDefenders(france, false, 15)).toBe(10);
    expect(battleDefenders(france, false, 60)).toBe(13);
    // Micro-states grow too, so the late game has no free conquests.
    expect(battleDefenders(world.byId.VAT.population, false, 90)).toBe(9);
    // The sea bonus is worked out on the escalated number.
    expect(battleDefenders(france, true, 45)).toBe(12 + seaBonus(12));
  });

  it('a wounded country stands with fewer defenders, never fewer than 1, and heals 2 each time the player attacks elsewhere', () => {
    expect(standingDefenders(9)).toBe(9);
    expect(standingDefenders(9, 4)).toBe(5);
    expect(standingDefenders(9, 8)).toBe(1);
    expect(standingDefenders(9, 20)).toBe(1);
    expect(healWounds({ FRA: 5, ESP: 2, ITA: 1, DEU: 3 })).toEqual({ FRA: 3, DEU: 1 });
    expect(healWounds({})).toEqual({});
    // The country being attacked does not heal.
    expect(healWounds({ FRA: 5, ESP: 2, DEU: 3 }, 'FRA')).toEqual({ FRA: 5, DEU: 1 });
    expect(healWounds({ ESP: 2 }, 'ESP')).toEqual({ ESP: 2 });
    expect(WOUND_HEAL_PER_BATTLE).toBe(2);
  });

  it('a sea crossing adds a third again, at least 1', () => {
    expect([2, 3, 4, 5, 6, 9, 10, 13].map(seaBonus)).toEqual([1, 1, 1, 2, 2, 3, 3, 4]);
    expect(battleDefenders(world.byId.MLT.population, false)).toBe(3);
    expect(battleDefenders(world.byId.MLT.population, true)).toBe(4);
    expect(battleDefenders(world.byId.GBR.population, true)).toBe(defendersFor(world.byId.GBR.population) + 3);
  });

  it('every question is timed, sea crossings in half the time', () => {
    expect(questionSeconds(false)).toBe(20);
    expect(questionSeconds(true)).toBe(10);
  });
});

describe('recruit rewards', () => {
  it('the streak multiplier is x1 below 5, x2 from 5, x3 from 10', () => {
    expect([0, 1, 4].map(streakMultiplier)).toEqual([1, 1, 1]);
    expect([5, 6, 9].map(streakMultiplier)).toEqual([2, 2, 2]);
    expect([10, 11, 50].map(streakMultiplier)).toEqual([3, 3, 3]);
  });

  it('pays 1 / 2 / 3 troops by difficulty', () => {
    expect(troopReward('easy')).toBe(1);
    expect(troopReward('medium')).toBe(2);
    expect(troopReward('hard')).toBe(3);
  });

  it('doubles the fifth correct answer in a row', () => {
    expect(resolveRecruitAnswer(3, 'easy', true)).toEqual({ streak: 4, earned: 1, multiplier: 1 });
    expect(resolveRecruitAnswer(4, 'easy', true)).toEqual({ streak: 5, earned: 2, multiplier: 2 });
    expect(resolveRecruitAnswer(4, 'hard', true)).toEqual({ streak: 5, earned: 6, multiplier: 2 });
  });

  it('resets to 0 on any wrong answer and pays nothing', () => {
    expect(resolveRecruitAnswer(4, 'hard', false)).toEqual({ streak: 0, earned: 0, multiplier: 1 });
  });
});

describe('battle resolution', () => {
  it('a correct answer kills 1 defender, 2 if hard', () => {
    expect(resolveBattleAnswer(10, 5, 'easy', true)).toMatchObject({ troops: 10, defenders: 4, outcome: 'ongoing' });
    expect(resolveBattleAnswer(10, 5, 'medium', true)).toMatchObject({ defenders: 4, defendersKilled: 1 });
    expect(resolveBattleAnswer(10, 5, 'hard', true)).toMatchObject({ defenders: 3, defendersKilled: 2 });
  });

  it('a wrong answer kills 2 of the player troops and no defenders', () => {
    expect(resolveBattleAnswer(10, 5, 'hard', false)).toMatchObject({
      troops: 8,
      defenders: 5,
      troopsLost: 2,
      defendersKilled: 0,
      outcome: 'ongoing',
    });
  });

  it('is won when defenders reach 0 (never below)', () => {
    expect(resolveBattleAnswer(4, 1, 'easy', true)).toMatchObject({ defenders: 0, outcome: 'won' });
    expect(resolveBattleAnswer(4, 1, 'hard', true)).toMatchObject({ defenders: 0, defendersKilled: 1, outcome: 'won' });
    expect(resolveBattleAnswer(4, 2, 'hard', true)).toMatchObject({ defenders: 0, outcome: 'won' });
  });

  it('is lost when player troops reach 0 (never below)', () => {
    expect(resolveBattleAnswer(2, 5, 'easy', false)).toMatchObject({ troops: 0, outcome: 'lost' });
    expect(resolveBattleAnswer(1, 5, 'easy', false)).toMatchObject({ troops: 0, troopsLost: 1, outcome: 'lost' });
    expect(resolveBattleAnswer(3, 5, 'easy', false)).toMatchObject({ troops: 1, outcome: 'ongoing' });
  });

  it('progress rises with kills, drops with losses, and is full on victory', () => {
    const start = battleProgress(9, 9, 10, 10);
    const afterKills = battleProgress(6, 9, 10, 10);
    const afterWrong = battleProgress(6, 9, 8, 10);
    expect(start).toBe(0);
    expect(afterKills).toBeCloseTo(1 / 3);
    expect(afterWrong).toBeLessThan(afterKills);
    expect(battleProgress(0, 9, 2, 10)).toBe(1);
  });
});

describe('attackable countries', () => {
  const world = buildWorld(ALL, 'World', FACTS);

  it('Germany can attack France and its other land neighbours', () => {
    const targets = getTargets(world, ['DEU']);
    expect(targets.land).toContain('FRA');
    expect(targets.land).toEqual(['AUT', 'BEL', 'CHE', 'CZE', 'DNK', 'FRA', 'LUX', 'NLD', 'POL']);
  });

  it('Iceland has no land targets but does have sea targets', () => {
    const targets = getTargets(world, ['ISL']);
    expect(targets.land).toEqual([]);
    expect(targets.sea.length).toBeGreaterThan(0);
    expect(targets.sea).toContain('GBR');
  });

  it('sea targets are coastal, unowned, not land targets, and within range', () => {
    for (const start of ['ISL', 'DEU', 'JPN', 'BRA']) {
      const targets = getTargets(world, [start]);
      expect(targets.seaFallback).toBe(false);
      for (const id of targets.sea) {
        expect(world.byId[id].landlocked).toBe(false);
        expect(id).not.toBe(start);
        expect(targets.land).not.toContain(id);
        expect(distanceKm(world.byId[start], world.byId[id])).toBeLessThanOrEqual(SEA_RANGE_KM);
        // …and on a sea the start has a coast on.
        expect(world.byId[id].lanes.some((lane) => world.byId[start].lanes.includes(lane)), `${start} -> ${id}`).toBe(true);
      }
    }
  });

  it('ships follow the water: an enclosed sea can only be entered from a country with a coast on it', () => {
    // Every coastal country is on at least one sea lane; landlocked ones are on none.
    for (const c of ALL) expect(c.lanes.length > 0, c.name).toBe(!c.landlocked);
    expect(world.byId.DEU.lanes.sort()).toEqual(['Atlantic', 'Baltic']);
    expect(world.byId.ITA.lanes).toEqual(['Mediterranean']);
    expect(world.byId.UKR.lanes).toEqual(['Black Sea']);
    expect(world.byId.MAR.lanes.sort()).toEqual(['Atlantic', 'Mediterranean']);
    expect(world.byId.TUR.lanes.sort()).toEqual(['Black Sea', 'Mediterranean']);

    // From Germany's North Sea and Baltic coasts: the Atlantic shore as far as Morocco, and the Baltic.
    const germany = getTargets(world, ['DEU']).sea;
    for (const id of ['GBR', 'IRL', 'NOR', 'SWE', 'FIN', 'EST', 'ESP', 'PRT', 'MAR', 'ISL']) expect(germany, id).toContain(id);
    // Not the Mediterranean or the Black Sea, however near they are as the crow flies.
    for (const id of ['ITA', 'GRC', 'TUR', 'UKR', 'ROU', 'BGR', 'HRV', 'TUN', 'MLT', 'ALB']) {
      expect(germany, id).not.toContain(id);
      expect(distanceKm(world.byId.DEU, world.byId[id]), id).toBeLessThanOrEqual(SEA_RANGE_KM);
    }
    expect(getTargets(world, ['DEU']).seaFallback).toBe(false);

    // Spain, France or Morocco open the Mediterranean…
    for (const key of ['ESP', 'FRA', 'MAR']) {
      const opened = getTargets(world, ['DEU', key]);
      const all = [...opened.land, ...opened.sea];
      for (const id of ['TUN', 'MLT', 'HRV']) expect(all, `${key} -> ${id}`).toContain(id);
      // …but not the Black Sea beyond it.
      for (const id of ['UKR', 'ROU', 'BGR']) expect(all, `${key} -> ${id}`).not.toContain(id);
    }
    // Turkey, on both, opens the Black Sea.
    const viaTurkey = getTargets(world, ['DEU', 'FRA', 'TUR']);
    for (const id of ['UKR', 'ROU']) expect([...viaTurkey.land, ...viaTurkey.sea], id).toContain(id);

    // The same the other way round, and for the Baltic.
    const italy = getTargets(world, ['ITA']).sea;
    for (const id of ['GRC', 'TUN', 'ESP', 'TUR', 'EGY']) expect(italy, id).toContain(id);
    for (const id of ['DEU', 'GBR', 'PRT', 'UKR', 'POL']) expect(italy, id).not.toContain(id);
    const britain = getTargets(world, ['GBR']).sea;
    for (const id of ['DEU', 'NOR', 'ESP', 'MAR']) expect(britain, id).toContain(id);
    for (const id of ['POL', 'FIN', 'EST', 'ITA']) expect(britain, id).not.toContain(id);
    expect(getTargets(world, ['POL']).sea.every((id) => world.byId[id].lanes.includes('Baltic'))).toBe(true);
  });

  it('says which sea is missing when a shore is close enough but cannot be sailed to', () => {
    expect(lanesNeeded(world, ['DEU'], 'ITA')).toEqual(['Mediterranean']);
    expect(lanesNeeded(world, ['DEU'], 'UKR')).toEqual(['Black Sea']);
    expect(lanesNeeded(world, ['DEU'], 'TUR')?.sort()).toEqual(['Black Sea', 'Mediterranean']);
    // Reachable, too far, landlocked, or no coast of your own: lanes are not what is in the way.
    expect(lanesNeeded(world, ['DEU'], 'MAR')).toBeNull();
    expect(lanesNeeded(world, ['DEU'], 'JPN')).toBeNull();
    expect(lanesNeeded(world, ['DEU'], 'CHE')).toBeNull();
    expect(lanesNeeded(world, ['CHE'], 'ITA')).toBeNull();
    expect(lanesNeeded(world, ['DEU', 'FRA'], 'ITA')).toBeNull();
  });

  it('an isolated start is topped up to three targets with the nearest shores beyond the range', () => {
    expect(SEA_RANGE_KM).toBe(2500);
    expect(MIN_TARGETS).toBe(3);
    // Pitcairn: only French Polynesia is within 2,500 km. The next two nearest shores open up as well.
    const pitcairn = getTargets(world, ['PCN']);
    expect(pitcairn).toEqual({ land: [], sea: ['PYF', 'COK', 'NIU'], seaFallback: true });
    const km = (id: string) => distanceKm(world.byId.PCN, world.byId[id]);
    expect(km('PYF')).toBeLessThanOrEqual(SEA_RANGE_KM);
    expect(km('COK')).toBeGreaterThan(SEA_RANGE_KM);
    expect(km('NIU')).toBeGreaterThan(km('COK'));
    // Australia's centre is far from every shore but one: it gets three as well.
    const australia = getTargets(world, ['AUS']);
    expect(australia.sea).toHaveLength(3);
    expect(australia.seaFallback).toBe(true);
    // Taking French Polynesia from Pitcairn brings more shores into range: no top-up needed any more.
    const grown = getTargets(world, ['PCN', 'PYF']);
    expect(grown.sea.length).toBeGreaterThanOrEqual(3);
  });

  it('every start with a coast has at least three targets; the top-up changes nothing for anyone who already had three', () => {
    for (const mode of MODES) {
      const w = buildWorld(ALL, mode, FACTS);
      for (const id of w.ids) {
        const t = getTargets(w, [id]);
        const total = t.land.length + t.sea.length;
        const inRange = t.sea.filter((s) => distanceKm(w.byId[id], w.byId[s]) <= SEA_RANGE_KM);
        expect(total, `${w.byId[id].name} in ${mode}`).toBeGreaterThan(0);
        if (!w.byId[id].landlocked) {
          const coastalLeft = w.ids.filter((o) => o !== id && !w.byId[o].landlocked && !t.land.includes(o)).length;
          expect(total, `${w.byId[id].name} in ${mode}`).toBeGreaterThanOrEqual(Math.min(MIN_TARGETS, t.land.length + coastalLeft));
        }
        if (t.seaFallback) {
          // Topped up: exactly enough to reach three, and nothing in range was left out.
          expect(total, `${w.byId[id].name} in ${mode}`).toBeLessThanOrEqual(MIN_TARGETS);
          expect(t.land.length + inRange.length).toBeLessThan(MIN_TARGETS);
        } else {
          // Not topped up: every sea target is within the range, exactly as before.
          expect(inRange.length, `${w.byId[id].name} in ${mode}`).toBe(t.sea.length);
        }
      }
    }
    // Well-connected starts are untouched.
    expect(getTargets(world, ['DEU']).seaFallback).toBe(false);
    expect(getTargets(world, ['ITA']).seaFallback).toBe(false);
  });

  it('owned countries are never targets and conquering updates the set', () => {
    const before = getTargets(world, ['DEU']);
    const after = getTargets(world, ['DEU', 'FRA']);
    expect(after.land).not.toContain('FRA');
    expect(after.land).toContain('ESP');
    expect(before.land).not.toContain('ESP');
  });

  it('a landlocked-only player gets no sea crossings while land targets exist', () => {
    const targets = getTargets(world, ['CHE']);
    expect(targets.land.length).toBeGreaterThan(0);
    expect(targets.sea).toEqual([]);
  });

  it('measures sea range from any owned country', () => {
    const a = fake('AAA', { lat: 0, lng: 0, borders: ['BBB'] });
    const b = fake('BBB', { lat: 0, lng: 20, borders: ['AAA'] });
    const far = fake('FAR', { lat: 0, lng: 40 });
    const mini = buildWorld([a, b, far], 'World');
    // 40 degrees of longitude on the equator is ~4450 km: out of range from AAA alone…
    expect(getTargets(mini, ['AAA']).sea).toEqual(['FAR']);
    expect(getTargets(mini, ['AAA']).seaFallback).toBe(true);
    // …but ~2220 km from BBB once it is owned.
    expect(getTargets(mini, ['AAA', 'BBB'])).toEqual({ land: [], sea: ['FAR'], seaFallback: false });
  });

  it('offers the 3 nearest coastal countries when none are in range', () => {
    const home = fake('HOM', { lat: 0, lng: 0 });
    const far = [50, 60, 70, 80].map((lng, i) => fake(`F${i}X`, { lat: 0, lng }));
    const inland = fake('INL', { lat: 0, lng: 45, landlocked: true });
    const mini = buildWorld([home, ...far, inland], 'World');
    const targets = getTargets(mini, ['HOM']);
    expect(targets.seaFallback).toBe(true);
    expect(targets.sea).toEqual(['F0X', 'F1X', 'F2X']);
  });

  it('never dead-ends: stranded landlocked countries are still offered', () => {
    const coast = fake('CST', { lat: 0, lng: 0 });
    // Landlocked, and no neighbour in play: neither the land nor the sea rule can reach it.
    const stranded = fake('STR', { lat: 5, lng: 5, landlocked: true });
    const mini = buildWorld([coast, stranded], 'World');
    expect(getTargets(mini, ['CST'])).toEqual({ land: [], sea: ['STR'], seaFallback: true });
    // A landlocked player with nothing left to attack by land gets a crossing too.
    expect(getTargets(mini, ['STR'])).toEqual({ land: [], sea: ['CST'], seaFallback: true });
  });

  it('returns nothing once everything is owned', () => {
    const mini = buildWorld([fake('AAA'), fake('BBB')], 'World');
    expect(getTargets(mini, ['AAA', 'BBB'])).toEqual({ land: [], sea: [], seaFallback: false });
  });

  it('every country is reachable from every start in every mode', () => {
    for (const mode of MODES) {
      const w = buildWorld(ALL, mode);
      expect(w.ids.length).toBeGreaterThan(1);
      for (const start of w.ids) {
        const owned = [start];
        while (owned.length < w.ids.length) {
          const targets = getTargets(w, owned);
          const reachable = [...targets.land, ...targets.sea];
          // Whatever is left, the player must always have something to attack.
          expect(reachable.length, `${mode}: stuck from ${start} with ${owned.length} owned`).toBeGreaterThan(0);
          owned.push(...reachable);
        }
        expect(new Set(owned).size).toBe(w.ids.length);
      }
    }
  });
});

describe('start difficulty', () => {
  const world = buildWorld(ALL, 'World', FACTS);
  const worlds = MODES.map((mode) => buildWorld(ALL, mode));
  const named = (name: string) => ALL.find((c) => c.name === name)!;

  it('has five tiers with rising multipliers', () => {
    expect(START_LABELS).toEqual(['Easy', 'Medium', 'Hard', 'Very Hard', 'Extreme']);
    expect(START_MULTIPLIER).toEqual({ Easy: 1, Medium: 1.5, Hard: 2, 'Very Hard': 2.5, Extreme: 3 });
  });

  it('reads position from in-mode land neighbours and their defenders', () => {
    // Germany: nine neighbours, several lightly defended.
    expect(startPosition(world, 'DEU')).toMatchObject({ position: 'open', landNeighbours: 9 });
    // Portugal's only neighbour is Spain (9 defenders).
    expect(startPosition(world, 'PRT')).toEqual({ position: 'boxedIn', landNeighbours: 1, cheapNeighbours: 0 });
    expect(startPosition(world, 'ISL').position).toBe('island');
    // Monaco's one neighbour, France, is strongly defended.
    expect(startPosition(world, named('Monaco').id)).toEqual({ position: 'boxedIn', landNeighbours: 1, cheapNeighbours: 0 });
    // Spain has four neighbours but only Andorra is lightly defended: one cheap exit, not an open start.
    expect(startPosition(world, named('Spain').id)).toEqual({ position: 'cheapExit', landNeighbours: 4, cheapNeighbours: 1 });
    // Egypt's only African land neighbours are Libya and Sudan; Israel and Palestine are in Asia.
    expect(startPosition(world, 'EGY').landNeighbours).toBe(4);
    expect(startPosition(buildWorld(ALL, 'Africa'), 'EGY').landNeighbours).toBe(2);
  });

  it('crosses fame with position', () => {
    const rate = (name: string) => startDifficulty(world, named(name).id);
    // Fame 1.
    expect(rate('Romania')).toMatchObject({ fame: 1, position: 'open', label: 'Medium', multiplier: 1.5 });
    expect(rate('Indonesia')).toMatchObject({ fame: 1, position: 'cheapExit', label: 'Medium' });
    expect(rate('Thailand')).toMatchObject({ fame: 1, position: 'boxedIn', label: 'Hard', multiplier: 2 });
    expect(rate('Philippines')).toMatchObject({ fame: 1, position: 'island', label: 'Very Hard', multiplier: 2.5 });
    // Fame 2.
    expect(rate('Uzbekistan')).toMatchObject({ fame: 2, position: 'open', label: 'Hard', multiplier: 2 });
    expect(rate('Chad')).toMatchObject({ fame: 2, position: 'cheapExit', label: 'Hard' });
    expect(rate('Laos')).toMatchObject({ fame: 2, position: 'boxedIn', label: 'Very Hard', multiplier: 2.5 });
    expect(rate('Palau')).toMatchObject({ fame: 2, position: 'island', label: 'Extreme', multiplier: 3 });
    expect(rate('Palau').reason).toBe('Obscure island: every expansion is a sea crossing');
    expect(rate('France').reason).toBe('Well known country');
    expect(rate('Japan').reason).toBe('Well known island nation');
  });

  it('the named famous countries are Easy in World mode and in their continent campaigns', () => {
    for (const name of ['United States', 'Canada', 'Portugal', 'France', 'Germany', 'United Kingdom', 'Ireland', 'Japan']) {
      const country = named(name);
      expect(country.fame, name).toBe(0);
      expect(startDifficulty(world, country.id)).toMatchObject({ label: 'Easy', multiplier: 1 });
      expect(startDifficulty(buildWorld(ALL, country.continent), country.id), name).toMatchObject({ label: 'Easy', multiplier: 1 });
    }
  });

  it('no famous country is ever rated above Easy, in any mode', () => {
    for (const w of worlds) {
      for (const id of w.ids) if (w.byId[id].fame === 0) expect(startDifficulty(w, id).label, `${w.byId[id].name} in ${w.mode}`).toBe('Easy');
    }
  });

  it('every obscure island is Extreme, in any mode', () => {
    let islands = 0;
    for (const w of worlds) {
      for (const id of w.ids) {
        if (w.byId[id].fame !== 2 || w.neighbours[id].length > 0) continue;
        islands++;
        expect(startDifficulty(w, id), `${w.byId[id].name} in ${w.mode}`).toMatchObject({ label: 'Extreme', multiplier: 3 });
      }
    }
    expect(islands).toBeGreaterThan(50);
  });

  it('every country in every mode gets exactly one rating, with a reason', () => {
    for (const w of worlds) {
      for (const id of w.ids) {
        const d = startDifficulty(w, id);
        expect(START_LABELS).toContain(d.label);
        expect(d.multiplier).toBe(START_MULTIPLIER[d.label]);
        expect(d.reason.length).toBeGreaterThan(10);
        expect(d.fame).toBe(w.byId[id].fame);
      }
    }
  });

  it('fame comes from the config: every country has a value and the lists are honoured', () => {
    for (const c of ALL) expect([0, 1, 2]).toContain(c.fame);
    expect(named('Iceland').fame).toBe(1);
    expect(named('Vatican City').fame).toBe(1);
    expect(named('Laos').fame).toBe(2);
    expect(named('Thailand').fame).toBe(1);
    // Not on any list: under 5 million people is obscure, otherwise mid-known.
    expect(named('Suriname').fame).toBe(2);
    // Small countries that are well known anyway are listed as familiar.
    for (const name of ['Malta', 'Luxembourg', 'Croatia', 'Fiji', 'Uruguay', 'Qatar']) expect(named(name).fame, name).toBe(1);
    expect(named('Peru').fame).toBe(1);
  });
});

describe('score', () => {
  it('is countries conquered times the difficulty multiplier', () => {
    expect(finalScore(12, 1)).toBe(12);
    expect(finalScore(7, 1.5)).toBe(10.5);
    expect(finalScore(12, 2)).toBe(24);
    expect(finalScore(0, 2)).toBe(0);
  });

  it('adds 10 bonus points for every continent conquered in full', () => {
    expect(finalScore(12, 1.5, 1)).toBe(28);
    expect(finalScore(40, 2, 3)).toBe(110);
    expect(finalScore(0, 1, 0)).toBe(0);
  });
});

describe('retreat', () => {
  it('costs a quarter of the army, rounded up', () => {
    expect(retreatCost(40)).toBe(10);
    expect(retreatCost(22)).toBe(6);
    expect(retreatCost(10)).toBe(3);
    expect(retreatCost(4)).toBe(1);
  });

  it('always costs at least one troop while there are any, and nothing when there are none', () => {
    expect(retreatCost(1)).toBe(1);
    expect(retreatCost(2)).toBe(1);
    expect(retreatCost(0)).toBe(0);
  });

  it('does not depend on how the battle is going', () => {
    expect(retreatCost.length).toBe(1);
  });

  it('is not possible with the last troop, and always leaves at least one', () => {
    expect(canRetreat(0)).toBe(false);
    expect(canRetreat(1)).toBe(false);
    for (let troops = 2; troops <= 200; troops++) {
      expect(canRetreat(troops)).toBe(true);
      expect(troops - retreatCost(troops)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('conquest rewards', () => {
  const world = buildWorld(ALL, 'World', FACTS);

  it('are 1 troop for every 3 defenders, rounded, never less than 1', () => {
    expect(DEFENDERS_PER_TROOP).toBe(3);
    expect([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(conquestTroops)).toEqual([1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6]);
    expect(conquestTroops(1)).toBe(1);
    expect(conquestTroops(0)).toBe(1);
  });

  it('follow the size of the fight, not how obscure the country is', () => {
    const worth = (id: string, sea = false, held = 1) => conquestTroops(battleDefenders(world.byId[id].population, sea, held));
    // The biggest countries pay the most, however famous.
    expect(worth('IND')).toBe(4);
    expect(worth('CHN')).toBe(4);
    expect(worth('USA')).toBe(4);
    expect(worth('DEU')).toBe(3);
    expect(worth('FRA')).toBe(3);
    expect(worth('IRL')).toBe(2);
    // Small countries pay 1, however obscure.
    for (const id of ['LUX', 'ISL', 'MLT', 'AND', 'PLW', 'NRU']) expect(worth(id), id).toBe(1);
    // A sea crossing and a large empire both add defenders, and the reward follows.
    expect(worth('IRL', true)).toBe(3);
    expect(worth('FRA', false, 45)).toBe(4);
    // Never less for a bigger fight.
    for (let d = 1; d < 40; d++) expect(conquestTroops(d + 1)).toBeGreaterThanOrEqual(conquestTroops(d));
  });

  it('every country pays something: a whole World campaign is worth well over 400 troops', () => {
    const rewards = world.ids.map((id) => conquestTroops(defendersFor(world.byId[id].population)));
    expect(Math.min(...rewards)).toBe(1);
    expect(Math.max(...rewards)).toBe(4);
    expect(rewards.reduce((a, b) => a + b, 0)).toBe(466);
  });
});
