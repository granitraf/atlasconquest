import type { MapGeometry } from './geo';

const WIDTH = 2048;
const HEIGHT = 1024;

/** Cheap, deterministic lattice hash in [0, 1). */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise at a given cell size. */
function noise(x: number, y: number, cell: number, seed: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(x0, y0, seed) * (1 - sx) + hash(x0 + 1, y0, seed) * sx;
  const bottom = hash(x0, y0 + 1, seed) * (1 - sx) + hash(x0 + 1, y0 + 1, seed) * sx;
  return top * (1 - sy) + bottom * sy;
}

type Rgb = [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const FOREST: Rgb = [58, 118, 52];
const GRASS: Rgb = [110, 158, 70];
const TAN: Rgb = [196, 168, 108];
const SAND: Rgb = [222, 196, 138];
const TUNDRA: Rgb = [132, 138, 108];
const ICE: Rgb = [238, 242, 246];
// Same light, desaturated ocean as the bundled terrain image.
const DEEP: Rgb = [58, 92, 122];
const SEA: Rgb = [82, 121, 150];
const SHALLOW: Rgb = [124, 167, 193];

/**
 * Fallback terrain when the Blue Marble image is unavailable: a 2048x1024
 * pixel texture built from the land shapes. Greens and tans on land by
 * latitude and noise, dark blue with slight noise at sea.
 */
export function generateTerrain(geometry: MapGeometry): string {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is not available');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#fff';
  geometry.drawLand(ctx, WIDTH, HEIGHT);
  const mask = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
  const isLand = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT && mask[(y * WIDTH + x) * 4] > 127;

  const image = ctx.createImageData(WIDTH, HEIGHT);
  const out = image.data;
  for (let y = 0; y < HEIGHT; y++) {
    const lat = 90 - (y / HEIGHT) * 180;
    const absLat = Math.abs(lat);
    for (let x = 0; x < WIDTH; x++) {
      // Sample noise on a 2px grid so the texture reads as chunky pixels.
      const bx = x & ~1;
      const by = y & ~1;
      const broad = noise(bx, by, 48, 1);
      const medium = noise(bx, by, 14, 2);
      const fine = hash(bx, by, 3);
      let colour: Rgb;
      if (isLand(x, y)) {
        // Dry belts around the tropics, green at the equator and mid latitudes.
        const dryBelt = Math.max(0, 1 - Math.abs(absLat - 24) / 12);
        const dryness = Math.min(1, Math.max(0, dryBelt * 1.25 + (broad - 0.5) * 1.1));
        const green = mix(FOREST, GRASS, Math.min(1, medium * 0.8 + fine * 0.3));
        const dry = mix(TAN, SAND, medium);
        colour = mix(green, dry, dryness);
        const cold = Math.min(1, Math.max(0, (absLat - 58 + (broad - 0.5) * 14) / 12));
        if (cold > 0) colour = mix(colour, TUNDRA, Math.min(1, cold * 1.4));
        const frozen = Math.min(1, Math.max(0, (absLat - 68 + (medium - 0.5) * 10) / 8));
        if (frozen > 0) colour = mix(colour, ICE, frozen);
        const shade = 0.9 + fine * 0.2;
        colour = [colour[0] * shade, colour[1] * shade, colour[2] * shade];
      } else {
        const nearLand =
          isLand(x - 3, y) || isLand(x + 3, y) || isLand(x, y - 3) || isLand(x, y + 3) ||
          isLand(x - 2, y - 2) || isLand(x + 2, y + 2) || isLand(x - 2, y + 2) || isLand(x + 2, y - 2);
        colour = mix(DEEP, SEA, broad * 0.8 + medium * 0.2);
        if (nearLand) colour = mix(colour, SHALLOW, 0.75);
        const shade = 0.94 + fine * 0.12;
        colour = [colour[0] * shade, colour[1] * shade, colour[2] * shade];
      }
      const i = (y * WIDTH + x) * 4;
      out[i] = colour[0];
      out[i + 1] = colour[1];
      out[i + 2] = colour[2];
      out[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Resolves once the image at `url` has loaded and decoded; rejects if it cannot. */
export function probeImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => (img.naturalWidth > 0 ? resolve() : reject(new Error('empty image')));
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}
