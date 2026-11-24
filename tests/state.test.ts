import { describe, expect, it } from 'vitest';
import {
  CONTINENT_BONUS,
  START_LIVES,
  START_TROOPS,
  battleDefenders,
  troopReward,
  conquestTroops,
  defendersFor,
  getTargets,
  seaBonus,
} from '../src/game/rules';
import { RHYTHM_DECK } from '../src/game/questions';
import { DECIMATE_STREAK } from '../src/game/rules';
import { DECOYS_KEPT, RECENT_SIGS_KEPT, createGame, gameStats, reduce, remember, reviveGame, sanitizeMemory, targetStrength, type Action } from '../src/game/state';
import type { GameState } from '../src/game/types';
import { buildWorld } from '../src/game/world';
import { ALL, EMPIRE, FACTS, answerOnce, conquer, fake, playRecruit } from './helpers';

const world = buildWorld(ALL, 'World', FACTS);
const ALL_RIGHT = [true, true, true, true, true];
const ALL_WRONG = [false, false, false, false, false];
/** A game as it begins: in its opening recruit phase. */
const fresh = (start: string, seed = 1): GameState => createGame(world, start, seed, EMPIRE);
/** A game past its recruit phase with nothing recruited: 10 troops, no streak, ready to attack. */
const newGame = (start: string, seed = 1): GameState => playRecruit(world, fresh(start, seed), ALL_WRONG);

describe('new game', () => {
  it('gives every start the same resources and opens with the recruit phase', () => {
    for (const id of ['DEU', 'ISL', 'RUS', 'VAT']) {
      const s = fresh(id);
      expect(s).toMatchObject({ troops: START_TROOPS, lives: START_LIVES, owned: [id], battles: 0, phase: 'recruit', battle: null });
      expect(s.troops).toBe(10);
      expect(s.lives).toBe(1);
      expect(s.empire).toEqual(EMPIRE);
      expect(s.recruit).toMatchObject({ index: 0, earned: 0, correct: 0, asked: [] });
      expect(s.recruit!.question.countryId).toBe(id);
    }
  });

  it('records the difficulty rating of the start', () => {
    expect(fresh('DEU')).toMatchObject({ startLabel: 'Easy', multiplier: 1 });
    expect(fresh('ISL')).toMatchObject({ startLabel: 'Very Hard', multiplier: 2.5 });
    expect(fresh('PLW')).toMatchObject({ startLabel: 'Extreme', multiplier: 3 });
    expect(fresh('DEU').wounds).toEqual({});
  });
});

describe('opening recruit phase', () => {
  it('asks exactly 5 questions about the starting country, then moves to the attack phase', () => {
    let s = fresh('DEU', 5);
    const asked: string[] = [];
    for (let i = 0; i < 5; i++) {
      expect(s.phase).toBe('recruit');
      expect(s.recruit!.index).toBe(i);
      expect(s.recruit!.question.countryId).toBe('DEU');
      expect(asked).not.toContain(s.recruit!.question.sig);
      asked.push(s.recruit!.question.sig);
      // Nothing can be attacked until recruiting is done.
      expect(reduce(world, s, { type: 'attack', targetId: 'FRA' })).toBe(s);
      s = answerOnce(world, s, true);
    }
    expect(s.phase).toBe('attack');
    expect(s.recruit).toBeNull();
    // Five different kinds of question.
    expect(new Set(asked.map((sig) => sig.split(':')[0])).size).toBe(5);
    expect(s.recentSigs).toEqual(asked);
    const targets = getTargets(world, s.owned);
    expect(targets.land.length + targets.sea.length).toBeGreaterThan(0);
  });

  it('adds 1 / 2 / 3 troops per correct answer and doubles the fifth in a row', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let s = fresh('DEU', seed);
      let expected = START_TROOPS;
      for (let i = 0; i < 5; i++) {
        const base = troopReward(s.recruit!.question.difficulty);
        expected += i === 4 ? base * 2 : base;
        const answered = reduce(world, s, { type: 'answer', index: s.recruit!.question.correctIndex });
        expect(answered.troops).toBe(expected);
        expect(answered.feedback).toMatchObject({ correct: true, troopsGained: i === 4 ? base * 2 : base, multiplier: i === 4 ? 2 : 1 });
        s = reduce(world, answered, { type: 'continue' });
      }
      expect(s.troops).toBe(expected);
      expect(s.streak).toBe(5);
      expect(s.lastEvent).toEqual({ kind: 'recruited', earned: expected - START_TROOPS, correct: 5 });
    }
  });

  it('a perfect phase takes a famous start to 20 troops, and a harder start further', () => {
    const best = (start: string, seed: number) => playRecruit(world, fresh(start, seed), ALL_RIGHT).troops;
    for (let seed = 1; seed <= 25; seed++) {
      // Germany: Easy, Easy, Medium, Medium, then Medium doubled: 1 + 1 + 2 + 2 + 4.
      expect(best('DEU', seed)).toBe(20);
      // Palau is obscure: its questions are harder and pay more.
      expect(best('PLW', seed)).toBeGreaterThan(20);
      expect(best('PLW', seed)).toBeLessThanOrEqual(START_TROOPS + 2 + 2 + 2 + 2 + 6);
    }
  });

  it('a wrong answer earns nothing and resets the streak', () => {
    let s = playRecruit(world, fresh('DEU', 3), [true, true, true]);
    expect(s.streak).toBe(3);
    const before = s.troops;
    s = answerOnce(world, s, false);
    expect(s.troops).toBe(before);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(3);
    // The streak restarts: the next correct answer is not doubled.
    const base = troopReward(s.recruit!.question.difficulty);
    s = answerOnce(world, s, true);
    expect(s.troops).toBe(before + base);
    expect(playRecruit(world, fresh('DEU', 3), ALL_WRONG)).toMatchObject({ troops: START_TROOPS, streak: 0, phase: 'attack' });
  });

  it('opens with a flag and asks for Easy, Easy, Medium, Medium, Hard, as far as the country allows', () => {
    const tiersFor = (start: string, seed: number) => {
      let s = fresh(start, seed);
      const seen: string[] = [];
      for (let i = 0; i < 5; i++) {
        if (i === 0) expect(s.recruit!.question.type).toBe('flag');
        seen.push(s.recruit!.question.difficulty);
        s = answerOnce(world, s, true);
      }
      return seen;
    };
    for (let seed = 1; seed <= 25; seed++) {
      // Romania (mid-known, five neighbours) can reach every tier. Its opening flag scores Easy with
      // far-fetched options and Medium with lookalikes, whichever the coin flip gives.
      const romania = tiersFor('ROU', seed);
      expect(['easy', 'medium']).toContain(romania[0]);
      expect(romania.slice(1)).toEqual(['easy', 'medium', 'medium', 'hard']);
      // France is famous: nothing about it scores Hard, so the last slot is the nearest tier, Medium.
      expect(tiersFor('FRA', seed)).toEqual(['easy', 'easy', 'medium', 'medium', 'medium']);
      // Palau is obscure: nothing about it scores Easy.
      expect(tiersFor('PLW', seed)).toEqual(['medium', 'medium', 'medium', 'medium', 'hard']);
    }
  });

  it('ignores a second answer while feedback is showing', () => {
    const s = fresh('DEU', 3);
    const answered = reduce(world, s, { type: 'answer', index: s.recruit!.question.correctIndex });
    expect(reduce(world, answered, { type: 'answer', index: 0 })).toBe(answered);
  });

  it('happens once: no conquest, retreat or other action ever brings it back', () => {
    let s = playRecruit(world, fresh('DEU', 6), ALL_RIGHT);
    for (let i = 0; i < 6; i++) {
      const targets = getTargets(world, s.owned);
      s = reduce(world, s, { type: 'attack', targetId: targets.land[0] });
      expect(s.phase).toBe('battle');
      s = i % 2 ? reduce(world, s, { type: 'retreat' }) : conquer(world, reduce(world, s, { type: 'retreat' }), targets.land[0]);
      expect(s.phase).toBe('attack');
      expect(s.recruit).toBeNull();
    }
  });
});

