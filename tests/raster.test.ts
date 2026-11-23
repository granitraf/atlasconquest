import { describe, expect, it } from 'vitest';
import { buildLineSet, chooseCell, packColour, plotLines, ringSprite, stamp, type Grid } from '../src/map/raster';

const WHITE = packColour(255, 255, 255);

function grid(cols: number, rows: number, cell = 1, ox = 0, oy = 0): Grid {
  return { cell, ox, oy, cols, rows, stride: cols };
}

/** Renders the buffer as rows of '#' and '.', for readable expectations. */
function picture(buf: Uint32Array, g: Grid): string[] {
  const out: string[] = [];
  for (let y = 0; y < g.rows; y++) {
    let row = '';
    for (let x = 0; x < g.cols; x++) row += buf[y * g.stride + x] ? '#' : '.';
    out.push(row);
  }
  return out;
}

function draw(lines: number[][], g: Grid, options = {}): string[] {
  const buf = new Uint32Array(g.stride * g.rows);
  plotLines(buf, g, buildLineSet(lines), WHITE, options);
  return picture(buf, g);
}

describe('pixel grid', () => {
  it('keeps cells between minPx and 2 x minPx on screen, at power-of-two sizes', () => {
    for (const k of [0.3, 0.49, 0.7, 1, 2.2, 4.2, 7.7, 11, 19, 28]) {
      const cell = chooseCell(k, 2.5);
      expect(Number.isInteger(Math.log2(cell))).toBe(true);
      expect(cell * k).toBeGreaterThanOrEqual(2.5);
      expect(cell * k).toBeLessThan(5);
    }
  });

  it('halves the cell when the zoom doubles, so finer grids nest inside coarser ones', () => {
    expect(chooseCell(1.4, 2.5)).toBe(chooseCell(0.7, 2.5) / 2);
    expect(chooseCell(28, 2.5)).toBe(0.125);
  });

  it('packs colours for little-endian RGBA buffers', () => {
    const bytes = new Uint8Array(new Uint32Array([packColour(1, 2, 3, 4)]).buffer);
    expect([...bytes]).toEqual([1, 2, 3, 4]);
  });
});

describe('pixel lines', () => {
  it('draws a horizontal line one cell thick with hard edges', () => {
    expect(draw([[1.2, 1.5, 6.8, 1.5]], grid(8, 3))).toEqual(['........', '.######.', '........']);
  });

  it('draws a diagonal as a staircase of single cells, never anti-aliased', () => {
    expect(draw([[0.5, 0.5, 4.5, 4.5]], grid(5, 5))).toEqual(['#....', '.#...', '..#..', '...#.', '....#']);
  });

  it('joins the segments of a polyline without gaps', () => {
    expect(draw([[0.5, 0.5, 3.5, 0.5, 3.5, 3.5]], grid(5, 4))).toEqual(['####.', '...#.', '...#.', '...#.']);
  });

  it('uses the grid origin and cell size', () => {
    // Cells are 2 map units wide and the grid starts at x = 10.
    expect(draw([[10.5, 1, 17.5, 1]], grid(5, 1, 2, 10, 0))).toEqual(['####.']);
    // The same line on a grid twice as fine covers twice the cells.
    expect(draw([[10.5, 0.5, 17.5, 0.5]], grid(10, 1, 1, 10, 0))).toEqual(['########..']);
  });

  it('skips lines outside the grid and clips ones that cross it', () => {
    expect(draw([[20, 20, 30, 30]], grid(4, 4))).toEqual(['....', '....', '....', '....']);
    expect(draw([[-50, 1.5, 50, 1.5]], grid(4, 3))).toEqual(['....', '####', '....']);
  });

  it('handles a segment vastly longer than the grid without walking all of it', () => {
    const started = performance.now();
    const rows = draw([[-5_000_000, 2.5, 5_000_000, 2.5]], grid(6, 4));
    expect(rows).toEqual(['......', '......', '######', '......']);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('draws thick lines with a 2x2 brush', () => {
    expect(draw([[0.5, 0.5, 3.5, 0.5]], grid(6, 3), { thick: true })).toEqual(['#####.', '#####.', '......']);
  });

  it('draws dashes as runs of cells: on for 3, off for 2', () => {
    expect(draw([[0.5, 0.5, 11.5, 0.5]], grid(12, 1), { dash: [3, 2] })).toEqual(['###..###..##']);
  });

  it('keeps the dash pattern running around corners', () => {
    expect(draw([[0.5, 0.5, 3.5, 0.5, 3.5, 3.5]], grid(4, 4), { dash: [2, 2] })).toEqual(['##..', '...#', '...#', '....']);
  });

  it('leaves untouched cells transparent', () => {
    const g = grid(3, 1);
    const buf = new Uint32Array(3);
    plotLines(buf, g, buildLineSet([[1.5, 0.5, 1.6, 0.5]]), packColour(10, 20, 30, 200));
    expect([...buf]).toEqual([0, packColour(10, 20, 30, 200), 0]);
  });
});

describe('marker sprites', () => {
  it('makes a pixel-art ring', () => {
    const g = grid(5, 5);
    const buf = new Uint32Array(25);
    stamp(buf, g, 2, 2, ringSprite(2).ring, WHITE);
    expect(picture(buf, g)).toEqual(['.###.', '#...#', '#...#', '#...#', '.###.']);
  });

  it('knows the inside of the ring', () => {
    const g = grid(5, 5);
    const buf = new Uint32Array(25);
    stamp(buf, g, 2, 2, ringSprite(2).inside, WHITE);
    expect(picture(buf, g)).toEqual(['.....', '.###.', '.###.', '.###.', '.....']);
  });

  it('clips at the grid edge', () => {
    const g = grid(3, 3);
    const buf = new Uint32Array(9);
    stamp(buf, g, 0, 0, ringSprite(2).ring, WHITE);
    expect(picture(buf, g)).toEqual(['..#', '..#', '##.']);
  });
});
