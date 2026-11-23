// Draws the Atlas Conquest emblem: two gold swords, crossed, as 16 x 16 pixel art.
//   npm run logo
// The drawing below is the single source. It writes:
//   src/logo.json        the pixel grid and palette, which the game draws next to its title
//   public/favicon.svg   the same swords on a plain dark brown square, for the browser tab
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = 16;
/** The swords are drawn as large as the square allows: they start this many pixels in from every edge. */
const EDGE = 1;
const R = Math.SQRT2;

const COLOURS = {
  A: '#fff0b8', // blade, lit edge
  a: '#ffcf4a', // blade, shaded edge
  G: '#ffd95c', // guard and pommel
  g: '#c8961c', // guard and pommel in shade
  H: '#a8760f', // grip
  O: '#150d05', // the gap that separates the sword on top from the one beneath
};
const BROWN = '#2a1a0c';

const half = (N - 1) / 2;
const reach = (half - EDGE) * R; // from the centre to a corner, one pixel in

/** One sword, pommel in a bottom corner and point in the opposite top corner. `flip` mirrors it. */
function sword(flip) {
  const cells = [];
  for (let y = EDGE; y < N - EDGE; y++) {
    for (let x = EDGE; x < N - EDGE; x++) {
      const dx = (flip ? N - 1 - x : x) - half;
      const dy = y - half;
      const along = (dx - dy) / R; // positive towards the point
      const across = (dx + dy) / R;
      const lit = across < 0;
      let colour = null;
      if (along > -2.6 && along <= reach + 0.4 && Math.abs(across) <= Math.min(0.85, (reach + 0.9 - along) * 0.7)) colour = lit ? 'A' : 'a';
      else if (along > -4.1 && along <= -2.6 && Math.abs(across) <= 2.9) colour = lit ? 'G' : 'g';
      else if (along > -7.2 && along <= -4.1 && Math.abs(across) <= 0.75) colour = 'H';
      else if (along > -reach - 0.4 && along <= -7.2 && Math.abs(across) <= 1.25) colour = lit ? 'G' : 'g';
      if (colour) cells.push([x, y, colour]);
    }
  }
  return cells;
}

const grid = Array.from({ length: N }, () => Array(N).fill('.'));
const under = sword(true);
const over = sword(false);
for (const [x, y, colour] of under) grid[y][x] = colour;
// A dark gap beside the blade of the sword on top, only where it lies across the other one.
const top = new Set(over.map(([x, y]) => `${x},${y}`));
for (const [x, y, colour] of over) {
  if (colour !== 'A' && colour !== 'a') continue;
  for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
    if (!top.has(`${nx},${ny}`) && grid[ny]?.[nx] && grid[ny][nx] !== '.') grid[ny][nx] = 'O';
  }
}
for (const [x, y, colour] of over) grid[y][x] = colour;

const rows = grid.map((row) => row.join(''));
const favicon = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">`,
  `<rect width="${N}" height="${N}" fill="${BROWN}"/>`,
  ...rows.flatMap((row, y) => [...row].map((cell, x) => (cell === '.' ? '' : `<rect x="${x}" y="${y}" width="1" height="1" fill="${COLOURS[cell]}"/>`))),
  `</svg>`,
]
  .filter(Boolean)
  .join('');

await writeFile(join(ROOT, 'src', 'logo.json'), `${JSON.stringify({ size: N, rows, colours: COLOURS }, null, 2)}\n`);
await writeFile(join(ROOT, 'public', 'favicon.svg'), `${favicon}\n`);
console.log(rows.join('\n'));
console.log(`Emblem written: ${rows.join('').replace(/\./g, '').length} pixels.`);