describe('troops', () => {
  it('after the opening phase there is no recruiting and no turn to end: the only actions are attack, answer, continue and retreat', () => {
    const s = newGame('DEU');
    // Actions from the old turn structure do nothing.
    for (const type of ['endTurn', 'recruit']) expect(reduce(world, s, { type } as unknown as Action)).toBe(s);
    // Nothing to answer or dismiss outside a battle.
    expect(reduce(world, s, { type: 'answer', index: 0 })).toBe(s);
    expect(reduce(world, s, { type: 'continue' })).toBe(s);
    expect(reduce(world, s, { type: 'retreat' })).toBe(s);
  });

  it('conquering a country is worth a quarter of the defenders it had', () => {
    const seen = new Set<number>();
    for (const start of ['DEU', 'BRA', 'KEN', 'THA', 'AUS', 'NPL']) {
      const base = newGame(start);
      const targets = getTargets(world, base.owned);
      for (const [target, sea] of [...targets.land.map((id) => [id, false] as const), ...targets.sea.map((id) => [id, true] as const)]) {
        const defenders = targetStrength(world, base, target, sea).full;
        const worth = conquestTroops(defenders);
        seen.add(worth);
        expect(worth).toBe(defenders / 4);
        const won = conquer(world, base, target);
        expect(won.owned).toEqual([start, target]);
        expect(won.troops, `${world.byId[target].name} (${defenders} defenders)`).toBe(START_TROOPS + worth);
        expect(won.lastEvent).toMatchObject({ kind: 'conquered', countryId: target, troopsGained: worth });
      }
    }
    // From 0.75 for the smallest up to 4.25: a sea crossing to India or China meets 13 + 4 defenders.
    expect(Math.min(...seen)).toBe(0.75);
    expect(Math.max(...seen)).toBe(4.25);
    // From Germany: France (9 defenders) is worth 2.25, Luxembourg (3) is worth 0.75, and Malta by sea (3 + 1) is worth 1.
    expect(conquer(world, newGame('DEU'), 'FRA').troops).toBe(START_TROOPS + 2.25);
    expect(conquer(world, newGame('DEU'), 'LUX').troops).toBe(START_TROOPS + 0.75);
    expect(conquer(world, newGame('ITA'), 'MLT').troops).toBe(START_TROOPS + 1);
    // Nepal's neighbours are the two biggest countries there are: 13 defenders, 3.25 troops each.
    expect(conquer(world, newGame('NPL'), 'IND').troops).toBe(START_TROOPS + 3.25);
  });

  it('a sea crossing and a large empire add defenders, so they pay more; a wounded country pays for its full strength', () => {
    // Ireland: 6 defenders by land (1.5 troops), 8 by sea from Iceland (2 troops).
    expect(conquer(world, newGame('GBR'), 'IRL').lastEvent).toMatchObject({ troopsGained: 1.5 });
    expect(conquer(world, newGame('ISL'), 'IRL').lastEvent).toMatchObject({ troopsGained: 2 });
    // With 45 countries held France has 12 defenders instead of 9: 3 troops instead of 2.25.
    const big: GameState = { ...newGame('DEU'), troops: 100, owned: ['DEU', ...world.ids.filter((id) => !['DEU', 'FRA'].includes(id)).slice(0, 44)] };
    expect(targetStrength(world, big, 'FRA', false).full).toBe(12);
    expect(conquer(world, big, 'FRA').lastEvent).toMatchObject({ troopsGained: 3 });
    // Retreat from France after beating some of its 9 defenders, then finish it: still worth 2.25.
    let s: GameState = { ...newGame('DEU'), troops: 100 };
    s = reduce(world, s, { type: 'attack', targetId: 'FRA' });
    for (let i = 0; i < 3; i++) s = answerOnce(world, s, true);
    const left = s.battle!.defenders;
    expect(left).toBeLessThan(9);
    s = reduce(world, s, { type: 'retreat' });
    expect(targetStrength(world, s, 'FRA', false)).toEqual({ full: 9, standing: left });
    expect(conquer(world, s, 'FRA').lastEvent).toMatchObject({ troopsGained: 2.25 });
  });

  it('the troops arrive when the country changes hands, and the winning answer says how many', () => {
    let s = reduce(world, newGame('FRA'), { type: 'attack', targetId: 'AND' });
    const reward = conquestTroops(s.battle!.maxDefenders);
    expect(reward).toBe(0.75);
    while (s.battle!.defenders > 1 || s.battle!.question.difficulty === 'hard') {
      if (s.battle!.defenders <= 2 && s.battle!.question.difficulty === 'hard') break;
      s = answerOnce(world, s, true);
    }
    const answered = reduce(world, s, { type: 'answer', index: s.battle!.question.correctIndex });
    expect(answered.feedback).toMatchObject({ correct: true, outcome: 'won', troopsGained: reward });
    expect(answered.troops).toBe(START_TROOPS);
    expect(answered.owned).toEqual(['FRA']);
    const taken = reduce(world, answered, { type: 'continue' });
    expect(taken.troops).toBe(START_TROOPS + reward);
    expect(taken.owned).toEqual(['FRA', 'AND']);
    // Answers that do not win the battle are worth no troops.
    const first = reduce(world, newGame('FRA'), { type: 'attack', targetId: 'ESP' });
    expect(reduce(world, first, { type: 'answer', index: first.battle!.question.correctIndex }).feedback).toMatchObject({ troopsGained: 0 });
  });

  it('nothing but a conquest ever adds troops', () => {
    const w = buildWorld(ALL, 'Europe', FACTS);
    let s = createGame(w, 'DEU', 21, EMPIRE);
    let steps = 0;
    s = playRecruit(w, s, ALL_RIGHT);
    expect(s.troops).toBe(20);
    while (s.phase !== 'victory' && s.phase !== 'gameover' && steps++ < 4000) {
      const before = s;
      if (s.phase === 'attack') {
        const targets = getTargets(w, s.owned);
        s = reduce(w, s, { type: 'attack', targetId: [...targets.land, ...targets.sea][steps % (targets.land.length + targets.sea.length)] });
      } else if (steps % 11 === 0 && s.troops > 1) s = reduce(w, s, { type: 'retreat' });
      else s = answerOnce(w, s, steps % 9 !== 0);
      const conquered = s.owned.length > before.owned.length;
      if (conquered) expect(s.troops - before.troops).toBe(conquestTroops(before.battle!.maxDefenders));
      else expect(s.troops).toBeLessThanOrEqual(before.troops);
    }
    expect(['victory', 'gameover']).toContain(s.phase);
  });
});

