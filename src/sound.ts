// Chiptune sound effects, synthesised with Web Audio: no audio files to load.

const MUTE_KEY = 'atlas-conquest:muted';
const SCALE = [0, 2, 4, 5, 7, 9, 11];
const BASE_HZ = 440;
/** The pitch stops climbing here (two octaves and a fourth up) so long streaks do not become a whistle. */
const MAX_STEPS = 17;

/**
 * Pitch of the "correct" blip for a streak. Each correct answer in a row
 * climbs one note of a major scale, starting at A4.
 */
export function streakFrequency(streak: number): number {
  const step = Math.max(0, Math.min(MAX_STEPS, Math.floor(streak) - 1));
  const semitones = 12 * Math.floor(step / SCALE.length) + SCALE[step % SCALE.length];
  return BASE_HZ * 2 ** (semitones / 12);
}

export interface SoundEvent {
  name: string;
  /** Lead frequency in Hz. */
  hz: number;
}

/** The last few sounds requested, whether or not audio could play. Lets tests hear the game. */
export const soundLog: SoundEvent[] = [];

let context: AudioContext | null = null;
let muted = false;
try {
  muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
} catch {
  muted = false;
}

function audio(): AudioContext | null {
  if (muted || typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context ??= new Ctor();
    // Browsers keep audio suspended until the player has interacted with the page.
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

interface Note {
  hz: number;
  /** Seconds after now. */
  at?: number;
  seconds?: number;
  wave?: OscillatorType;
  volume?: number;
  /** Glide to this frequency over the note. */
  slideTo?: number;
}

function play(name: string, notes: Note[]): void {
  soundLog.push({ name, hz: notes[0].hz });
  if (soundLog.length > 60) soundLog.shift();
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const note of notes) {
    const start = now + (note.at ?? 0);
    const seconds = note.seconds ?? 0.12;
    const volume = note.volume ?? 0.07;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.wave ?? 'square';
    osc.frequency.setValueAtTime(note.hz, start);
    if (note.slideTo) osc.frequency.exponentialRampToValueAtTime(note.slideTo, start + seconds);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }
}

export const sound = {
  /** Coin-style blip whose pitch climbs with the streak. */
  correct(streak: number) {
    const hz = streakFrequency(streak);
    play('correct', [
      { hz, seconds: 0.09 },
      { hz: hz * 1.5, at: 0.07, seconds: 0.2 },
    ]);
  },
  wrong() {
    play('wrong', [
      { hz: 196, seconds: 0.16, wave: 'sawtooth', volume: 0.08, slideTo: 130 },
      { hz: 123, at: 0.14, seconds: 0.3, wave: 'sawtooth', volume: 0.08, slideTo: 82 },
    ]);
  },
  /** Last seconds of the countdown. */
  tick() {
    play('tick', [{ hz: 1320, seconds: 0.05, volume: 0.045 }]);
  },
  conquer() {
    play('conquer', [523.25, 659.25, 783.99, 1046.5].map((hz, i) => ({ hz, at: i * 0.09, seconds: i === 3 ? 0.4 : 0.12 })));
  },
  recruited() {
    play('recruited', [
      { hz: 392, seconds: 0.1, wave: 'triangle', volume: 0.1 },
      { hz: 587.33, at: 0.1, seconds: 0.22, wave: 'triangle', volume: 0.1 },
    ]);
  },
  retreat() {
    play('retreat', [{ hz: 330, seconds: 0.25, wave: 'triangle', volume: 0.1, slideTo: 220 }]);
  },
  victory() {
    play('victory', [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].map((hz, i) => ({ hz, at: i * 0.12, seconds: i === 6 ? 0.7 : 0.14 })));
  },
  gameOver() {
    play('gameOver', [330, 294, 262, 220, 165].map((hz, i) => ({ hz, at: i * 0.2, seconds: i === 4 ? 0.8 : 0.24, wave: 'triangle' as const, volume: 0.12 })));
  },
  /** Small click for picking things. */
  select() {
    play('select', [{ hz: 660, seconds: 0.04, volume: 0.04 }]);
  },
  isMuted: () => muted,
  setMuted(next: boolean) {
    muted = next;
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      // Not being able to remember the setting is fine.
    }
    if (next && context && context.state === 'running') void context.suspend();
  },
};
