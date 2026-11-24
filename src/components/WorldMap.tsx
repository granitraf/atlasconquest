import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { MAP_H, MAP_W, MAX_ZOOM, WORLD_BOUNDS, type Bounds, type CountryShape, type MapGeometry } from '../map/geo';
import { flagPixels, hexToRgb, type EmpireFlag } from '../game/flag';
import { chooseCell, packColour, plotLines, ringSprite, stamp, type Grid } from '../map/raster';

/** `decimate`: a target that a ready DECIMATE can take outright. */
export type CountryStatus = 'neutral' | 'owned' | 'land' | 'sea' | 'battle' | 'selected' | 'decimate' | 'out';

export interface FocusRequest {
  /** The camera moves whenever this changes. */
  key: string;
  bounds: Bounds;
  /** Cap on the zoom level (1 = whole world), so small countries keep some context. */
  maxZoom?: number;
}

/** Screen space covered by HUD panels; the camera keeps its subject clear of it. */
export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** One piece of a tooltip's second line. The tone colours it: sea crossings blue, enemies pink, troops gained green. */
export interface TooltipPart {
  text: string;
  tone?: 'sea' | 'enemy' | 'gain';
}

export interface TooltipInfo {
  title: string;
  /** The second line: plain text, or parts that are joined with a dot between them. */
  detail?: string | TooltipPart[];
}

interface Props {
  geometry: MapGeometry;
  terrainUrl: string;
  status: Record<string, CountryStatus>;
  focus: FocusRequest | null;
  padding: MapPadding;
  /**
   * Keep the map's bottom edge at or below the bottom of the view, so the empty space under
   * Antarctica can never be dragged into sight. (Panels may then cover the far south.)
   */
  pinBottom?: boolean;
  /** Identifies the current game phase; tooltips are dismissed when it changes. */
  scene: string;
  /** A country to flash, e.g. one just conquered. Flashes again whenever the key changes. */
  flash: { id: string; key: string } | null;
  /** A country to blow up: the DECIMATE explosion. Plays again whenever the key changes. */
  blast?: { id: string; key: string } | null;
  /** The player's flag, planted in the middle of every country with the `flagOn` status. */
  empireFlag: EmpireFlag;
  flagOn: CountryStatus;
  describe: (id: string) => TooltipInfo;
  onCountryClick: (id: string) => void;
  /** Called when a mouse pointer moves onto a different country. (Touch has no hover.) */
  onCountryHover?: (id: string) => void;
}

/**
 * One map pixel is never smaller than this on screen (CSS px). The grid steps
 * down to half-size cells each time the zoom doubles, so cells stay between
 * this and twice this: dense, but always visibly pixels.
 */
const MIN_CELL_PX = 2;
const MARKER_HIT_RADIUS_PX = 13;
/** A small country keeps its ring marker until it is at least this wide on screen. */
const MARKER_UNTIL_PX = 30;
const FLASH_MS = 1500;
/** How long the DECIMATE explosion lasts. */
export const BLAST_MS = 1000;
/** Size of a planted flag, in map pixels. */
const PLANT_W = 9;
const PLANT_H = 6;
const FRAME_MS = 110;

const COLOUR = {
  border: packColour(12, 18, 36, 200),
  ownedLine: packColour(120, 255, 180),
  landLine: packColour(255, 255, 255),
  seaLine: packColour(214, 238, 255),
  selectedLine: packColour(255, 209, 102),
  battleLine: packColour(255, 120, 120),
  decimateLine: packColour(240, 176, 32),
  decimateSpark: packColour(255, 250, 210),
  markerNeutral: packColour(255, 255, 255, 235),
  flagOutline: packColour(12, 18, 36),
  flagPole: packColour(240, 240, 232),
  markerShadow: packColour(12, 18, 36, 150),
};

/** Scale at which "1x" sits: the whole world across the viewport, but never a thin strip on tall phones. */
const baseScale = (w: number, h: number) => Math.max(w / MAP_W, (0.6 * h) / MAP_H);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** 0 → 1 → 0 over `period` ms, in a handful of hard steps like sprite animation frames. */
const pulse = (now: number, period: number) => {
  const t = (now % period) / period;
  return Math.round((t < 0.5 ? t * 2 : 2 - t * 2) * 5) / 5;
};

interface Mip {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Map units per pixel at this level. */
  size: number;
}

/** Halved copies of the terrain, so each grid size has an image whose pixels match its cells one to one. */
function buildMips(image: HTMLImageElement): Mip[] {
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  let previous: CanvasImageSource = image;
  const mips: Mip[] = [{ source: image, width, height, size: MAP_W / width }];
  while (width > 64) {
    width = Math.max(1, width >> 1);
    height = Math.max(1, height >> 1);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(previous, 0, 0, width, height);
    mips.push({ source: canvas, width, height, size: MAP_W / width });
    previous = canvas;
  }
  return mips;
}