describe('battles', () => {
  it('only attackable countries can be attacked', () => {
    const s = newGame('DEU');
    expect(reduce(world, s, { type: 'attack', targetId: 'BRA' })).toBe(s);
    expect(reduce(world, s, { type: 'attack', targetId: 'DEU' })).toBe(s);
    const battle = reduce(world, s, { type: 'attack', targetId: 'FRA' });
    expect(battle.phase).toBe('battle');
    expect(battle.battles).toBe(1);
    expect(battle.battle).toMatchObject({ targetId: 'FRA', sea: false, defenders: 9, maxDefenders: 9 });
    expect(battle.battle!.question.type).toBe('flag');
    expect(battle.battle!.question.countryId).toBe('FRA');
  });

  it('ignores a second answer while feedback is showing', () => {
    const s = reduce(world, newGame('DEU'), { type: 'attack', targetId: 'FRA' });
    const answered = reduce(world, s, { type: 'answer', index: s.battle!.question.correctIndex });
    expect(reduce(world, answered, { type: 'answer', index: 0 })).toBe(answered);
  });

  it('remembers what a battle asked, asks new things on a second attack, and never answers a border question with a held country', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let s: GameState = { ...newGame('DEU', seed), troops: 500 };
      const recruited = [...s.recentSigs];
      expect(recruited).toHaveLength(5);
      s = reduce(world, s, { type: 'attack', targetId: 'POL' });
      const first: string[] = [];
      // Wrong answers keep the battle going; then retreat.
      for (let i = 0; i < 9; i++) {
        const q = s.battle!.question;
        first.push(q.sig);
        if (q.type === 'border') expect(q.options[q.correctIndex].label, q.sig).not.toBe('Germany');
        s = answerOnce(world, s, false);
      }
      // No type comes up twice.
      expect(new Set(first.map((sig) => sig.split(':')[0])).size, first.join(' ')).toBe(9);
      expect(s.recentSigs).toEqual([...recruited, ...first]);
      s = reduce(world, s, { type: 'retreat' });
      expect(s.phase).toBe('attack');
      s = reduce(world, s, { type: 'attack', targetId: 'POL' });
      expect(s.battles).toBe(2);
      expect(s.battle!.question.sig).toBe('flag:POL');
      s = answerOnce(world, s, false);
      for (let i = 0; i < 5; i++) {
        expect(first, `second attack repeated ${s.battle!.question.sig}`).not.toContain(s.battle!.question.sig);
        s = answerOnce(world, s, false);
      }
    }
  });

  it('every battle opens with the target flag, then deals its own shuffled rhythm, kept through a reload', () => {
    const rank = { easy: 0, medium: 1, hard: 2 } as const;
    const tiersIn = (start: string, target: string, seed: number) => {
      let s: GameState = { ...newGame(start, seed), troops: 500 };
      s = reduce(world, s, { type: 'attack', targetId: target });
      expect(s.battle!.question).toMatchObject({ type: 'flag', countryId: target });
      expect(s.battle!.rhythm.slice(0, 6).sort()).toEqual([...RHYTHM_DECK].sort());
      const seen: number[] = [];
      // Wrong answers, so the battle lasts long enough to see every slot.
      for (let i = 0; i < 12 && s.phase === 'battle'; i++) {
        seen.push(rank[s.battle!.question.difficulty]);
        s = answerOnce(world, s, false);
      }
      return { seen, rhythm: s.battle?.rhythm ?? [] };
    };
    const openings = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const romania = tiersIn('HUN', 'ROU', seed);
      openings.add(romania.rhythm.slice(0, 6).join());
      expect(romania.seen.slice(1)).toContain(2);
      // France is famous: Hard only on the genuinely hard kinds (checked in questions.test.ts), and its flag is Easy.
      expect(tiersIn('DEU', 'FRA', seed).seen[0]).toBe(0);
      // Andorra is obscure: no question about it scores Easy, not even its flag.
      expect(Math.min(...tiersIn('FRA', 'AND', seed).seen)).toBe(1);
    }
    // No two games run the same rhythm.
    expect(openings.size).toBeGreaterThan(6);
    // A reload keeps the rhythm; a save from before rhythms existed is given one.
    const battle = reduce(world, { ...newGame('HUN', 3), troops: 500 }, { type: 'attack', targetId: 'ROU' });
    const revived = reviveGame(JSON.parse(JSON.stringify(battle)), () => world)!;
    expect(revived.battle!.rhythm).toEqual(battle.battle!.rhythm);
    const { rhythm: _gone, ...old } = battle.battle!;
    expect(reviveGame({ ...battle, battle: old }, () => world)!.battle!.rhythm).toHaveLength(battle.battle!.rhythm.length);
  });

  it('remembers what was asked across games: a new game steers clear of it and rotates its wrong options', () => {
    // Play a few battles, then carry the memory into a new game.
    let s: GameState = { ...newGame('HUN', 5), troops: 500 };
    s = reduce(world, s, { type: 'attack', targetId: 'ROU' });
    for (let i = 0; i < 6; i++) s = answerOnce(world, s, false);
    const memory = { sigs: s.recentSigs, decoys: s.recentDecoys };
    expect(memory.sigs.length).toBeGreaterThan(8);
    for (const sig of memory.sigs) expect(memory.decoys[sig]).toBeDefined();
    const next = createGame(world, 'HUN', 6, EMPIRE, memory);
    expect(next.recentSigs).toEqual(memory.sigs);
    // The new game's recruit questions about Hungary avoid the ones the last game asked.
    const asked = new Set(memory.sigs);
    let repeat = 0;
    let g = next;
    for (let i = 0; i < 4; i++) {
      if (g.recruit && asked.has(g.recruit.question.sig) && g.recruit.question.type !== 'flag') repeat++;
      g = answerOnce(world, g, true);
    }
    expect(repeat).toBe(0);
  });

  it('keeps its memory small and tidy', () => {
    const q = (sig: string, labels: string[]) => ({ sig, options: [{ label: 'right' }, ...labels.map((label) => ({ label }))], correctIndex: 0 }) as unknown as Parameters<typeof remember>[1];
    let memory = { sigs: [] as string[], decoys: {} as Record<string, string[]> };
    memory = remember(memory, q('capital:DEU', ['A', 'B', 'C']));
    memory = remember(memory, q('capital:DEU', ['D', 'B', 'E']));
    expect(memory.sigs).toEqual(['capital:DEU']);
    expect(memory.decoys['capital:DEU']).toEqual(['D', 'B', 'E', 'A', 'C']);
    for (let i = 0; i < RECENT_SIGS_KEPT + 20; i++) memory = remember(memory, q(`fact:${i}`, ['X', 'Y', 'Z', 'W']));
    expect(memory.sigs).toHaveLength(RECENT_SIGS_KEPT);
    expect(Object.keys(memory.decoys)).toHaveLength(RECENT_SIGS_KEPT);
    expect(memory.decoys['capital:DEU']).toBeUndefined();
    expect(Math.max(...Object.values(memory.decoys).map((d) => d.length))).toBeLessThanOrEqual(DECOYS_KEPT);
    // Stored memory is read defensively.
    expect(sanitizeMemory(null)).toEqual({ sigs: [], decoys: {} });
    expect(sanitizeMemory({ sigs: ['a', 3, 'b'], decoys: { a: ['x', 1], c: ['y'] } })).toEqual({ sigs: ['a', 'b'], decoys: { a: ['x'] } });
  });

  it('a correct answer kills 2 defenders only when the question actually scored Hard', () => {
    let s: GameState = { ...newGame('HUN'), troops: 500 };
    s = reduce(world, s, { type: 'attack', targetId: 'ROU' });
    for (let i = 0; i < 30 && s.phase === 'battle'; i++) {
      const hard = s.battle!.question.difficulty === 'hard';
      const before = s.battle!.defenders;
      const answered = reduce(world, s, { type: 'answer', index: s.battle!.question.correctIndex });
      expect(before - answered.battle!.defenders).toBe(Math.min(before, hard ? 2 : 1));
      s = reduce(world, answered, { type: 'continue' });
    }
    expect(s.owned).toContain('ROU');
  });

  it('winning a battle takes the country and updates the attackable set', () => {
    let s = newGame('DEU');
    expect(getTargets(world, s.owned).land).not.toContain('ESP');
    s = conquer(world, s, 'FRA');
    expect(s.phase).toBe('attack');
    expect(s.owned).toEqual(['DEU', 'FRA']);
    // France had 9 defenders: taking it is worth 2.25 troops.
    expect(s.troops).toBe(START_TROOPS + 2.25);
    expect(s.lives).toBe(START_LIVES);
    expect(s.lastEvent).toEqual({ kind: 'conquered', countryId: 'FRA', continent: null, troopsGained: 2.25 });
    const targets = getTargets(world, s.owned);
    expect(targets.land).not.toContain('FRA');
    expect(targets.land).toContain('ESP');
    // The player attacks again straight away.
    expect(reduce(world, s, { type: 'attack', targetId: 'ESP' })).toMatchObject({ phase: 'battle', battles: 2 });
  });

  it('one life: losing all troops in a battle ends the game', () => {
    let s = newGame('DEU', 2);
    expect(s).toMatchObject({ troops: 10, lives: 1 });
    s = reduce(world, s, { type: 'attack', targetId: 'FRA' });
    for (let i = 0; i < 4; i++) s = answerOnce(world, s, false);
    expect(s).toMatchObject({ phase: 'battle', troops: 2, lives: 1 });
    const answered = reduce(world, s, { type: 'answer', index: null });
    expect(answered.feedback).toMatchObject({ correct: false, timedOut: true, outcome: 'lost', troopsLost: 2 });
    s = reduce(world, answered, { type: 'continue' });
    expect(s).toMatchObject({ phase: 'gameover', troops: 0, lives: 0, battle: null });
    expect(s.owned).toEqual(['DEU']);
    expect(s.lastEvent).toEqual({ kind: 'defeated', countryId: 'FRA' });
    // Nothing more can happen.
    for (const action of [{ type: 'continue' }, { type: 'retreat' }, { type: 'attack', targetId: 'FRA' }] as const) {
      expect(reduce(world, s, action)).toBe(s);
    }
    expect(gameStats(world, s)).toMatchObject({ conquered: 0, score: 0, battles: 1 });
  });

  it('retreating keeps you alive but costs a quarter of the army and the streak, and leaves the target wounded', () => {
    let s = reduce(world, newGame('DEU'), { type: 'attack', targetId: 'FRA' });
    s = answerOnce(world, s, true);
    s = answerOnce(world, s, true);
    expect(s.streak).toBe(2);
    // Two right answers: a defender each, or two for a Hard one.
    const left = s.battle!.defenders;
    expect(left).toBeGreaterThanOrEqual(5);
    expect(left).toBeLessThanOrEqual(7);
    expect(s.battle!.maxDefenders).toBe(9);
    s = reduce(world, s, { type: 'retreat' });
    // A quarter of 10, rounded up.
    expect(s).toMatchObject({ phase: 'attack', streak: 0, lives: START_LIVES, troops: 7, battle: null });
    expect(s.bestStreak).toBe(2);
    expect(s.owned).toEqual(['DEU']);
    expect(s.wounds).toEqual({ FRA: 9 - left });
    expect(s.lastEvent).toEqual({ kind: 'retreated', countryId: 'FRA', troopsLost: 3, defendersLeft: left, defendersFull: 9 });
    expect(targetStrength(world, s, 'FRA', false)).toEqual({ full: 9, standing: left });
  });

  it('a wounded country can be finished off, and wins back 2 defenders each time the player attacks elsewhere', () => {
    // France left with 5 of its 9 defenders beaten (as a retreat leaves it).
    const s: GameState = { ...newGame('DEU'), troops: 100, wounds: { FRA: 5 } };
    expect(targetStrength(world, s, 'FRA', false)).toEqual({ full: 9, standing: 4 });
    // Going straight back in meets only the defenders left standing, however often.
    const again = reduce(world, s, { type: 'attack', targetId: 'FRA' });
    expect(again.battle).toMatchObject({ defenders: 4, maxDefenders: 9 });
    expect(again.wounds).toEqual({ FRA: 5 });
    expect(reduce(world, reduce(world, again, { type: 'retreat' }), { type: 'attack', targetId: 'FRA' }).battle).toMatchObject({ defenders: 4 });
    // Every attack on another country gives France two of them back.
    let later = reduce(world, s, { type: 'attack', targetId: 'POL' });
    expect(later.wounds).toEqual({ FRA: 3 });
    expect(targetStrength(world, later, 'FRA', false).standing).toBe(6);
    later = reduce(world, reduce(world, later, { type: 'retreat' }), { type: 'attack', targetId: 'AUT' });
    expect(later.wounds).toMatchObject({ FRA: 1 });
    later = reduce(world, reduce(world, later, { type: 'retreat' }), { type: 'attack', targetId: 'DNK' });
    expect(later.wounds.FRA).toBeUndefined();
    expect(targetStrength(world, later, 'FRA', false)).toEqual({ full: 9, standing: 9 });
    // Conquering a wounded country clears the wound.
    let won = again;
    let guard = 0;
    while (won.phase === 'battle' && guard++ < 30) won = answerOnce(world, won, true);
    expect(won.owned).toContain('FRA');
    expect(won.wounds).toEqual({});
  });

  it('a retreat can never take the last troop, so the empire can always attack again', () => {
    // With two troops a retreat costs one.
    let s = reduce(world, { ...newGame('DEU'), troops: 2 }, { type: 'attack', targetId: 'FRA' });
    s = reduce(world, s, { type: 'retreat' });
    expect(s).toMatchObject({ phase: 'attack', troops: 1, lives: 1 });
    // With one troop there is nothing to pay with: the battle has to be fought.
    const last = reduce(world, s, { type: 'attack', targetId: 'FRA' });
    expect(last.phase).toBe('battle');
    expect(reduce(world, last, { type: 'retreat' })).toBe(last);
    // Outside a battle the player always has at least one troop, so an attack is always possible.
    expect(reduce(world, s, { type: 'attack', targetId: 'LUX' }).phase).toBe('battle');
  });

  it('defenders grow with the size of the empire', () => {
    const fifteen = world.ids.filter((id) => id !== 'FRA').slice(0, 14);
    const s: GameState = { ...newGame('DEU'), owned: ['DEU', ...fifteen.filter((id) => id !== 'DEU')].slice(0, 15) };
    expect(s.owned).toHaveLength(15);
    expect(targetStrength(world, s, 'FRA', false)).toEqual({ full: 10, standing: 10 });
    expect(targetStrength(world, { owned: ['DEU'], wounds: {} }, 'FRA', false).full).toBe(9);
  });

  it('cannot retreat out of a battle that is already lost', () => {
    let s = reduce(world, newGame('DEU', 2), { type: 'attack', targetId: 'FRA' });
    for (let i = 0; i < 4; i++) s = answerOnce(world, s, false);
    const lost = reduce(world, s, { type: 'answer', index: null });
    expect(reduce(world, lost, { type: 'retreat' })).toBe(lost);
  });

  it('answers count towards the streak, across battles, and a wrong one resets it', () => {
    let s = conquer(world, newGame('DEU'), 'LUX');
    const afterFirst = s.streak;
    expect(afterFirst).toBeGreaterThanOrEqual(2);
    s = reduce(world, s, { type: 'attack', targetId: 'FRA' });
    s = answerOnce(world, s, true);
    s = answerOnce(world, s, true);
    expect(s.streak).toBe(afterFirst + 2);
    s = answerOnce(world, s, false);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(afterFirst + 2);
  });

  it('sea battles add extra defenders', () => {
    let s = newGame('ISL');
    const targets = getTargets(world, s.owned);
    expect(targets.land).toEqual([]);
    const target = targets.sea[0];
    s = reduce(world, s, { type: 'attack', targetId: target });
    expect(s.battle).toMatchObject({ targetId: target, sea: true });
    expect(s.battle!.defenders).toBe(battleDefenders(world.byId[target].population, true));
    const base = defendersFor(world.byId[target].population);
    expect(s.battle!.defenders).toBe(base + seaBonus(base));
    expect(s.battle!.defenders).toBeGreaterThan(base);
  });

  it('never repeats a question within a battle', () => {
    let s: GameState = { ...newGame('DEU'), troops: 200 };
    s = reduce(world, s, { type: 'attack', targetId: 'FRA' });
    const seen: string[] = [];
    // Wrong answers drag the battle out.
    for (let i = 0; i < 40 && s.phase === 'battle'; i++) {
      expect(seen).not.toContain(s.battle!.question.sig);
      seen.push(s.battle!.question.sig);
      s = answerOnce(world, s, false);
    }
    expect(seen.length).toBe(40);
  });
});

