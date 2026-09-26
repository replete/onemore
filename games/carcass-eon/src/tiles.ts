// The tile set as data (D-038, D-039). Game logic reads only this: the art never
// decides what connects.
//
// Slot model: each side is split into three slots, numbered clockwise around the
// tile, so slot = side * 3 + k. Sides: 0 north, 1 east, 2 south, 3 west.
//
//        N0  N1  N2
//   W2              E0
//   W1              E1
//   W0              E2
//        S2  S1  S0
//
// A city edge fills all three slots of a side; a road uses the middle slot, with
// field on either side; a field edge fills all three. Rotating a tile a quarter
// turn clockwise moves every slot on by three.

export type Side = 0 | 1 | 2 | 3;
export type Slot = number;
export type EdgeKind = 'city' | 'road' | 'field';
export type FeatureKind = 'city' | 'road' | 'field' | 'monastery';

export interface FeatureDef {
  kind: FeatureKind;
  /** Slots this feature occupies on the tile's edge. Empty for a monastery. */
  slots: Slot[];
  banner?: true;
}

export interface TileDef {
  id: string;
  name: string;
  /** Copies in the game, including the start tile. */
  count: number;
  features: FeatureDef[];
}

export const N = 0;
export const E = 1;
export const S = 2;
export const W = 3;
const [N0, N1, N2, E0, E1, E2, S0, S1, S2, W0, W1, W2] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

const sideSlots = (side: number): Slot[] => [side * 3, side * 3 + 1, side * 3 + 2];
const city = (sides: number[], banner = false): FeatureDef => ({
  kind: 'city',
  slots: sides.flatMap(sideSlots),
  ...(banner ? { banner: true as const } : {}),
});
const road = (...sides: number[]): FeatureDef => ({ kind: 'road', slots: sides.map((s) => s * 3 + 1) });
const field = (...slots: Slot[]): FeatureDef => ({ kind: 'field', slots });
const monastery = (): FeatureDef => ({ kind: 'monastery', slots: [] });

export const START_TILE = 'city-1-road-straight';

export const TILES: TileDef[] = [
  { id: 'monastery-road', name: 'Monastery with road', count: 2, features: [monastery(), road(S), field(N0, N1, N2, E0, E1, E2, S0, S2, W0, W1, W2)] },
  { id: 'monastery', name: 'Monastery', count: 4, features: [monastery(), field(N0, N1, N2, E0, E1, E2, S0, S1, S2, W0, W1, W2)] },
  { id: 'city-4-banner', name: 'Walled city with banner', count: 1, features: [city([N, E, S, W], true)] },
  { id: 'city-1-road-straight', name: 'City edge and straight road', count: 4, features: [city([N]), road(E, W), field(E0, W2), field(E2, S0, S1, S2, W0)] },
  { id: 'city-1', name: 'City edge', count: 5, features: [city([N]), field(E0, E1, E2, S0, S1, S2, W0, W1, W2)] },
  { id: 'city-2-across-banner', name: 'City across, with banner', count: 2, features: [city([E, W], true), field(N0, N1, N2), field(S0, S1, S2)] },
  { id: 'city-2-across', name: 'City across', count: 1, features: [city([E, W]), field(N0, N1, N2), field(S0, S1, S2)] },
  { id: 'city-1-1-opposite', name: 'Two city edges, opposite', count: 3, features: [city([E]), city([W]), field(N0, N1, N2, S0, S1, S2)] },
  { id: 'city-1-1-adjacent', name: 'Two city edges, adjacent', count: 2, features: [city([N]), city([W]), field(E0, E1, E2, S0, S1, S2)] },
  { id: 'city-1-road-right', name: 'City edge, road curving right', count: 3, features: [city([N]), road(E, S), field(E2, S0), field(E0, S2, W0, W1, W2)] },
  { id: 'city-1-road-left', name: 'City edge, road curving left', count: 3, features: [city([N]), road(W, S), field(S2, W0), field(E0, E1, E2, S0, W2)] },
  { id: 'city-1-junction', name: 'City edge and crossroads', count: 3, features: [city([N]), road(E), road(S), road(W), field(E0, W2), field(E2, S0), field(S2, W0)] },
  { id: 'city-2-corner-banner', name: 'Corner city with banner', count: 2, features: [city([N, W], true), field(E0, E1, E2, S0, S1, S2)] },
  { id: 'city-2-corner', name: 'Corner city', count: 3, features: [city([N, W]), field(E0, E1, E2, S0, S1, S2)] },
  { id: 'city-2-corner-road-banner', name: 'Corner city with banner and road', count: 2, features: [city([N, W], true), road(E, S), field(E2, S0), field(E0, S2)] },
  { id: 'city-2-corner-road', name: 'Corner city and road', count: 3, features: [city([N, W]), road(E, S), field(E2, S0), field(E0, S2)] },
  { id: 'city-3-banner', name: 'Three-sided city with banner', count: 1, features: [city([N, E, W], true), field(S0, S1, S2)] },
  { id: 'city-3', name: 'Three-sided city', count: 3, features: [city([N, E, W]), field(S0, S1, S2)] },
  { id: 'city-3-road-banner', name: 'City gate with banner', count: 2, features: [city([N, E, W], true), road(S), field(S0), field(S2)] },
  { id: 'city-3-road', name: 'City gate', count: 1, features: [city([N, E, W]), road(S), field(S0), field(S2)] },
  { id: 'road-straight', name: 'Straight road', count: 8, features: [road(N, S), field(S2, W0, W1, W2, N0), field(N2, E0, E1, E2, S0)] },
  { id: 'road-curve', name: 'Curved road', count: 9, features: [road(W, S), field(S2, W0), field(W2, N0, N1, N2, E0, E1, E2, S0)] },
  { id: 'road-junction-3', name: 'Three-way junction', count: 4, features: [road(E), road(S), road(W), field(W2, N0, N1, N2, E0), field(E2, S0), field(S2, W0)] },
  { id: 'road-junction-4', name: 'Crossroads', count: 1, features: [road(N), road(E), road(S), road(W), field(N2, E0), field(E2, S0), field(S2, W0), field(W2, N0)] },
];

