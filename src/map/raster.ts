// Pixel rasteriser for the map. Everything on the map is drawn on one grid of
// square cells so terrain, borders and highlights line up as pixel art.
// Pure functions over typed arrays: no DOM, unit-tested.

/** A batch of polylines in map coordinates. */
export interface LineSet {
  /** x0, y0, x1, y1, … for every line, back to back. */
  points: Float32Array;
  /** Index of each line's first point (counted in points, not numbers), plus one final entry marking the end. */
  starts: Uint32Array;
  /** minX, minY, maxX, maxY for each line, for culling. */
  boxes: Float32Array;
}

export function buildLineSet(lines: ArrayLike<number>[]): LineSet {
  const usable = lines.filter((line) => line.length >= 4);
  const total = usable.reduce((sum, line) => sum + line.length, 0);
  const points = new Float32Array(total);
  const starts = new Uint32Array(usable.length + 1);
  const boxes = new Float32Array(usable.length * 4);
  let offset = 0;
  usable.forEach((line, i) => {
    starts[i] = offset / 2;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let j = 0; j < line.length; j += 2) {
      const x = line[j];
      const y = line[j + 1];
      points[offset + j] = x;
      points[offset + j + 1] = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    boxes.set([minX, minY, maxX, maxY], i * 4);
    offset += line.length;
  });
  starts[usable.length] = offset / 2;
  return { points, starts, boxes };
}

/** The pixel grid currently on screen. */
export interface Grid {
  /** Size of one cell in map units; always a power of two so grids at different zooms nest. */
  cell: number;
  /** Map coordinates of the grid's top-left corner; multiples of `cell`. */
  ox: number;
  oy: number;
  cols: number;
  rows: number;
  /** Width of the pixel buffer rows are written into (at least `cols`). */
  stride: number;
}

/**
 * Cell size for a zoom scale `k` (screen pixels per map unit): the smallest
 * power of two that keeps a cell at least `minPx` screen pixels wide, so cells
 * are always between minPx and 2 x minPx on screen.
 */
export function chooseCell(k: number, minPx: number): number {
  return 2 ** Math.ceil(Math.log2(minPx / k));
}

/** Packs a colour for a little-endian Uint32 view over ImageData. */
export function packColour(r: number, g: number, b: number, a = 255): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export interface PlotOptions {
  /** Draw with a 2x2 brush instead of a single cell. */
  thick?: boolean;
  /** Dash pattern in cells: [on, off]. */
  dash?: [number, number];
  /** Where in the dash pattern each line starts, in cells: changing it over time makes the dashes travel. */
  dashOffset?: number;
}

/**
 * Draws polylines into a pixel buffer as hard-edged pixel lines (Bresenham),
 * with no anti-aliasing. Lines and segments outside the grid are skipped;
 * very long segments are clipped first so the work is bounded by the grid size.
 */