describe('endings', () => {
  // Two continents: Europe = AAA + BBB, Asia = CCC.
  const mini = buildWorld(
    [
      fake('AAA', { borders: ['BBB'] }),
      fake('BBB', { borders: ['AAA', 'CCC'], population: 500_000 }),
      fake('CCC', { borders: ['BBB'], continent: 'Asia', subregion: 'Farland', population: 500_000 }),
      // Filler so questions have enough wrong options to draw on.
      ...['DDD', 'EEE', 'FFF', 'GGG'].map((id) => fake(id, { continent: 'Oceania', subregion: 'Elsewhere', lat: 60, lng: 170 })),
    ],
    'World',
  );

  it('conquering a whole continent earns bonus points, once, and no extra life', () => {
    let s = conquer(mini, playRecruit(mini, createGame(mini, 'AAA', 1, EMPIRE), ALL_RIGHT), 'BBB');
    expect(s.lives).toBe(1);
    expect(s.continentsCompleted).toEqual(['Europe']);
    expect(s.lastEvent).toMatchObject({ kind: 'conquered', countryId: 'BBB', continent: 'Europe' });
    expect(gameStats(mini, s)).toMatchObject({ conquered: 1, continents: ['Europe'], continentBonus: CONTINENT_BONUS, score: 1.5 + 10 });
    s = conquer(mini, s, 'CCC');
    expect(s.lives).toBe(1);
    expect(s.continentsCompleted).toEqual(['Europe', 'Asia']);
    expect(gameStats(mini, s)).toMatchObject({ conquered: 2, continentBonus: 20, score: 3 + 20, battles: 2 });
  });

  it('a conquest that does not complete a continent earns no bonus', () => {
    const s = conquer(world, newGame('DEU'), 'LUX');
    expect(s.lastEvent).toMatchObject({ kind: 'conquered', countryId: 'LUX', continent: null });
    expect(gameStats(world, s)).toMatchObject({ conquered: 1, continents: [], continentBonus: 0, score: 1 });
  });

  it('owning every country in the mode is victory', () => {
    const europe = buildWorld(mini.all, 'Europe');
    expect(europe.ids).toEqual(['AAA', 'BBB']);
    const s = conquer(europe, playRecruit(europe, createGame(europe, 'AAA', 1, EMPIRE), ALL_RIGHT), 'BBB');
    expect(s.phase).toBe('victory');
    expect(gameStats(europe, s)).toMatchObject({ conquered: 1, owned: 2, total: 2, score: 1.5 + CONTINENT_BONUS, battles: 1 });
    expect(reduce(europe, s, { type: 'attack', targetId: 'BBB' })).toBe(s);
  });

  it('a full continent campaign can be played from start to victory', () => {
    for (const [mode, start] of [
      ['South America', 'BRA'],
      ['Oceania', 'NZL'],
      ['Europe', 'CHE'],
    ] as const) {
      const w = buildWorld(ALL, mode);
      let s = playRecruit(w, createGame(w, start, 77, EMPIRE), ALL_RIGHT);
      const recruited = s.troops;
      expect(recruited).toBeGreaterThanOrEqual(20);
      let steps = 0;
      let earned = 0;
      while (s.phase !== 'victory' && steps++ < 20000) {
        if (s.phase === 'battle') {
          const worth = conquestTroops(s.battle!.maxDefenders);
          const before = s.owned.length;
          s = answerOnce(w, s, true);
          if (s.owned.length > before) earned += worth;
        }
        else if (s.phase === 'attack') {
          const targets = getTargets(w, s.owned);
          const options = [...targets.land, ...targets.sea];
          expect(options.length).toBeGreaterThan(0);
          s = reduce(w, s, { type: 'attack', targetId: options[0] });
          expect(s.phase).toBe('battle');
        } else throw new Error(`unexpected phase ${s.phase}`);
      }
      expect(s.phase).toBe('victory');
      expect(new Set(s.owned)).toEqual(new Set(w.ids));
      const stats = gameStats(w, s);
      expect(stats.conquered).toBe(w.ids.length - 1);
      expect(stats.battles).toBe(w.ids.length - 1);
      expect(stats.continents).toEqual([mode]);
      expect(stats.score).toBe((w.ids.length - 1) * s.multiplier + CONTINENT_BONUS);
      // A flawless campaign ends with the recruited army plus what the conquests were worth.
      expect(earned).toBeGreaterThanOrEqual(w.ids.length - 1);
      expect(s.troops).toBe(recruited + earned);
    }
  });

  it('a careless player eventually reaches game over, never a dead end', () => {
    const w = buildWorld(ALL, 'Africa');
    for (const retreats of [false, true]) {
      let s = playRecruit(w, createGame(w, 'TCD', 5, EMPIRE), [true, false, true, false, false]);
      let steps = 0;
      while (s.phase !== 'gameover' && s.phase !== 'victory' && steps++ < 5000) {
        const before = s;
        if (s.phase === 'battle') {
          // The retreating player pulls out whenever a retreat is allowed, every third step.
          const retreated = retreats && steps % 3 === 0 ? reduce(w, s, { type: 'retreat' }) : s;
          s = retreated !== s ? retreated : answerOnce(w, s, steps % 4 === 0);
        } else {
          const targets = getTargets(w, s.owned);
          expect(s.troops).toBeGreaterThan(0);
          s = reduce(w, s, { type: 'attack', targetId: [...targets.land, ...targets.sea][0] });
        }
        expect(s).not.toBe(before);
      }
      expect(s.phase).toBe('gameover');
      expect(s.lives).toBe(0);
      expect(s.troops).toBe(0);
    }
  });
});