export const TILE_BY_ID: ReadonlyMap<string, TileDef> = new Map(TILES.map((t) => [t.id, t]));

export function tileDef(id: string): TileDef {
  const def = TILE_BY_ID.get(id);
  if (!def) throw new Error(`unknown tile: ${id}`);
  return def;
}

/** Which feature of `def` owns `slot` in the tile's own (unrotated) orientation. */
export function featureAtSlot(def: TileDef, slot: Slot): number {
  const index = def.features.findIndex((f) => f.slots.includes(slot));
  if (index < 0) throw new Error(`${def.id}: no feature at slot ${slot}`);
  return index;
}

/** The kind of edge on `side` after rotating the tile `rotation` quarter turns clockwise. */
export function edgeKind(def: TileDef, side: Side, rotation: number): EdgeKind {
  const own = (((side - rotation) % 4) + 4) % 4;
  const kind = def.features[featureAtSlot(def, own * 3 + 1)]!.kind;
  if (kind === 'monastery') throw new Error(`${def.id}: monastery on an edge`);
  return kind;
}

/** Slot on the placed tile (after rotation) back to the tile's own slot. */
export function unrotateSlot(slot: Slot, rotation: number): Slot {
  return (((slot - rotation * 3) % 12) + 12) % 12;
}

/**
 * City features each field touches on the tile: a field touches a city if one of its
 * slots sits next to one of the city's slots around the tile's edge.
 */
export function fieldCityContacts(def: TileDef): Map<number, number[]> {
  const out = new Map<number, number[]>();
  def.features.forEach((f, i) => {
    if (f.kind !== 'field') return;
    const touched = new Set<number>();
    for (const slot of f.slots) {
      for (const next of [(slot + 1) % 12, (slot + 11) % 12]) {
        const j = featureAtSlot(def, next);
        if (def.features[j]!.kind === 'city') touched.add(j);
      }
    }
    out.set(i, [...touched].sort((a, b) => a - b));
  });
  return out;
}

/** The bag's contents: one definition id per physical tile, minus the start tile. */
export function bagContents(): string[] {
  const out: string[] = [];
  for (const t of TILES) {
    const copies = t.id === START_TILE ? t.count - 1 : t.count;
    for (let i = 0; i < copies; i++) out.push(t.id);
  }
  return out;
}
