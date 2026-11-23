import { describe, expect, it } from 'vitest';
import { sound, soundLog, streakFrequency } from '../src/sound';

describe('streak pitch', () => {
  it('starts at A4', () => {
    expect(streakFrequency(1)).toBeCloseTo(440);
    expect(streakFrequency(0)).toBeCloseTo(440);
  });

  it('rises with every correct answer in a row', () => {
    for (let streak = 1; streak < 18; streak++) {
      expect(streakFrequency(streak + 1)).toBeGreaterThan(streakFrequency(streak));
    }
  });

  it('climbs a major scale: an octave after seven steps', () => {
    expect(streakFrequency(8)).toBeCloseTo(880);
    expect(streakFrequency(3) / streakFrequency(1)).toBeCloseTo(2 ** (4 / 12));
    expect(streakFrequency(15)).toBeCloseTo(1760);
  });

  it('stops climbing eventually instead of becoming a whistle', () => {
    expect(streakFrequency(18)).toBe(streakFrequency(500));
    expect(streakFrequency(500)).toBeLessThan(2500);
  });

  it('records what it plays, even where there is no audio device', () => {
    soundLog.length = 0;
    sound.correct(1);
    sound.correct(2);
    sound.wrong();
    expect(soundLog.map((s) => s.name)).toEqual(['correct', 'correct', 'wrong']);
    expect(soundLog[1].hz).toBeGreaterThan(soundLog[0].hz);
  });
});
