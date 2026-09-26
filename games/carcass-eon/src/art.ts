// Procedural tile art (D-038, stage 1): SVG drawn from the tile data, so it's
// correct by construction. Tiles are 100 × 100, drawn in their own orientation and
// rotated with a transform. Pure string output: works in the browser and in Node.

import { tileDef, type FeatureDef, type TileDef } from './tiles';

export const TILE = 100;

export interface Point {
  x: number;
  y: number;
}

const C = {
  field: '#86b25a',
  fieldShade: '#78a24e',
  road: '#efe6cc',
  roadEdge: '#a8946a',
  city: '#d7b98a',
  cityWall: '#7a5a3a',
  roof: '#b5523b',
  banner: '#2f5fbf',
  bannerTrim: '#f4efe2',
  chapel: '#eee6d6',
  outline: '#3d3a2f',
};

const MID: Point[] = [
  { x: 50, y: 0 },
  { x: 100, y: 50 },
  { x: 50, y: 100 },
  { x: 0, y: 50 },
];
const CENTRE: Point = { x: 50, y: 50 };

// --- City shapes: five templates, rotated to fit ----------------------------------

interface CityTemplate {
  sides: number[];
  path: string;
  anchor: Point;
}

const CITY_TEMPLATES: CityTemplate[] = [
  { sides: [0], path: 'M0 0 H100 Q50 55 0 0 Z', anchor: { x: 50, y: 15 } },
  { sides: [1, 3], path: 'M0 0 Q50 44 100 0 V100 Q50 56 0 100 Z', anchor: { x: 50, y: 50 } },
  { sides: [0, 3], path: 'M0 0 H100 Q58 58 0 100 Z', anchor: { x: 30, y: 30 } },
  { sides: [0, 1, 3], path: 'M0 0 H100 V100 Q50 45 0 100 Z', anchor: { x: 50, y: 38 } },
  { sides: [0, 1, 2, 3], path: 'M0 0 H100 V100 H0 Z', anchor: { x: 50, y: 50 } },
];

function citySides(f: FeatureDef): number[] {
  return [...new Set(f.slots.map((s) => Math.floor(s / 3)))].sort();
}

function cityTemplate(f: FeatureDef): { template: CityTemplate; rotation: number } {
  const sides = citySides(f).join();
  for (const template of CITY_TEMPLATES) {
    for (let rotation = 0; rotation < 4; rotation++) {
      const turned = template.sides.map((s) => (s + rotation) % 4).sort().join();
      if (turned === sides) return { template, rotation };
    }
  }
  throw new Error(`no city template for sides ${sides}`);
}

// --- Geometry helpers ----------------------------------------------------------------

function rotatePoint(p: Point, quarterTurns: number): Point {
  let { x, y } = p;
  for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) [x, y] = [TILE - y, x];
  return { x, y };
}

