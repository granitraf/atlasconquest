import { geoEquirectangular, geoPath } from 'd3-geo';
import type { MultiPolygon, Position } from 'geojson';
import { feature, merge, mesh } from 'topojson-client';
import type { GeometryCollection, Polygon as TopoPolygon, MultiPolygon as TopoMultiPolygon, Topology } from 'topojson-specification';
import { buildLineSet, type LineSet } from './raster';

/** Map coordinate space. 2:1, so the equirectangular projection lines up exactly with the terrain image. */
export const MAP_W = 2048;
export const MAP_H = 1024;
export const MAX_ZOOM = 40;

export type Bounds = [[number, number], [number, number]];

export interface CountryShape {
  id: string;
  /** SVG path in map coordinates: used for hit-testing and for filling the shape. */
  d: string;
  /** The same outline as polylines, for drawing it as pixel lines. */
  rings: LineSet;
  /** Bounding box of every part of the country: minX, minY, maxX, maxY. */
  box: [number, number, number, number];
  /** Centre of the country's largest landmass: where its marker sits. */
  cx: number;
  cy: number;
  /** Bounds of the main landmass(es), ignoring far-flung islands and territories. */
  bounds: Bounds;
  /** Too small to click at world zoom: gets a circular marker. */
  tiny: boolean;
  /** Longest side of the main landmass, in map units. */
  extent: number;
}

export interface MapGeometry {
  shapes: CountryShape[];
  byId: Record<string, CountryShape>;
  /** Every border and coastline, each present once. */
  borders: LineSet;
  /** Renders the land mask for the procedural terrain fallback. */
  drawLand: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

/** Largest landmass smaller than this (in map units squared) gets a marker. */
const TINY_AREA = 36;
/** Landmasses at least this fraction of the largest count towards a country's focus bounds. */
const MAIN_LANDMASS_FRACTION = 0.25;

type CountryGeometry = (TopoPolygon | TopoMultiPolygon) & { id?: string | number };

/** Stands in for a canvas context so d3 hands us the projected, clipped coordinates it would have drawn. */
class LineCollector {
  lines: number[][] = [];
  private current: number[] = [];
  beginPath() {}
  moveTo(x: number, y: number) {
    this.current = [x, y];
    this.lines.push(this.current);
  }
  lineTo(x: number, y: number) {
    this.current.push(x, y);
  }
  closePath() {
    if (this.current.length >= 2) this.current.push(this.current[0], this.current[1]);
  }
  arc() {}
}

export function buildMapGeometry(topology: Topology, validIds: ReadonlySet<string>): MapGeometry {
  const projection = geoEquirectangular()
    .scale(MAP_W / (2 * Math.PI))
    .translate([MAP_W / 2, MAP_H / 2]);
  const path = geoPath(projection).digits(2);
  const collect = (object: Parameters<typeof path>[0]): LineSet => {
    const collector = new LineCollector();
    geoPath(projection, collector as unknown as CanvasRenderingContext2D)(object);
    return buildLineSet(collector.lines);
  };

  const collection = topology.objects.countries as GeometryCollection;
  const groups = new Map<string, CountryGeometry[]>();
  for (const geometry of collection.geometries as CountryGeometry[]) {
    const id = String(geometry.id);
    if (!validIds.has(id)) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(geometry);
  }

  const shapes: CountryShape[] = [];
  for (const [id, geometries] of groups) {
    // Merging also dissolves internal boundaries when a country is made of several shapes.
    const merged: MultiPolygon = merge(topology, geometries);
    const d = path(merged);
    if (!d) continue;
    const parts = merged.coordinates.map((coordinates: Position[][]) => {
      const polygon = { type: 'Polygon' as const, coordinates };
      return { area: path.area(polygon), bounds: path.bounds(polygon) as Bounds, centroid: path.centroid(polygon) };
    });
    parts.sort((a, b) => b.area - a.area);
    const largest = parts[0];
    const bounds: Bounds = [
      [Infinity, Infinity],
      [-Infinity, -Infinity],
    ];
    for (const part of parts) {
      if (part.area < largest.area * MAIN_LANDMASS_FRACTION) break;
      bounds[0][0] = Math.min(bounds[0][0], part.bounds[0][0]);
      bounds[0][1] = Math.min(bounds[0][1], part.bounds[0][1]);
      bounds[1][0] = Math.max(bounds[1][0], part.bounds[1][0]);
      bounds[1][1] = Math.max(bounds[1][1], part.bounds[1][1]);
    }
    const [cx, cy] = largest.centroid.every(Number.isFinite)
      ? largest.centroid
      : [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
    const rings = collect(merged);
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < rings.boxes.length; i += 4) {
      box[0] = Math.min(box[0], rings.boxes[i]);
      box[1] = Math.min(box[1], rings.boxes[i + 1]);
      box[2] = Math.max(box[2], rings.boxes[i + 2]);
      box[3] = Math.max(box[3], rings.boxes[i + 3]);
    }
    const extent = Math.max(bounds[1][0] - bounds[0][0], bounds[1][1] - bounds[0][1]);
    shapes.push({ id, d, rings, box, cx, cy, bounds, tiny: largest.area < TINY_AREA, extent });
  }
  // Big countries first, so small ones are drawn (and hit-tested) on top.
  const size = (s: CountryShape) => (s.bounds[1][0] - s.bounds[0][0]) * (s.bounds[1][1] - s.bounds[0][1]);
  shapes.sort((a, b) => size(b) - size(a));

  const borders = collect(
    mesh(
      topology,
      { type: 'GeometryCollection', geometries: [...groups.values()].flat() } as GeometryCollection,
      (a, b) => a === b || String((a as CountryGeometry).id) !== String((b as CountryGeometry).id),
    ),
  );

  const land = feature(topology, topology.objects.land);
  const drawLand = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const p = geoEquirectangular()
      .scale(width / (2 * Math.PI))
      .translate([width / 2, height / 2]);
    ctx.beginPath();
    geoPath(p, ctx)(land);
    ctx.fill();
  };

  return { shapes, byId: Object.fromEntries(shapes.map((s) => [s.id, s])), borders, drawLand };
}

/** Union of several bounds. */
export function unionBounds(all: Bounds[]): Bounds | null {
  if (all.length === 0) return null;
  const out: Bounds = [
    [Infinity, Infinity],
    [-Infinity, -Infinity],
  ];
  for (const b of all) {
    out[0][0] = Math.min(out[0][0], b[0][0]);
    out[0][1] = Math.min(out[0][1], b[0][1]);
    out[1][0] = Math.max(out[1][0], b[1][0]);
    out[1][1] = Math.max(out[1][1], b[1][1]);
  }
  return out;
}

export const WORLD_BOUNDS: Bounds = [
  [0, 0],
  [MAP_W, MAP_H],
];
