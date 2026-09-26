// The growing map: placement rules, features joined across tiles, completion and
// scoring. Pure functions over plain data, recomputed from the board each time
// (72 tiles is tiny), so everything stays deterministic and replayable.

import {
  edgeKind,
  featureAtSlot,
  fieldCityContacts,
  tileDef,
  unrotateSlot,
  type FeatureKind,
  type Side,
} from './tiles';

export interface Placed {
  def: string;
  rotation: number;
  x: number;
  y: number;
}

/** Placed tiles by "x,y". y grows southwards. */
export type Board = Record<string, Placed>;

export interface Follower {
  seat: string;
  /** Board cell "x,y" and feature index on that tile. */
  cell: string;
  feature: number;
}

export interface Placement {
  x: number;
  y: number;
  rotation: number;
}

export interface Region {
  kind: FeatureKind;
  /** Tile features in this region, as "x,y#feature". */
  nodes: string[];
  /** Distinct cells the region covers. */
  cells: string[];
  banners: number;
  /** Roads and cities: complete when no slot faces an empty square. Monasteries: all 8 neighbours placed. */
  complete: boolean;
  /** Fields only: indices of the city regions this field touches. */
  touches: number[];
}

export const cellKey = (x: number, y: number) => `${x},${y}`;
const STEP: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

function neighbour(board: Board, x: number, y: number, side: number): Placed | undefined {
  const [dx, dy] = STEP[side]!;
  return board[cellKey(x + dx, y + dy)];
}

/** Can tile `def` go at (x, y) with `rotation`? It must touch the map, and every touching edge must match. */
export function fits(board: Board, def: string, x: number, y: number, rotation: number): boolean {
  if (board[cellKey(x, y)]) return false;
  const tile = tileDef(def);
  let touching = false;
  for (let side = 0; side < 4; side++) {
    const other = neighbour(board, x, y, side);
    if (!other) continue;
    touching = true;
    const mine = edgeKind(tile, side as Side, rotation);
    const theirs = edgeKind(tileDef(other.def), ((side + 2) % 4) as Side, other.rotation);
    if (mine !== theirs) return false;
  }
  return touching;
}

/** Every legal placement for `def`, in a stable order (row, column, rotation). */
export function legalPlacements(board: Board, def: string): Placement[] {
  const frontier = new Map<string, [number, number]>();
  for (const p of Object.values(board)) {
    for (const [dx, dy] of STEP) {
      const key = cellKey(p.x + dx, p.y + dy);
      if (!board[key]) frontier.set(key, [p.x + dx, p.y + dy]);
    }
  }
  const out: Placement[] = [];
  const cells = [...frontier.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const [x, y] of cells) {
    for (let rotation = 0; rotation < 4; rotation++) {
      if (fits(board, def, x, y, rotation)) out.push({ x, y, rotation });
    }
  }
  return out;
}

/** Joins features across the whole board into regions. */
export function regions(board: Board): { regions: Region[]; regionOf: Map<string, number> } {
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let root = a;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(a, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  const node = (cell: string, feature: number) => `${cell}#${feature}`;

  const cells = Object.keys(board).sort();
  for (const cell of cells) {
    tileDef(board[cell]!.def).features.forEach((_, i) => parent.set(node(cell, i), node(cell, i)));
  }

  const open = new Set<string>(); // nodes with a road or city slot facing an empty square
  for (const cell of cells) {
    const p = board[cell]!;
    const def = tileDef(p.def);
    for (let side = 0; side < 4; side++) {
      const other = neighbour(board, p.x, p.y, side);
      for (let k = 0; k < 3; k++) {
        const mine = featureAtSlot(def, unrotateSlot(side * 3 + k, p.rotation));
        if (!other) {
          const kind = def.features[mine]!.kind;
          if (kind === 'road' || kind === 'city') open.add(node(cell, mine));
          continue;
        }
        const opposite = (side + 2) % 4;
        const theirs = featureAtSlot(tileDef(other.def), unrotateSlot(opposite * 3 + (2 - k), other.rotation));
        union(node(cell, mine), node(cellKey(other.x, other.y), theirs));
      }
    }
  }

  // Collect regions in a stable order.
  const byRoot = new Map<string, string[]>();
  for (const cell of cells) {
    tileDef(board[cell]!.def).features.forEach((_, i) => {
      const n = node(cell, i);
      const root = find(n);
      byRoot.set(root, [...(byRoot.get(root) ?? []), n]);
    });
  }
  const list: Region[] = [];
  const regionOf = new Map<string, number>();
  for (const nodes of byRoot.values()) {
    const [cell0, f0] = nodes[0]!.split('#') as [string, string];
    const kind = tileDef(board[cell0]!.def).features[Number(f0)]!.kind;
    const regionCells = [...new Set(nodes.map((n) => n.split('#')[0]!))];
    let banners = 0;
    for (const n of nodes) {
      const [c, f] = n.split('#') as [string, string];
      if (tileDef(board[c]!.def).features[Number(f)]!.banner) banners += 1;
    }
    let complete: boolean;
    if (kind === 'monastery') {
      const p = board[cell0]!;
      complete = surrounding(board, p.x, p.y) === 8;
    } else if (kind === 'field') {
      complete = false;
    } else {
      complete = !nodes.some((n) => open.has(n));
    }
    const index = list.length;
    for (const n of nodes) regionOf.set(n, index);
    list.push({ kind, nodes, cells: regionCells, banners, complete, touches: [] });
  }

  // Fields: which city regions they touch.
  list.forEach((region) => {
    if (region.kind !== 'field') return;
    const touched = new Set<number>();
    for (const n of region.nodes) {
      const [cell, f] = n.split('#') as [string, string];
      const contacts = fieldCityContacts(tileDef(board[cell]!.def)).get(Number(f)) ?? [];
      for (const cityFeature of contacts) touched.add(regionOf.get(node(cell, cityFeature))!);
    }
    region.touches = [...touched].sort((a, b) => a - b);
  });

  return { regions: list, regionOf };
}

/** How many of the 8 squares around (x, y) have tiles. */
export function surrounding(board: Board, x: number, y: number): number {
  let n = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && board[cellKey(x + dx, y + dy)]) n += 1;
  }
  return n;
}

/** Points a region is worth: `final` for end-of-game scoring of unfinished features. */
export function regionPoints(board: Board, region: Region, all: Region[], final: boolean): number {
  switch (region.kind) {
    case 'road':
      return region.cells.length;
    case 'city':
      return region.complete && !final ? 2 * region.cells.length + 2 * region.banners : region.cells.length + region.banners;
    case 'monastery': {
      const [x, y] = region.cells[0]!.split(',').map(Number) as [number, number];
      return 1 + surrounding(board, x, y);
    }
    case 'field':
      return 3 * region.touches.filter((i) => all[i]!.complete).length;
  }
}

/** Seats with the most followers on `region` (ties all win). Empty if nobody's there. */
export function majority(region: Region, followers: Follower[]): string[] {
  const nodes = new Set(region.nodes);
  const count = new Map<string, number>();
  for (const f of followers) {
    if (nodes.has(`${f.cell}#${f.feature}`)) count.set(f.seat, (count.get(f.seat) ?? 0) + 1);
  }
  const best = Math.max(0, ...count.values());
  return best === 0 ? [] : [...count.entries()].filter(([, n]) => n === best).map(([seat]) => seat).sort();
}
