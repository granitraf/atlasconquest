// Chiptune sound effects, synthesised with Web Audio: no audio files to load.
// The one voice in the game (the campaign names) is spoken by the browser's own speech synthesis.

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
  /** Lead frequency in Hz (0 for a spoken word). */
  hz: number;
  /** What was said, for the voice. */
  text?: string;
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

/** A burst of filtered noise: clicks, snaps and rushes of air. */
interface Burst {
  /** Seconds after now. */
  at?: number;
  seconds: number;
  volume?: number;
  filter: BiquadFilterType;
  /** Filter frequency in Hz, and where it sweeps to over the burst. */
  from: number;
  to?: number;
  q?: number;
  /** Seconds taken to reach full volume: near zero for a click, longer for a swell. */
  attack?: number;
}

let noiseBuffer: AudioBuffer | null = null;
/** One second of white noise, made once and reused. */
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  // A fixed sequence, so every snap and whoosh sounds the same.
  let seed = 22222;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 16807) % 2147483647;
    data[i] = (seed / 2147483647) * 2 - 1;
  }
  return noiseBuffer;
}

function log(event: SoundEvent): void {
  soundLog.push(event);
  if (soundLog.length > 60) soundLog.shift();
}

function play(name: string, notes: Note[], bursts: Burst[] = []): void {
  log({ name, hz: notes[0]?.hz ?? bursts[0]?.from ?? 0 });
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
  for (const burst of bursts) {
    const start = now + (burst.at ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = noise(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = burst.filter;
    filter.Q.value = burst.q ?? 1;
    filter.frequency.setValueAtTime(burst.from, start);
    if (burst.to) filter.frequency.exponentialRampToValueAtTime(burst.to, start + burst.seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(burst.volume ?? 0.08, start + (burst.attack ?? 0.002));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + burst.seconds);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(start);
    source.stop(start + burst.seconds + 0.02);
  }
}

/**
 * The click for committing to a choice: clean and short. Two pure tones a fifth
 * apart that die away at once, with no noise in it at all (noise is what made
 * the earlier version crackle).
 */
const SNAP: { notes: Note[]; bursts: Burst[] } = {
  notes: [
    { hz: 1046.5, seconds: 0.055, wave: 'sine', volume: 0.085 },
    { hz: 1568, seconds: 0.03, wave: 'sine', volume: 0.03 },
  ],
  bursts: [],
};
/** A rush of air that rises as the camera closes in. */
const WHOOSH: Burst = { at: 0.03, seconds: 0.42, volume: 0.085, filter: 'bandpass', from: 320, to: 2600, q: 1.4, attack: 0.16 };

/** Hover pulses closer together than this are dropped, so sweeping across the map does not machine-gun. */
const PULSE_GAP_MS = 55;
let lastPulse = -Infinity;

/**
 * The clean, natural-sounding British men's voices, best first, by the names they go by on macOS and iOS,
 * Chrome, Edge and Windows, and Android. A higher-quality download of any of them ("Premium", "Enhanced",
 * "Natural", "Neural") beats the standard one.
 */
const CLEAN_BRITISH_MEN = [/daniel/i, /arthur/i, /google uk english male/i, /\b(ryan|thomas|alfie|elliot|oliver|noah)\b/i, /\b(george|malcolm)\b/i, /gbd|rjs|\bmale\b/i];
const HIGH_QUALITY = /premium|enhanced|natural|neural/i;

/**
 * Apple's novelty voices: deliberately old-fashioned and robotic (Grandpa, Grandma, Eddy, Reed, Rocko, Sandy,
 * Shelley, Flo), plus the joke ones. Used only if a device has nothing else.
 */
const ROBOTIC = /grandpa|grandma|\beddy\b|\breed\b|rocko|sandy|shelley|\bflo\b|albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy/i;

/** Picks the clearest British man's voice from a device's list, or null to let the browser choose. */
export function pickBritishVoice<V extends Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'>>(voices: readonly V[]): V | null {
  const british = voices.filter((voice) => /^en[-_]GB/i.test(voice.lang));
  const rank = (voice: V) => {
    if (ROBOTIC.test(voice.name)) return -100;
    const known = CLEAN_BRITISH_MEN.findIndex((name) => name.test(voice.name));
    return (known === -1 ? 0 : 20 - 2 * known) + (HIGH_QUALITY.test(voice.name) ? 30 : 0) + (voice.localService ? 1 : 0);
  };
  const best = [...british].sort((a, b) => rank(b) - rank(a))[0];
  if (best && rank(best) > -100) return best;
  return voices.find((voice) => /^en/i.test(voice.lang) && !ROBOTIC.test(voice.name)) ?? best ?? null;
}

function britishVoice(): SpeechSynthesisVoice | null {
  return pickBritishVoice(window.speechSynthesis.getVoices());
}

// Voices load a moment after the page does; asking early means they are there by the first click.
try {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.getVoices();
} catch {
  // No speech on this device: campaign names fall back to the selection blip.
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
  /**
   * The countdown's last seconds, as a clock: a dry wooden tick, alternating
   * with a slightly lower tock, and sharper on the final second.
   */
  tick(secondsLeft = 1) {
    const tock = secondsLeft % 2 === 0;
    const last = secondsLeft <= 1;
    play(
      'tick',
      [{ hz: last ? 1500 : tock ? 820 : 1080, seconds: 0.045, wave: 'triangle', volume: last ? 0.11 : 0.085 }],
      [{ seconds: 0.02, volume: last ? 0.13 : 0.1, filter: 'bandpass', from: tock ? 1700 : 2300, q: 3 }],
    );
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
  /** Small click for picking things: flags, colours, difficulty filters. */
  select() {
    play('select', [{ hz: 660, seconds: 0.04, volume: 0.04 }]);
  },
  /** A light pulse as the pointer passes over something that can be picked. */
  pulse() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastPulse < PULSE_GAP_MS) return;
    lastPulse = now;
    play('pulse', [
      { hz: 392, seconds: 0.085, wave: 'sine', volume: 0.05, slideTo: 440 },
      { hz: 784, seconds: 0.05, wave: 'sine', volume: 0.014 },
    ]);
  },
  /** A clean, snappy click, for committing to a choice. */
  snap() {
    play('snap', SNAP.notes, SNAP.bursts);
  },
  /** Picking where the conquest begins: the snap, with a whoosh over it as the map zooms in. */
  zoom() {
    play('snap', SNAP.notes, SNAP.bursts);
    play('whoosh', [{ hz: 180, at: 0.03, seconds: 0.4, wave: 'sine', volume: 0.03, slideTo: 520 }], [WHOOSH]);
  },
  /**
   * The Attack button: two deep shots, "pew pew". Each is a low tone that drops
   * fast, with a thump under it and a dull puff of low noise for the report.
   */
  attack() {
    const shot = (at: number): Note[] => [
      { hz: 420, at, seconds: 0.17, wave: 'sawtooth', volume: 0.085, slideTo: 70 },
      { hz: 210, at, seconds: 0.19, wave: 'square', volume: 0.05, slideTo: 45 },
      { hz: 120, at, seconds: 0.14, wave: 'sine', volume: 0.2, slideTo: 42 },
    ];
    const report = (at: number): Burst => ({ at, seconds: 0.07, volume: 0.07, filter: 'lowpass', from: 650, to: 180 });
    play('attack', [...shot(0), ...shot(0.21)], [report(0), report(0.21)]);
  },
  /** The siege begins: a two-note trumpet call, "da-TUM", over a drum. */
  siege() {
    const brass = (hz: number, at: number, seconds: number, volume: number): Note[] => [
      { hz, at, seconds, wave: 'sawtooth', volume },
      { hz: hz * 1.003, at, seconds, wave: 'square', volume: volume * 0.45 },
      { hz: hz / 2, at, seconds, wave: 'triangle', volume: volume * 0.7 },
    ];
    play(
      'siege',
      [
        // "da": a short pick-up note. "TUM": a fourth up, held, with the fifth above ringing through it.
        ...brass(392, 0, 0.13, 0.075),
        ...brass(523.25, 0.16, 0.62, 0.095),
        { hz: 783.99, at: 0.16, seconds: 0.55, wave: 'sawtooth', volume: 0.04 },
        // A drum under each note.
        { hz: 150, at: 0, seconds: 0.12, wave: 'sine', volume: 0.16, slideTo: 60 },
        { hz: 130, at: 0.16, seconds: 0.3, wave: 'sine', volume: 0.22, slideTo: 45 },
      ],
      [{ at: 0.16, seconds: 0.1, volume: 0.05, filter: 'lowpass', from: 900 }],
    );
  },
  /**
   * Says a word aloud in a British gentleman's voice: the clearest British man's voice
   * the device has, a touch lower and slower than usual. Where the device cannot speak,
   * the selection blip plays instead.
   */
  say(text: string) {
    log({ name: 'voice', hz: 0, text });
    if (muted || typeof window === 'undefined') return;
    try {
      if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') throw new Error('no speech');
      const words = new SpeechSynthesisUtterance(text);
      const voice = britishVoice();
      if (voice) words.voice = voice;
      words.lang = voice?.lang ?? 'en-GB';
      // Only a little lower and slower: pushed any further, speech synthesis turns metallic.
      words.pitch = 0.85;
      words.rate = 0.9;
      words.volume = 0.9;
      // A new word cuts off the last one rather than queueing behind it.
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(words);
    } catch {
      play('select', [{ hz: 660, seconds: 0.04, volume: 0.04 }]);
    }
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
    try {
      if (next && typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch {
      // Nothing was being said.
    }
  },
};