export function plotLines(buf: Uint32Array, grid: Grid, set: LineSet, colour: number, options: PlotOptions = {}): void {
  const { cell, ox, oy, cols, rows, stride } = grid;
  const inv = 1 / cell;
  const viewX1 = ox + cols * cell;
  const viewY1 = oy + rows * cell;
  const { points, starts, boxes } = set;
  const thick = options.thick === true;
  const dashOn = options.dash ? options.dash[0] : 0;
  const dashPeriod = options.dash ? options.dash[0] + options.dash[1] : 0;
  const longSegment = 4 * (cols + rows);

  for (let line = 0; line < starts.length - 1; line++) {
    const b = line * 4;
    if (boxes[b + 2] < ox || boxes[b] > viewX1 || boxes[b + 3] < oy || boxes[b + 1] > viewY1) continue;
    let step = options.dashOffset ?? 0;
    let lastX = NaN;
    let lastY = NaN;
    const end = starts[line + 1];
    for (let p = starts[line]; p < end - 1; p++) {
      let ax = (points[p * 2] - ox) * inv;
      let ay = (points[p * 2 + 1] - oy) * inv;
      let bx = (points[p * 2 + 2] - ox) * inv;
      let by = (points[p * 2 + 3] - oy) * inv;
      const span = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      if ((ax < -1 && bx < -1) || (ax > cols + 1 && bx > cols + 1) || (ay < -1 && by < -1) || (ay > rows + 1 && by > rows + 1)) {
        // Off screen: keep the dash pattern running so it does not jump when panning.
        step += Math.round(span);
        continue;
      }
      if (span > longSegment) {
        // Liang-Barsky clip to the grid, with a one-cell margin.
        let t0 = 0;
        let t1 = 1;
        const dx = bx - ax;
        const dy = by - ay;
        const edges = [-dx, ax + 1, dx, cols + 1 - ax, -dy, ay + 1, dy, rows + 1 - ay];
        let visible = true;
        for (let e = 0; e < 8 && visible; e += 2) {
          const pEdge = edges[e];
          const q = edges[e + 1];
          if (pEdge === 0) {
            if (q < 0) visible = false;
          } else {
            const r = q / pEdge;
            if (pEdge < 0) {
              if (r > t1) visible = false;
              else if (r > t0) t0 = r;
            } else if (r < t0) visible = false;
            else if (r < t1) t1 = r;
          }
        }
        if (!visible) {
          step += Math.round(span);
          continue;
        }
        step += Math.round(span * t0);
        bx = ax + dx * t1;
        by = ay + dy * t1;
        ax += dx * t0;
        ay += dy * t0;
      }
      let x = Math.floor(ax);
      let y = Math.floor(ay);
      const xe = Math.floor(bx);
      const ye = Math.floor(by);
      const dxAbs = Math.abs(xe - x);
      const dyNeg = -Math.abs(ye - y);
      const sx = x < xe ? 1 : -1;
      const sy = y < ye ? 1 : -1;
      let err = dxAbs + dyNeg;
      for (;;) {
        if (x !== lastX || y !== lastY) {
          lastX = x;
          lastY = y;
          if (dashPeriod === 0 || step % dashPeriod < dashOn) {
            if (x >= 0 && y >= 0 && x < cols && y < rows) buf[y * stride + x] = colour;
            if (thick) {
              if (x + 1 >= 0 && y >= 0 && x + 1 < cols && y < rows) buf[y * stride + x + 1] = colour;
              if (x >= 0 && y + 1 >= 0 && x < cols && y + 1 < rows) buf[(y + 1) * stride + x] = colour;
              if (x + 1 >= 0 && y + 1 >= 0 && x + 1 < cols && y + 1 < rows) buf[(y + 1) * stride + x + 1] = colour;
            }
          }
          step++;
        }
        if (x === xe && y === ye) break;
        const e2 = 2 * err;
        if (e2 >= dyNeg) {
          err += dyNeg;
          x += sx;
        }
        if (e2 <= dxAbs) {
          err += dxAbs;
          y += sy;
        }
      }
    }
  }
}

export interface RingSprite {
  /** Cell offsets (dx, dy pairs) of the ring itself. */
  ring: Int8Array;
  /** Cell offsets of the area inside the ring. */
  inside: Int8Array;
}

/** A pixel-art circle outline of the given radius in cells, with its interior. */
export function ringSprite(radius: number): RingSprite {
  const ring: number[] = [];
  const inside: number[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dy);
      if (d >= radius - 0.5 && d < radius + 0.5) ring.push(dx, dy);
      else if (d < radius - 0.5) inside.push(dx, dy);
    }
  }
  return { ring: Int8Array.from(ring), inside: Int8Array.from(inside) };
}

/** Stamps cell offsets into the buffer around a centre cell; `every` > 1 skips cells for a dashed look. */
export function stamp(buf: Uint32Array, grid: Grid, cx: number, cy: number, offsets: Int8Array, colour: number, every = 1): void {
  for (let i = 0; i < offsets.length; i += 2) {
    if (every > 1 && (i / 2) % every === every - 1) continue;
    const x = cx + offsets[i];
    const y = cy + offsets[i + 1];
    if (x >= 0 && y >= 0 && x < grid.cols && y < grid.rows) buf[y * grid.stride + x] = colour;
  }
}