/** A canvas plus a same-sized pixel buffer for hard-edged lines, composited on top of it. */
interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lines: HTMLCanvasElement;
  linesCtx: CanvasRenderingContext2D;
  image: ImageData;
  buf: Uint32Array;
}

function makeLayer(canvas: HTMLCanvasElement, width: number, height: number): Layer | null {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const lines = document.createElement('canvas');
  lines.width = width;
  lines.height = height;
  const linesCtx = lines.getContext('2d');
  if (!ctx || !linesCtx) return null;
  const image = linesCtx.createImageData(width, height);
  return { canvas, ctx, lines, linesCtx, image, buf: new Uint32Array(image.data.buffer) };
}

/** Invisible shapes that exist only to be hit-tested: the browser tells us which country is under the pointer. */
const HitShapes = memo(function HitShapes({
  shapes,
  status,
}: {
  shapes: CountryShape[];
  status: Record<string, CountryStatus>;
}) {
  return (
    <>
      <g className="fills">
        {shapes.map((s) => (
          <path key={s.id} d={s.d} data-id={s.id} className={`country s-${status[s.id] ?? 'neutral'}`} />
        ))}
      </g>
      <g className="markers">
        {shapes
          .filter((s) => s.tiny && status[s.id] !== 'out')
          .map((s) => (
            <g key={s.id} className={`marker s-${status[s.id] ?? 'neutral'}`} data-id={s.id}>
              <circle className="marker-hit" cx={s.cx} cy={s.cy} data-id={s.id} />
            </g>
          ))}
      </g>
    </>
  );
});

/** The explosion's radius on screen. */
const BLAST_MIN_PX = 45;
const BLAST_MAX_PX = 100;

/** A cheap, steady noise per cell, so the explosion's pixels flicker the same way every time. */
const cellNoise = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const BLAST_COLOURS = {
  white: packColour(255, 255, 240),
  yellow: packColour(255, 226, 92),
  orange: packColour(255, 140, 36),
  red: packColour(214, 48, 30),
  smoke: packColour(64, 54, 50, 215),
};

/**
 * The DECIMATE explosion at `age` (0..1): a white flash, then a fireball that swells through yellow, orange
 * and red into smoke, a shock ring at its edge, and debris thrown outwards. Drawn cell by cell.
 */
function drawBlast(set: (x: number, y: number, colour: number) => void, shape: CountryShape, grid: Grid & { px: number }, age: number): void {
  const cx = Math.floor((shape.cx - grid.ox) / grid.cell);
  const cy = Math.floor((shape.cy - grid.oy) / grid.cell);
  // Sized on screen, so it is a proper blast on a micro-state and does not swallow a continent: a radius of
  // half the country, kept between BLAST_MIN_PX and BLAST_MAX_PX, and never fewer than 8 map pixels.
  const toCells = (px: number) => px / grid.px;
  const maxR = Math.max(8, Math.min(toCells(BLAST_MAX_PX), Math.max(toCells(BLAST_MIN_PX), (shape.extent / grid.cell) * 0.5)));
  const grow = 1 - (1 - Math.min(1, age * 1.6)) ** 3;
  const radius = Math.max(2, maxR * grow);
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const noise = cellNoise(dx, dy);
      // As it ages, the fireball breaks up into holes of clear air.
      if (age > 0.6 && noise < (age - 0.6) / 0.4) continue;
      const rel = d / radius;
      let colour: number;
      if (age < 0.08) colour = BLAST_COLOURS.white;
      else if (rel > 0.84 && age < 0.55) colour = noise > 0.35 ? BLAST_COLOURS.orange : BLAST_COLOURS.yellow;
      else {
        const heat = (1 - rel) * (1 - age) * 1.3 + noise * 0.25;
        if (heat > 0.95) colour = BLAST_COLOURS.white;
        else if (heat > 0.72) colour = BLAST_COLOURS.yellow;
        else if (heat > 0.5) colour = BLAST_COLOURS.orange;
        else if (heat > 0.32) colour = BLAST_COLOURS.red;
        else colour = BLAST_COLOURS.smoke;
      }
      set(cx + dx, cy + dy, colour);
    }
  }
  // Debris: chunks flung out past the fireball, gone before the smoke clears.
  if (age < 0.85) {
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + cellNoise(i, 7) * 0.6;
      const reach = maxR * (1.1 + cellNoise(i, 3) * 0.6) * (1 - (1 - age) ** 2);
      const x = Math.round(cx + Math.cos(angle) * reach);
      const y = Math.round(cy + Math.sin(angle) * reach);
      const colour = i % 3 === 0 ? BLAST_COLOURS.yellow : BLAST_COLOURS.orange;
      set(x, y, colour);
      set(x + 1, y, colour);
      set(x, y + 1, colour);
      set(x + 1, y + 1, BLAST_COLOURS.red);
    }
  }
}

const RING_SMALL = ringSprite(2);
const RING_LARGE = ringSprite(3);