describe('save and resume', () => {
  const worldFor = (mode: string) => (mode === 'World' ? world : null);

  it('a saved game survives a JSON round trip and plays on identically', () => {
    let s = reduce(world, newGame('DEU', 9), { type: 'attack', targetId: 'FRA' });
    s = answerOnce(world, s, true);
    const revived = reviveGame(JSON.parse(JSON.stringify(s)), worldFor);
    expect(revived).toEqual(s);
    expect(answerOnce(world, revived!, true)).toEqual(answerOnce(world, s, true));
  });

  it('rejects saves it cannot resume', () => {
    const s = newGame('DEU', 9);
    expect(reviveGame(s, worldFor)).toEqual(s);
    // A game saved in the middle of its recruit phase resumes there.
    const recruiting = answerOnce(world, fresh('DEU', 9), true);
    expect(reviveGame(JSON.parse(JSON.stringify(recruiting)), worldFor)).toEqual(recruiting);
    expect(reviveGame(null, worldFor)).toBeNull();
    expect(reviveGame('nope', worldFor)).toBeNull();
    expect(reviveGame({ ...s, version: 0 }, worldFor)).toBeNull();
    // A save from the version with turns and recruit phases.
    expect(reviveGame({ ...s, version: 3, phase: 'recruit', turn: 2 }, worldFor)).toBeNull();
    expect(reviveGame({ ...s, phase: 'recruit', recruit: null }, worldFor)).toBeNull();
    expect(reviveGame({ ...s, battles: undefined }, worldFor)).toBeNull();
    expect(reviveGame({ ...s, owned: ['XXX'] }, worldFor)).toBeNull();
    expect(reviveGame({ ...s, mode: 'Atlantis' }, worldFor)).toBeNull();
    expect(reviveGame({ ...s, phase: 'battle', battle: null }, worldFor)).toBeNull();
    expect(reviveGame({ ...s, empire: undefined }, worldFor)).toBeNull();
    expect(reviveGame({ ...s, empire: { name: 'X', flag: { pattern: 99, colours: ['#fff', 'red', 'blue'] } } }, worldFor)).toBeNull();
  });
});