function toward(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function slotPoint(slot: number): Point {
  const side = Math.floor(slot / 3);
  const t = [1 / 6, 1 / 2, 5 / 6][slot % 3]!;
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  return toward(corners[side]!, corners[(side + 1) % 4]!, t);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Road paths: straight across, a quarter circle round a corner, or from an edge to the centre. */
function roadPath(f: FeatureDef): string {
  const sides = f.slots.map((s) => Math.floor(s / 3));
  if (sides.length === 1) {
    const a = MID[sides[0]!]!;
    return `M${a.x} ${a.y} L50 50`;
  }
  const [a, b] = [MID[sides[0]!]!, MID[sides[1]!]!];
  if ((sides[0]! + 2) % 4 === sides[1]) return `M${a.x} ${a.y} L${b.x} ${b.y}`;
  const corner: Point = { x: a.x === 50 ? b.x : a.x, y: a.y === 50 ? b.y : a.y };
  const k = 0.5523 * 50; // cubic approximation of a quarter circle of radius 50
  const pa = { x: a.x + Math.sign(50 - corner.x) * (a.y === 50 ? k : 0), y: a.y + Math.sign(50 - corner.y) * (a.x === 50 ? k : 0) };
  const pb = { x: b.x + Math.sign(50 - corner.x) * (b.y === 50 ? k : 0), y: b.y + Math.sign(50 - corner.y) * (b.x === 50 ? k : 0) };
  return `M${a.x} ${a.y} C${r1(pa.x)} ${r1(pa.y)} ${r1(pb.x)} ${r1(pb.y)} ${b.x} ${b.y}`;
}

// --- Anchors: where a follower stands on each feature ------------------------------

const ANCHOR_OVERRIDES: Record<string, Record<number, Point>> = {
  'city-1-road-straight': { 2: { x: 50, y: 38 } },
  'city-1-junction': { 4: { x: 22, y: 38 } },
  'city-3-road': { 2: { x: 22, y: 86 }, 3: { x: 78, y: 86 } },
  'city-3-road-banner': { 2: { x: 22, y: 86 }, 3: { x: 78, y: 86 } },
  'city-2-corner-road': { 3: { x: 88, y: 18 } },
  'city-2-corner-road-banner': { 3: { x: 88, y: 18 } },
  'city-1-1-adjacent': { 2: { x: 66, y: 66 } },
  'city-2-across': { 1: { x: 50, y: 8 }, 2: { x: 50, y: 92 } },
  'city-2-across-banner': { 1: { x: 50, y: 8 }, 2: { x: 50, y: 92 } },
  'city-3': { 1: { x: 50, y: 88 } },
  'city-3-banner': { 1: { x: 50, y: 88 } },
};

/** Where a follower stands on each feature, in the tile's own orientation. */
export function featureAnchors(defId: string): Point[] {
  const def = tileDef(defId);
  return def.features.map((f, i) => {
    const override = ANCHOR_OVERRIDES[def.id]?.[i];
    if (override) return override;
    switch (f.kind) {
      case 'monastery':
        return CENTRE;
      case 'city': {
        const { template, rotation } = cityTemplate(f);
        return rotatePoint(template.anchor, rotation);
      }
      case 'road': {
        const sides = f.slots.map((s) => Math.floor(s / 3));
        if (sides.length === 1) return toward(MID[sides[0]!]!, CENTRE, 0.45);
        if ((sides[0]! + 2) % 4 === sides[1]) return monasteryOrCentreOffset(def);
        const [a, b] = [MID[sides[0]!]!, MID[sides[1]!]!];
        const corner = { x: a.x === 50 ? b.x : a.x, y: a.y === 50 ? b.y : a.y };
        return toward(corner, CENTRE, 0.5);
      }
      case 'field': {
        const pts = f.slots.map(slotPoint);
        const avg = { x: pts.reduce((n, p) => n + p.x, 0) / pts.length, y: pts.reduce((n, p) => n + p.y, 0) / pts.length };
        return toward(avg, CENTRE, 0.35);
      }
    }
  });
}

// A straight road through the middle: stand the follower slightly off-centre so it
// doesn't cover the junction of a crossroad drawn later.
function monasteryOrCentreOffset(_def: TileDef): Point {
  return { x: 38, y: 50 };
}

/** A feature's anchor after rotating the tile. */
export function anchorAt(defId: string, rotation: number, feature: number): Point {
  return rotatePoint(featureAnchors(defId)[feature]!, rotation);
}

// --- Drawing -----------------------------------------------------------------------

/** One tile as an SVG group, in a 100 × 100 box, rotated `rotation` quarter turns clockwise. */
export function tileSvg(defId: string, rotation = 0): string {
  const def = tileDef(defId);
  const parts: string[] = [];
  parts.push(`<rect width="100" height="100" fill="${C.field}"/>`);
  // A little texture so fields don't look flat; deterministic per tile type.
  parts.push(fieldTexture(def.id));

  const roads = def.features.filter((f) => f.kind === 'road');
  for (const f of roads) parts.push(`<path d="${roadPath(f)}" stroke="${C.roadEdge}" stroke-width="13" fill="none" stroke-linecap="round"/>`);
  for (const f of roads) parts.push(`<path d="${roadPath(f)}" stroke="${C.road}" stroke-width="9" fill="none" stroke-linecap="round"/>`);
  if (roads.length >= 3) parts.push(village());

  def.features.forEach((f) => {
    if (f.kind !== 'city') return;
    const { template, rotation } = cityTemplate(f);
    parts.push(
      `<path d="${template.path}" transform="rotate(${rotation * 90} 50 50)" fill="${C.city}" stroke="${C.cityWall}" stroke-width="3" stroke-linejoin="round"/>`,
    );
    parts.push(cityRoofs(template, rotation));
  });

  const anchors = featureAnchors(def.id);
  def.features.forEach((f, i) => {
    if (f.kind === 'city' && f.banner) parts.push(banner(offset(anchors[i]!, 10, 8)));
    if (f.kind === 'monastery') parts.push(chapel());
  });

  parts.push(`<rect x="0.5" y="0.5" width="99" height="99" fill="none" stroke="${C.outline}" stroke-opacity="0.35" stroke-width="1"/>`);
  return `<g transform="rotate(${rotation * 90} 50 50)">${parts.join('')}</g>`;
}

function offset(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy };
}

function fieldTexture(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const dots: string[] = [];
  for (let i = 0; i < 14; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const x = (h >>> 8) % 100;
    h = (h * 1103515245 + 12345) >>> 0;
    const y = (h >>> 8) % 100;
    dots.push(`<path d="M${x} ${y} l2 -4 l2 4" stroke="${C.fieldShade}" stroke-width="1.2" fill="none"/>`);
  }
  return dots.join('');
}

function cityRoofs(template: CityTemplate, rotation: number): string {
  const a = rotatePoint(template.anchor, rotation);
  const houses = [offset(a, -12, -2), offset(a, 3, -6)];
  return houses
    .map((p) => `<path d="M${r1(p.x)} ${r1(p.y + 6)} v-5 l5 -4 l5 4 v5 z" fill="${C.roof}" stroke="${C.cityWall}" stroke-width="0.8"/>`)
    .join('');
}

function banner(p: Point): string {
  return `<path d="M${r1(p.x - 5)} ${r1(p.y - 6)} h10 v6 q0 5 -5 7 q-5 -2 -5 -7 z" fill="${C.banner}" stroke="${C.bannerTrim}" stroke-width="1.2"/>`;
}

function chapel(): string {
  return [
    `<rect x="36" y="42" width="28" height="20" fill="${C.chapel}" stroke="${C.outline}" stroke-width="1.2"/>`,
    `<path d="M33 43 L50 30 L67 43 Z" fill="${C.roof}" stroke="${C.outline}" stroke-width="1.2"/>`,
    `<rect x="46" y="50" width="8" height="12" rx="4" fill="${C.outline}" fill-opacity="0.75"/>`,
    `<rect x="47" y="22" width="6" height="10" fill="${C.chapel}" stroke="${C.outline}" stroke-width="1"/>`,
  ].join('');
}

function village(): string {
  return `<rect x="42" y="42" width="16" height="16" fill="${C.chapel}" stroke="${C.outline}" stroke-width="1.2"/><path d="M40 43 L50 35 L60 43 Z" fill="${C.roof}" stroke="${C.outline}" stroke-width="1"/>`;
}