export function WorldMap({ geometry, terrainUrl, status, focus, padding, pinBottom = false, scene, flash, blast = null, empireFlag, flagOn, describe, onCountryClick, onCountryHover }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const hitRef = useRef<SVGGElement>(null);
  const edgeTopRef = useRef<HTMLDivElement>(null);
  const edgeBottomRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const zoomLabelRef = useRef<HTMLSpanElement>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const hoverRef = useRef<string | null>(null);
  const tooltipTimer = useRef<number | undefined>(undefined);
  const lastFocusKey = useRef<string | null>(null);
  const zoomByRef = useRef<(factor: number) => void>(() => {});
  /** True once the player has moved the camera since the last programmatic move. */
  const userMoved = useRef(false);

  const layers = useRef<{ base: Layer; fx: Layer } | null>(null);
  const mips = useRef<Mip[]>([]);
  const paths = useRef(new Map<string, Path2D>());
  const frame = useRef(0);
  const dirty = useRef({ base: false, fx: false });
  const flashRef = useRef<{ id: string; start: number } | null>(null);
  const blastRef = useRef<{ id: string; start: number } | null>(null);

  // Latest props for the imperative handlers, without re-binding them.
  const paddingRef = useRef(padding);
  paddingRef.current = padding;
  const pinBottomRef = useRef(pinBottom);
  pinBottomRef.current = pinBottom;
  const describeRef = useRef(describe);
  describeRef.current = describe;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const statusRef = useRef(status);
  statusRef.current = status;

  // The planted flag as map pixels: colour per cell, ready to stamp.
  const [c0, c1, c2] = empireFlag.colours;
  const plant = useMemo(() => {
    const colours = [c0, c1, c2].map((hex) => packColour(...hexToRgb(hex)));
    return { on: flagOn, cells: Array.from(flagPixels(empireFlag.pattern, PLANT_W, PLANT_H), (slot) => colours[slot]) };
  }, [empireFlag.pattern, c0, c1, c2, flagOn]);
  const plantRef = useRef(plant);
  plantRef.current = plant;

  const reducedMotion = useMemo(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const pathFor = useCallback((shape: CountryShape) => {
    let path = paths.current.get(shape.id);
    if (!path) {
      path = new Path2D(shape.d);
      paths.current.set(shape.id, path);
    }
    return path;
  }, []);

  // ------------------------------------------------------------ rendering

  /** The pixel grid for the current camera, snapped to the map so pixels stay put while panning. */
  const currentGrid = useCallback((layer: Layer): Grid & { px: number } => {
    const t = transformRef.current;
    const { w, h } = sizeRef.current;
    const cell = chooseCell(t.k, MIN_CELL_PX);
    const px = cell * t.k;
    const ox = Math.floor(-t.x / t.k / cell) * cell;
    const oy = Math.floor(-t.y / t.k / cell) * cell;
    const cols = Math.min(layer.canvas.width, Math.ceil((w - (ox * t.k + t.x)) / px) + 1);
    const rows = Math.min(layer.canvas.height, Math.ceil((h - (oy * t.k + t.y)) / px) + 1);
    return { cell, ox, oy, cols, rows, stride: layer.canvas.width, px };
  }, []);

  const place = (layer: Layer, grid: Grid & { px: number }) => {
    const t = transformRef.current;
    layer.canvas.style.transform = `translate(${grid.ox * t.k + t.x}px, ${grid.oy * t.k + t.y}px) scale(${grid.px})`;
  };

  const visible = (shape: CountryShape, grid: Grid) =>
    shape.box[2] >= grid.ox &&
    shape.box[0] <= grid.ox + grid.cols * grid.cell &&
    shape.box[3] >= grid.oy &&
    shape.box[1] <= grid.oy + grid.rows * grid.cell;

  const toMapSpace = (ctx: CanvasRenderingContext2D, grid: Grid) =>
    ctx.setTransform(1 / grid.cell, 0, 0, 1 / grid.cell, -grid.ox / grid.cell, -grid.oy / grid.cell);

  const flushLines = (layer: Layer) => {
    layer.linesCtx.putImageData(layer.image, 0, 0);
    layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
    layer.ctx.drawImage(layer.lines, 0, 0);
  };

  /** Terrain, territory tints and borders. Redrawn when the camera or ownership changes. */
  const drawBase = useCallback(() => {
    const layer = layers.current?.base;
    if (!layer) return;
    const grid = currentGrid(layer);
    const { ctx, buf } = layer;
    const statuses = statusRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    ctx.imageSmoothingEnabled = false;

    // Terrain: the mip level whose pixels are exactly one cell, copied without smoothing.
    const levels = mips.current;
    if (levels.length > 0) {
      const level = levels.find((m) => m.size === grid.cell) ?? (grid.cell < levels[0].size ? levels[0] : levels[levels.length - 1]);
      const x0 = Math.max(grid.ox, 0);
      const y0 = Math.max(grid.oy, 0);
      const x1 = Math.min(grid.ox + grid.cols * grid.cell, MAP_W);
      const y1 = Math.min(grid.oy + grid.rows * grid.cell, MAP_H);
      if (x1 > x0 && y1 > y0) {
        ctx.drawImage(
          level.source,
          x0 / level.size,
          y0 / level.size,
          (x1 - x0) / level.size,
          (y1 - y0) / level.size,
          (x0 - grid.ox) / grid.cell,
          (y0 - grid.oy) / grid.cell,
          (x1 - x0) / grid.cell,
          (y1 - y0) / grid.cell,
        );
      }
    }

    toMapSpace(ctx, grid);
    const shown = geometry.shapes.filter((s) => visible(s, grid));
    ctx.fillStyle = 'rgba(6, 10, 24, 0.62)';
    for (const s of shown) if (statuses[s.id] === 'out') ctx.fill(pathFor(s));
    ctx.fillStyle = 'rgba(61, 220, 132, 0.5)';
    for (const s of shown) if (statuses[s.id] === 'owned') ctx.fill(pathFor(s));

    buf.fill(0);
    plotLines(buf, grid, geometry.borders, COLOUR.border);
    // Your territory is outlined as boldly as the countries you can attack: the same thick pixel line, in green.
    for (const s of shown) if (statuses[s.id] === 'owned') plotLines(buf, grid, s.rings, COLOUR.ownedLine, { thick: true });
    flushLines(layer);
    place(layer, grid);

    const container = containerRef.current;
    if (container) {
      container.dataset.cellPx = grid.px.toFixed(2);
      container.dataset.cell = String(grid.cell);
    }
  }, [currentGrid, geometry, pathFor]);

  /** Highlights, markers and anything that pulses. Redrawn on a timer while something is animating. */
  const drawFx = useCallback(() => {
    const layer = layers.current?.fx;
    if (!layer) return;
    const grid = currentGrid(layer);
    const { ctx, buf } = layer;
    const statuses = statusRef.current;
    const t = transformRef.current;
    const now = performance.now();
    // Only a country under attack pulses. Attackable ones are marked by their outline alone.
    const throb = reducedMotion ? 0.6 : pulse(now, 850);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    buf.fill(0);
    toMapSpace(ctx, grid);
    ctx.lineJoin = 'round';

    const shown = geometry.shapes.filter((s) => visible(s, grid));
    const hover = hoverRef.current;
    const flashing = flashRef.current;
    const flashAge = flashing ? (now - flashing.start) / FLASH_MS : 1;

    for (const s of shown) {
      const st = statuses[s.id] ?? 'neutral';
      if (st === 'out') continue;
      const path = pathFor(s);
      if (st === 'land') {
        // A thick, hard white outline and nothing else: no tint, no glow, nothing that moves.
        plotLines(buf, grid, s.rings, COLOUR.landLine, { thick: true });
      } else if (st === 'sea') {
        ctx.fillStyle = 'rgba(150, 210, 255, 0.1)';
        ctx.fill(path);
        plotLines(buf, grid, s.rings, COLOUR.seaLine, { dash: [3, 3] });
      } else if (st === 'selected') {
        ctx.fillStyle = 'rgba(255, 209, 102, 0.34)';
        ctx.fill(path);
        ctx.strokeStyle = 'rgba(255, 209, 102, 0.4)';
        ctx.lineWidth = 4 * grid.cell;
        ctx.stroke(path);
        plotLines(buf, grid, s.rings, COLOUR.selectedLine, { thick: true });
      } else if (st === 'decimate') {
        // Gold, and shimmering: a thick gold outline with bright sparks travelling round it.
        ctx.fillStyle = `rgba(255, 200, 60, ${0.1 + 0.12 * throb})`;
        ctx.fill(path);
        plotLines(buf, grid, s.rings, COLOUR.decimateLine, { thick: true });
        if (!reducedMotion) plotLines(buf, grid, s.rings, COLOUR.decimateSpark, { dash: [2, 7], dashOffset: Math.floor(now / 70) % 9 });
      } else if (st === 'battle') {
        ctx.fillStyle = `rgba(255, 50, 50, ${0.16 + 0.42 * throb})`;
        ctx.fill(path);
        ctx.strokeStyle = `rgba(255, 70, 70, ${0.2 + 0.3 * throb})`;
        ctx.lineWidth = 4 * grid.cell;
        ctx.stroke(path);
        plotLines(buf, grid, s.rings, COLOUR.battleLine, { thick: true });
      }
      if (hover === s.id && st !== 'battle') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fill(path);
      }
      if (flashing && flashing.id === s.id && flashAge < 1) {
        // A just-conquered country blinks bright, then settles into its green tint.
        const on = reducedMotion || Math.floor(flashAge * 8) % 2 === 0;
        ctx.fillStyle = `rgba(255, 255, 255, ${on ? 0.75 * (1 - flashAge) : 0})`;
        ctx.fill(path);
        plotLines(buf, grid, s.rings, COLOUR.landLine, { thick: true });
      }
    }

    // Ring markers for countries too small to see: pixel circles, sized in whole cells.
    const sprite = grid.px < 3.5 ? RING_LARGE : RING_SMALL;
    for (const s of shown) {
      if (!s.tiny) continue;
      const st = statuses[s.id] ?? 'neutral';
      if (st === 'out') continue;
      const flashingThis = flashing !== null && flashing.id === s.id && flashAge < 1;
      if (s.extent * t.k >= MARKER_UNTIL_PX && !flashingThis) continue;
      // A country flying the player's flag needs no ring: the flag marks the spot.
      if (st === plantRef.current.on && !flashingThis) continue;
      const cx = Math.floor((s.cx - grid.ox) / grid.cell);
      const cy = Math.floor((s.cy - grid.oy) / grid.cell);
      let ring = COLOUR.markerNeutral;
      let fill = 0;
      let every = 1;
      if (st === 'owned') {
        ring = COLOUR.ownedLine;
        fill = packColour(61, 220, 132, 215);
      } else if (st === 'land') {
        // A tiny attackable country: a steady white dot inside its ring.
        fill = packColour(255, 255, 255, 160);
      } else if (st === 'sea') {
        ring = COLOUR.seaLine;
        every = 3;
      } else if (st === 'decimate') {
        // A tiny country a DECIMATE can take: a gold ring, glowing.
        ring = COLOUR.decimateLine;
        fill = packColour(255, 226, 92, Math.round(110 + 120 * throb));
      } else if (st === 'selected') {
        ring = COLOUR.selectedLine;
        fill = packColour(255, 209, 102, 200);
      } else if (st === 'battle') {
        ring = COLOUR.battleLine;
        fill = packColour(255, 50, 50, Math.round(90 + 150 * throb));
      }
      if (flashingThis) fill = packColour(255, 255, 255, Math.round(255 * (1 - flashAge)));
      // A one-cell drop shadow keeps the ring readable over snow and bright water.
      stamp(buf, grid, cx + 1, cy + 1, sprite.ring, COLOUR.markerShadow, every);
      if (fill) stamp(buf, grid, cx, cy, sprite.inside, fill);
      stamp(buf, grid, cx, cy, sprite.ring, ring, every);
    }

    // The player's flag on a little pole, planted in the middle of each country that flies it.
    const { on, cells } = plantRef.current;
    const set = (x: number, y: number, colour: number) => {
      if (x >= 0 && y >= 0 && x < grid.cols && y < grid.rows) buf[y * grid.stride + x] = colour;
    };
    for (const s of shown) {
      if ((statuses[s.id] ?? 'neutral') !== on) continue;
      const left = Math.floor((s.cx - grid.ox) / grid.cell) - Math.floor(PLANT_W / 2);
      const top = Math.floor((s.cy - grid.oy) / grid.cell) - PLANT_H;
      // Dark outline box, then the pole down its left side, then the cloth.
      for (let y = -1; y <= PLANT_H; y++) for (let x = -2; x <= PLANT_W; x++) set(left + x, top + y, COLOUR.flagOutline);
      for (let y = 0; y < PLANT_H + 4; y++) set(left - 1, top + y, COLOUR.flagPole);
      set(left - 1, top + PLANT_H + 4, COLOUR.flagOutline);
      for (let y = 0; y < PLANT_H; y++) for (let x = 0; x < PLANT_W; x++) set(left + x, top + y, cells[y * PLANT_W + x]);
    }

    // The DECIMATE explosion, in whole map pixels like everything else.
    const blasting = blastRef.current;
    const blastShape = blasting ? geometry.byId[blasting.id] : undefined;
    const blastAge = blasting ? (now - blasting.start) / BLAST_MS : 1;
    if (blastShape && blastAge < 1) drawBlast(set, blastShape, grid, blastAge);

    flushLines(layer);
    place(layer, grid);
  }, [currentGrid, geometry, pathFor, reducedMotion]);

  const schedule = useCallback(
    (base: boolean, fx = true) => {
      dirty.current.base ||= base;
      dirty.current.fx ||= fx;
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const { base: redrawBase, fx: redrawFx } = dirty.current;
        dirty.current = { base: false, fx: false };
        if (redrawBase) drawBase();
        if (redrawFx) drawFx();
      });
    },
    [drawBase, drawFx],
  );

  // Terrain image and its mip levels.
  useEffect(() => {
    let alive = true;
    const image = new Image();
    image.onload = () => {
      if (!alive) return;
      mips.current = buildMips(image);
      if (containerRef.current) containerRef.current.dataset.terrainWidth = String(image.naturalWidth);
      schedule(true);
    };
    image.src = terrainUrl;
    return () => {
      alive = false;
    };
  }, [terrainUrl, schedule]);

  // Game state or the flag design changed: repaint.
  useEffect(() => schedule(true), [status, plant, schedule]);

  // The explosion runs at full frame rate while it lasts.
  const blastKey = blast?.key ?? null;
  useEffect(() => {
    if (!blast) return;
    blastRef.current = { id: blast.id, start: performance.now() };
    let raf = 0;
    const step = () => {
      schedule(false);
      if (blastRef.current && performance.now() - blastRef.current.start < BLAST_MS) raf = requestAnimationFrame(step);
      else blastRef.current = null;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [blastKey, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pulsing highlights are redrawn a few times a second, and only while something is pulsing.
  const flashKey = flash?.key ?? null;
  useEffect(() => {
    if (flash) flashRef.current = { id: flash.id, start: performance.now() };
    const animated = () => {
      if (flashRef.current && performance.now() - flashRef.current.start > FLASH_MS) {
        flashRef.current = null;
        schedule(false);
      }
      if (flashRef.current) return true;
      if (reducedMotion) return false;
      return Object.values(statusRef.current).some((s) => s === 'battle' || s === 'decimate');
    };
    schedule(false);
    const timer = window.setInterval(() => {
      if (!document.hidden && animated()) schedule(false);
    }, FRAME_MS);
    return () => window.clearInterval(timer);
  }, [flashKey, schedule, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  // --------------------------------------------------------------- camera

  /**
   * Keeps the map inside the area not covered by HUD panels. Along each axis:
   * if the map is smaller than that area it is centred in it, otherwise its
   * edges may travel as far as the panel edges and no further.
   *
   * With `pinBottom` the bottom edge is the exception: it never rises above the
   * bottom of the view, whatever panel sits there. If the whole map is shorter
   * than the view it rests on the bottom, and the spare space is all above it.
   */
  const constrain = useCallback((t: ZoomTransform): ZoomTransform => {
    const { w, h } = sizeRef.current;
    const pad = paddingRef.current;
    const axis = (translate: number, mapSize: number, viewSize: number, padStart: number, padEnd: number) => {
      const scaled = mapSize * t.k;
      const max = padStart;
      const min = viewSize - padEnd - scaled;
      if (min > max) return (min + max) / 2;
      return clamp(translate, min, max);
    };
    const x = axis(t.x, MAP_W, w, pad.left, pad.right);
    let y: number;
    if (pinBottomRef.current) {
      const lowest = h - MAP_H * t.k;
      y = lowest > pad.top ? lowest : clamp(t.y, lowest, pad.top);
    } else y = axis(t.y, MAP_H, h, pad.top, pad.bottom);
    return x === t.x && y === t.y ? t : zoomIdentity.translate(x, y).scale(t.k);
  }, []);

  const applyHitRadii = useCallback(() => {
    const hit = hitRef.current;
    if (!hit) return;
    const radius = String(MARKER_HIT_RADIUS_PX / transformRef.current.k);
    for (const el of hit.querySelectorAll('.marker-hit')) el.setAttribute('r', radius);
  }, []);

  const fit = useCallback(
    (bounds: Bounds, maxZoom = MAX_ZOOM): ZoomTransform => {
      const { w, h } = sizeRef.current;
      const pad = paddingRef.current;
      const k0 = baseScale(w, h);
      const availW = Math.max(60, w - pad.left - pad.right);
      const availH = Math.max(60, h - pad.top - pad.bottom);
      const bw = Math.max(bounds[1][0] - bounds[0][0], 0.01);
      const bh = Math.max(bounds[1][1] - bounds[0][1], 0.01);
      const k = clamp(0.8 * Math.min(availW / bw, availH / bh), k0, k0 * Math.min(MAX_ZOOM, maxZoom));
      const cx = (bounds[0][0] + bounds[1][0]) / 2;
      const cy = (bounds[0][1] + bounds[1][1]) / 2;
      return constrain(
        zoomIdentity.translate(pad.left + availW / 2 - k * cx, pad.top + availH / 2 - k * cy).scale(k),
      );
    },
    [constrain],
  );

  const moveTo = useCallback(
    (t: ZoomTransform, animate: boolean) => {
      const el = containerRef.current;
      const behaviour = zoomRef.current;
      if (!el || !behaviour) return;
      const selection = select(el);
      if (animate && !reducedMotion) selection.transition().duration(900).call(behaviour.transform, t);
      else selection.interrupt().call(behaviour.transform, t);
    },
    [reducedMotion],
  );

  // Zoom behaviour, resize handling and keyboard shortcuts.
  useEffect(() => {
    const el = containerRef.current;
    const baseCanvas = baseCanvasRef.current;
    const fxCanvas = fxCanvasRef.current;
    if (!el || !baseCanvas || !fxCanvas) return;
    const behaviour = zoom<HTMLDivElement, unknown>()
      .clickDistance(6)
      // Default filter, plus: gestures that start on the zoom buttons are not map gestures.
      .filter((event: Event & { ctrlKey?: boolean; button?: number }) => {
        if ((event.target as Element | null)?.closest?.('.zoom-controls')) return false;
        return (!event.ctrlKey || event.type === 'wheel') && !event.button;
      })
      .constrain((t) => constrain(t))
      .on('zoom', (event: { transform: ZoomTransform; sourceEvent: Event | null }) => {
        const t = event.transform;
        if (event.sourceEvent) {
          userMoved.current = true;
          // Hide the tooltip while the map is actually being dragged or pinched (a plain tap never gets here).
          if (event.sourceEvent.type !== 'wheel' && tooltipRef.current) tooltipRef.current.dataset.dragging = 'true';
        }
        transformRef.current = t;
        hitRef.current?.setAttribute('transform', `translate(${t.x},${t.y}) scale(${t.k})`);
        // The gold trim sits on the map's top and bottom edges (shown on the start screen only).
        // It follows the map; it is not part of what zooms.
        if (edgeTopRef.current) edgeTopRef.current.style.transform = `translateY(${t.y}px) translateY(-100%)`;
        if (edgeBottomRef.current) edgeBottomRef.current.style.transform = `translateY(${t.y + MAP_H * t.k}px)`;
        applyHitRadii();
        schedule(true);
        const { w, h } = sizeRef.current;
        if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${(t.k / baseScale(w, h)).toFixed(1)}×`;
      })
      .on('end', () => {
        if (tooltipRef.current) delete tooltipRef.current.dataset.dragging;
      });
    zoomRef.current = behaviour;
    const selection = select(el);
    selection.call(behaviour).on('dblclick.zoom', null);

    const onResize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      const first = sizeRef.current.w === 0;
      const previous = sizeRef.current;
      sizeRef.current = { w, h };

      // The canvases hold one value per map pixel, so they are far smaller than the screen.
      const cw = Math.ceil(w / MIN_CELL_PX) + 2;
      const ch = Math.ceil(h / MIN_CELL_PX) + 2;
      if (!layers.current || layers.current.base.canvas.width !== cw || layers.current.base.canvas.height !== ch) {
        const base = makeLayer(baseCanvas, cw, ch);
        const fx = makeLayer(fxCanvas, cw, ch);
        layers.current = base && fx ? { base, fx } : null;
      }

      const k0 = baseScale(w, h);
      behaviour
        .extent([
          [0, 0],
          [w, h],
        ])
        .scaleExtent([k0, k0 * MAX_ZOOM]);
      if (first) {
        const request = focusRef.current;
        lastFocusKey.current = request?.key ?? null;
        selection.call(behaviour.transform, request ? fit(request.bounds, request.maxZoom) : fit(WORLD_BOUNDS));
        return;
      }
      schedule(true);
      const request = focusRef.current;
      if (request && !userMoved.current) {
        // The camera is still where the game put it: re-frame the same subject for the new viewport.
        lastFocusKey.current = request.key;
        const target = fit(request.bounds, request.maxZoom);
        if (reducedMotion) selection.interrupt().call(behaviour.transform, target);
        else selection.transition().duration(600).call(behaviour.transform, target);
        return;
      }
      // The player has moved the camera: keep whatever was at the centre of the old viewport centred.
      const current = zoomTransform(el);
      const k = clamp(current.k, k0, k0 * MAX_ZOOM);
      const [mx, my] = current.invert([previous.w / 2, previous.h / 2]);
      selection.interrupt().call(behaviour.transform, constrain(zoomIdentity.translate(w / 2 - k * mx, h / 2 - k * my).scale(k)));
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(el);
    onResize();

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '+' || event.key === '=') zoomBy(1.6);
      else if (event.key === '-' || event.key === '_') zoomBy(1 / 1.6);
    };
    const zoomBy = (factor: number) => {
      const { w, h } = sizeRef.current;
      const pad = paddingRef.current;
      const centre: [number, number] = [
        pad.left + Math.max(60, w - pad.left - pad.right) / 2,
        pad.top + Math.max(60, h - pad.top - pad.bottom) / 2,
      ];
      userMoved.current = true;
      selection.transition().duration(reducedMotion ? 0 : 220).call(behaviour.scaleBy, factor, centre);
    };
    zoomByRef.current = zoomBy;
    window.addEventListener('keydown', onKey);

    return () => {
      observer.disconnect();
      window.removeEventListener('keydown', onKey);
      selection.interrupt().on('.zoom', null);
      zoomRef.current = null;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      sizeRef.current = { w: 0, h: 0 };
    };
  }, [applyHitRadii, constrain, fit, reducedMotion, schedule]);

  // Camera follows focus requests. If the panels around the map change size
  // while the camera is still where we put it, re-frame so the subject stays clear of them.
  const { top: padTop, right: padRight, bottom: padBottom, left: padLeft } = padding;
  const focusKey = focus?.key ?? null;
  useEffect(() => {
    const request = focusRef.current;
    const el = containerRef.current;
    if (!request || !el || sizeRef.current.w === 0) return;
    if (lastFocusKey.current === request.key && userMoved.current) return;
    lastFocusKey.current = request.key;
    userMoved.current = false;
    const target = fit(request.bounds, request.maxZoom);
    const current = zoomTransform(el);
    const settled =
      Math.abs(current.k - target.k) < 1e-6 && Math.abs(current.x - target.x) < 0.5 && Math.abs(current.y - target.y) < 0.5;
    if (!settled) moveTo(target, true);
  }, [focusKey, fit, moveTo, padTop, padRight, padBottom, padLeft]);

  // React owns the hit circles but not their radius, which depends on the zoom level.
  useLayoutEffect(applyHitRadii);

  // -------------------------------------------------------------- pointer

  useEffect(() => () => window.clearTimeout(tooltipTimer.current), []);

  const setHover = (id: string | null) => {
    if (hoverRef.current === id) return false;
    hoverRef.current = id;
    schedule(false);
    return true;
  };

  // A tooltip describes the map as it was; drop it when the game moves to a new phase under it.
  useEffect(() => {
    setHover(null);
    if (tooltipRef.current) tooltipRef.current.hidden = true;
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  const idAt = (target: EventTarget | null) =>
    (target as Element | null)?.closest?.('[data-id]')?.getAttribute('data-id') ?? null;

  const showTooltip = (id: string, clientX: number, clientY: number, refresh = false) => {
    const tip = tooltipRef.current;
    const el = containerRef.current;
    if (!tip || !el) return;
    if (setHover(id) || refresh || tip.hidden) {
      const info = describeRef.current(id);
      tip.replaceChildren();
      const title = document.createElement('strong');
      title.textContent = info.title;
      tip.append(title);
      if (info.detail) {
        const detail = document.createElement('span');
        if (typeof info.detail === 'string') detail.textContent = info.detail;
        else {
          info.detail.forEach((part, i) => {
            if (i > 0) detail.append(' · ');
            const piece = document.createElement('span');
            piece.textContent = part.text;
            if (part.tone) piece.className = `tone-${part.tone}`;
            detail.append(piece);
          });
        }
        tip.append(detail);
      }
    }
    tip.hidden = false;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const left = x + 16 + tw > rect.width ? x - tw - 12 : x + 16;
    const top = y + 18 + th > rect.height ? y - th - 12 : y + 18;
    tip.style.transform = `translate(${Math.max(4, left)}px, ${Math.max(4, top)}px)`;
  };

  const hideTooltip = () => {
    setHover(null);
    if (tooltipRef.current) tooltipRef.current.hidden = true;
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const id = idAt(event.target);
    if (id) {
      const entered = hoverRef.current !== id;
      showTooltip(id, event.clientX, event.clientY);
      // Not while the map is being dragged: that is moving the map, not looking at a country.
      if (entered && event.buttons === 0) onCountryHover?.(id);
    } else hideTooltip();
  };

  const onClick = (event: React.MouseEvent) => {
    const id = idAt(event.target);
    if (!id) return;
    // Touch has no hover, so a tap names the country for a moment.
    const native = event.nativeEvent as PointerEvent;
    if (native.pointerType === 'touch' || native.pointerType === 'pen') {
      if (tooltipRef.current) delete tooltipRef.current.dataset.dragging;
      showTooltip(id, event.clientX, event.clientY - 48, true);
      window.clearTimeout(tooltipTimer.current);
      tooltipTimer.current = window.setTimeout(hideTooltip, 1800);
    }
    onCountryClick(id);
  };

  const resetView = () => {
    userMoved.current = true;
    moveTo(fit(WORLD_BOUNDS), true);
  };

  return (
    <div
      ref={containerRef}
      className="map"
      onPointerMove={onPointerMove}
      onPointerLeave={hideTooltip}
      onClick={onClick}
    >
      <canvas ref={baseCanvasRef} className="pixel-layer pixel-base" />
      <canvas ref={fxCanvasRef} className="pixel-layer pixel-fx" />
      <svg className="map-hit" role="img" aria-label="World map">
        <g ref={hitRef}>
          <HitShapes shapes={geometry.shapes} status={status} />
        </g>
      </svg>
      <div ref={edgeTopRef} className="map-edge map-edge-top" aria-hidden="true" />
      <div ref={edgeBottomRef} className="map-edge map-edge-bottom" aria-hidden="true" />
      <div ref={tooltipRef} className="map-tooltip" hidden />
      <div className="zoom-controls" style={{ top: padding.top + 10 }} onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomByRef.current(1.6)}>
          +
        </button>
        <span ref={zoomLabelRef} className="zoom-level" aria-label="Zoom level">
          1.0×
        </span>
        <button type="button" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoomByRef.current(1 / 1.6)}>
          −
        </button>
        <button type="button" className="zoom-reset" aria-label="Show whole world" title="Show whole world" onClick={resetView}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
            <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