describe('DECIMATE', () => {
  /** A game in the attack phase with a long streak behind it. */
  const onAStreak = (streak: number): GameState => ({ ...newGame('DEU'), streak, troops: 50 });

  it('is earned when a country falls while the streak is at 25 or more', () => {
    expect(DECIMATE_STREAK).toBe(25);
    const s = conquer(world, onAStreak(DECIMATE_STREAK - 1), 'LUX');
    expect(s.streak).toBeGreaterThanOrEqual(DECIMATE_STREAK);
    expect(s.decimateReady).toBe(true);
    // Short of 25 when the country falls: nothing.
    expect(conquer(world, onAStreak(0), 'LUX').decimateReady).toBe(false);
  });

  it('is lost with a single mistake before the country falls, even past 25', () => {
    let s = reduce(world, onAStreak(DECIMATE_STREAK + 4), { type: 'attack', targetId: 'FRA' });
    s = answerOnce(world, s, false);
    while (s.phase === 'battle') s = answerOnce(world, s, true);
    expect(s.owned).toContain('FRA');
    expect(s.decimateReady).toBe(false);
  });

  it('takes any target outright: no battle questions, full spoils, one battle, streak back to 0', () => {
    const ready = conquer(world, onAStreak(DECIMATE_STREAK), 'LUX');
    expect(ready.decimateReady).toBe(true);
    const targets = getTargets(world, ready.owned);
    const target = targets.sea[0] ?? targets.land[0];
    const sea = targets.sea.includes(target);
    const { full } = targetStrength(world, ready, target, sea);
    const s = reduce(world, ready, { type: 'decimate', targetId: target });
    expect(s.owned).toContain(target);
    expect(s.phase).toBe('attack');
    expect(s.battle).toBeNull();
    expect(s.troops).toBe(ready.troops + conquestTroops(full));
    expect(s.battles).toBe(ready.battles + 1);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(ready.bestStreak);
    expect(s.decimateReady).toBe(false);
    expect(s.lastEvent).toMatchObject({ kind: 'conquered', countryId: target, troopsGained: conquestTroops(full), decimated: true });
    // The leaderboard's own check still holds: at least as many battles as conquests.
    expect(s.battles).toBeGreaterThanOrEqual(s.owned.length - 1);
  });

  it('cannot be held: a normal attack gives it up, and it cannot be used without one ready', () => {
    const ready = conquer(world, onAStreak(DECIMATE_STREAK), 'LUX');
    const target = getTargets(world, ready.owned).land[0];
    expect(reduce(world, ready, { type: 'attack', targetId: target }).decimateReady).toBe(false);
    const plain = newGame('DEU');
    expect(reduce(world, plain, { type: 'decimate', targetId: 'FRA' })).toBe(plain);
    // Nor on a country that is not a target.
    expect(reduce(world, ready, { type: 'decimate', targetId: 'JPN' })).toBe(ready);
  });

  it('survives a reload while ready', () => {
    const ready = conquer(world, onAStreak(DECIMATE_STREAK), 'LUX');
    expect(reviveGame(JSON.parse(JSON.stringify(ready)), () => world)!.decimateReady).toBe(true);
    const { decimateReady: _gone, ...old } = ready;
    expect(reviveGame(old, () => world)!.decimateReady).toBe(false);
  });
});

