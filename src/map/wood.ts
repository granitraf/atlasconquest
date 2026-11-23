import { createRng, randInt } from '../game/rng';

// A pixel-art wood plank texture for the space above and below the map on the
// start screen. It is drawn once into a small tile and used as a repeating CSS
// background, so it stretches across any monitor width and never zooms with the map.

/** Size of the tile in texture pixels. */
const TILE_W = 256;
const PLANK_H = 12;
const PLANKS = 6;
const TILE_H = PLANK_H * PLANKS;
/** Screen pixels per texture pixel. */
const SCALE = 4;

type Rgb = [number, number, number];
const SEAM: Rgb = [24, 14, 7];
const NAIL: Rgb = [16, 10, 5];
const NAIL_GLINT: Rgb = [168, 128, 58];
/** Plank base colours: the same browns as the panels, a little lighter. */
const BOARDS: Rgb[] = [
  [86, 58, 32],
  [78, 52, 28],
  [94, 64, 36],
  [72, 47, 25],
];

const shade = (c: Rgb, by: number): Rgb => [c[0] + by, c[1] + by * 0.72, c[2] + by * 0.45];

/** Draws the tile and returns it as a data URL, or null where canvas is unavailable. */
export function woodTexture(): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_W * SCALE;
  canvas.height = TILE_H * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rng = createRng(1789);
  const px = (x: number, y: number, c: Rgb) => {
    ctx.fillStyle = `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
    // Wrap horizontally so the tile repeats without a visible join.
    ctx.fillRect((((x % TILE_W) + TILE_W) % TILE_W) * SCALE, y * SCALE, SCALE, SCALE);
  };

  for (let plank = 0; plank < PLANKS; plank++) {
    const top = plank * PLANK_H;
    // Long boards: each row is cut into two or three lengths, staggered against its neighbours.
    const joints = plank % 2 === 0 ? [40 + randInt(rng, 30), 170 + randInt(rng, 40)] : [100 + randInt(rng, 50)];
    const boardAt = (x: number) => joints.filter((j) => x >= j).length;
    const tones = Array.from({ length: joints.length + 1 }, () => BOARDS[randInt(rng, BOARDS.length)]);

    for (let x = 0; x < TILE_W; x++) {
      const base = tones[boardAt(x)];
      for (let y = 0; y < PLANK_H; y++) {
        // A lit top edge and a shadowed bottom edge give each plank some depth.
        const edge = y === 0 ? 14 : y === 1 ? 6 : y === PLANK_H - 2 ? -8 : 0;
        px(x, top + y, y === PLANK_H - 1 ? SEAM : shade(base, edge));
      }
    }

    // Grain: thin streaks running along the board, lighter and darker than the wood.
    for (let streak = 0; streak < 26; streak++) {
      const y = top + 1 + randInt(rng, PLANK_H - 3);
      const start = randInt(rng, TILE_W);
      const length = 6 + randInt(rng, 40);
      const by = rng() < 0.55 ? -(7 + randInt(rng, 9)) : 6 + randInt(rng, 8);
      for (let i = 0; i < length; i++) {
        const x = (start + i) % TILE_W;
        if (joints.includes(x)) continue;
        px(x, y, shade(tones[boardAt(x)], by));
      }
    }

    // A knot here and there: a dark eye with a paler ring.
    if (rng() < 0.7) {
      const kx = 12 + randInt(rng, TILE_W - 24);
      const ky = top + 4 + randInt(rng, PLANK_H - 8);
      const base = tones[boardAt(kx)];
      for (const [dx, dy] of [[-2, 0], [2, 0], [-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]) px(kx + dx, ky + dy, shade(base, 9));
      for (const dx of [-1, 0, 1]) px(kx + dx, ky, shade(base, -22));
    }

    // Where two boards meet: a dark joint with a nail either side.
    for (const joint of joints) {
      for (let y = 0; y < PLANK_H - 1; y++) px(joint, top + y, SEAM);
      for (const dx of [-3, 3]) {
        for (const y of [3, PLANK_H - 5]) {
          px(joint + dx, top + y, NAIL);
          px(joint + dx, top + y - 1, NAIL_GLINT);
        }
      }
    }
  }
  return canvas.toDataURL('image/png');
}

/** Makes the texture available to the stylesheet as --wood. Safe to call more than once. */
export function installWoodTexture(): void {
  try {
    const url = woodTexture();
    if (url) document.documentElement.style.setProperty('--wood', `url(${url})`);
  } catch {
    // Without it the start screen simply keeps its plain background.
  }
}
