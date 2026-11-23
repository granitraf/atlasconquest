import { describe, expect, it } from 'vitest';
import { pickBritishVoice, sound, soundLog, streakFrequency } from '../src/sound';

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

  it('has a blip for picking, a pulse for hovering and a snap for committing', () => {
    soundLog.length = 0;
    sound.select();
    sound.pulse();
    sound.snap();
    expect(soundLog.map((s) => s.name)).toEqual(['select', 'pulse', 'snap']);
    // The pulse is a low, soft note; the snap is a clean tone well above it.
    expect(soundLog[1].hz).toBeLessThan(500);
    expect(soundLog[2].hz).toBeGreaterThan(1000);
  });

  it('drops hover pulses that come too close together', async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
    soundLog.length = 0;
    sound.pulse();
    sound.pulse();
    sound.pulse();
    expect(soundLog.map((s) => s.name)).toEqual(['pulse']);
    await new Promise((resolve) => setTimeout(resolve, 80));
    sound.pulse();
    expect(soundLog.map((s) => s.name)).toEqual(['pulse', 'pulse']);
  });

  it('picking where to begin is the snap with a whoosh over it', () => {
    soundLog.length = 0;
    sound.zoom();
    expect(soundLog.map((s) => s.name)).toEqual(['snap', 'whoosh']);
  });

  it('the Attack button fires two deep shots', () => {
    soundLog.length = 0;
    sound.attack();
    expect(soundLog.map((s) => s.name)).toEqual(['attack']);
    // Low: it starts below the pulse and far below the snap.
    expect(soundLog[0].hz).toBeLessThan(450);
  });

  it('beginning the conquest sounds a two-note call that rises', () => {
    soundLog.length = 0;
    sound.siege();
    expect(soundLog).toEqual([{ name: 'siege', hz: 392 }]);
  });

  it('the countdown ticks like a clock: tick, tock, and sharper on the last second', () => {
    soundLog.length = 0;
    for (const left of [5, 4, 3, 2, 1]) sound.tick(left);
    expect(soundLog.map((s) => s.name)).toEqual(['tick', 'tick', 'tick', 'tick', 'tick']);
    const [five, four, three, two, one] = soundLog.map((s) => s.hz);
    expect(five).toBe(three);
    expect(four).toBe(two);
    expect(four).toBeLessThan(five);
    expect(one).toBeGreaterThan(five);
  });

  it('says campaign names aloud, and records what was said even where nothing can speak', () => {
    soundLog.length = 0;
    for (const name of ['World', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']) sound.say(name);
    expect(soundLog.map((s) => s.name)).toEqual(Array(7).fill('voice'));
    expect(soundLog.map((s) => s.text)).toEqual(['World', 'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']);
  });
});

describe('the campaign voice', () => {
  const voice = (name: string, lang = 'en-GB', localService = true) => ({ name, lang, localService });
  // The British voices Chrome lists on a Mac, in the order it lists them.
  const mac = ['Arthur', 'Daniel (English (United Kingdom))', 'Eddy (English (United Kingdom))', 'Flo (English (United Kingdom))', 'Grandma (English (United Kingdom))', 'Grandpa (English (United Kingdom))', 'Martha', 'Reed (English (United Kingdom))', 'Rocko (English (United Kingdom))', 'Sandy (English (United Kingdom))', 'Shelley (English (United Kingdom))'].map((name) => voice(name));

  it('picks the clean British voice on a Mac, never the robotic Grandpa', () => {
    expect(pickBritishVoice(mac)?.name).toBe('Daniel (English (United Kingdom))');
    expect(pickBritishVoice(mac.filter((v) => !v.name.startsWith('Daniel')))?.name).toBe('Arthur');
  });

  it('prefers a higher-quality download, and the good voices of other browsers', () => {
    expect(pickBritishVoice([...mac, voice('Daniel (Enhanced)')])?.name).toBe('Daniel (Enhanced)');
    expect(pickBritishVoice([voice('Google UK English Female', 'en-GB', false), voice('Google UK English Male', 'en-GB', false), voice('Google US English', 'en-US', false)])?.name).toBe('Google UK English Male');
    expect(pickBritishVoice([voice('Microsoft Hazel - English (United Kingdom)'), voice('Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB', false)])?.name).toBe('Microsoft Ryan Online (Natural) - English (United Kingdom)');
  });

  it('uses a robotic voice only when there is nothing else, and lets the browser choose when there is no English at all', () => {
    expect(pickBritishVoice([voice('Grandpa (English (United Kingdom))'), voice('Samantha', 'en-US')])?.name).toBe('Samantha');
    expect(pickBritishVoice([voice('Grandpa (English (United Kingdom))')])?.name).toBe('Grandpa (English (United Kingdom))');
    expect(pickBritishVoice([voice('Amélie', 'fr-CA')])).toBeNull();
  });
});
