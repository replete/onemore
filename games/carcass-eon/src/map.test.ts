import { describe, expect, it } from 'vitest';
import { cellKey, fits, legalPlacements, majority, regionPoints, regions, type Board, type Placed } from './map';
import { START_TILE, TILES, bagContents, edgeKind, fieldCityContacts, tileDef, type Side } from './tiles';

function board(...tiles: Placed[]): Board {
  return Object.fromEntries(tiles.map((t) => [cellKey(t.x, t.y), t]));
}
const at = (def: string, x: number, y: number, rotation = 0): Placed => ({ def, x, y, rotation });

describe('tile set', () => {
  it('has the classic 24 types and 72 tiles, with the start tile among them', () => {
    expect(TILES).toHaveLength(24);
    expect(TILES.reduce((n, t) => n + t.count, 0)).toBe(72);
    expect(bagContents()).toHaveLength(71);
    expect(tileDef(START_TILE).count).toBeGreaterThan(1);
  });

  it.each(TILES.map((t) => [t.id, t] as const))('%s: every slot belongs to exactly one feature', (_, t) => {
    const slots = t.features.flatMap((f) => f.slots).sort((a, b) => a - b);
    expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const f of t.features) {
      if (f.kind === 'road') expect(f.slots.every((s) => s % 3 === 1)).toBe(true);
      if (f.kind === 'city') {
        for (const s of f.slots) expect(f.slots).toEqual(expect.arrayContaining([s - (s % 3), s - (s % 3) + 1, s - (s % 3) + 2]));
      }
      if (f.kind === 'monastery') expect(f.slots).toEqual([]);
    }
  });

  it('rotates edges clockwise', () => {
    for (const t of TILES) {
      for (let r = 0; r < 4; r++) {
        for (let side = 0; side < 4; side++) {
          expect(edgeKind(t, side as Side, r)).toBe(edgeKind(t, (((side - r) % 4) + 4) % 4 as Side, 0));
        }
      }
    }
  });

  it('knows which fields touch which cities', () => {
    // City edge north, road east–west: the strip between city and road touches the city; the rest doesn't.
    expect(fieldCityContacts(tileDef('city-1-road-straight'))).toEqual(new Map([[2, [0]], [3, []]]));
    expect(fieldCityContacts(tileDef('city-1-1-opposite')).get(2)).toEqual([0, 1]);
    expect(fieldCityContacts(tileDef('road-curve')).get(1)).toEqual([]);
  });
});

describe('placement', () => {
  const start = board(at(START_TILE, 0, 0)); // city north, road east–west

  it('matches cities to cities and roads to roads', () => {
    expect(fits(start, 'city-1', 0, -1, 2)).toBe(true); // its city faces south, onto ours
    expect(fits(start, 'city-1', 0, -1, 0)).toBe(false); // field onto our city
    expect(fits(start, 'road-straight', 1, 0, 1)).toBe(true); // road east–west meets ours
    expect(fits(start, 'road-straight', 1, 0, 0)).toBe(false); // field onto our road
  });

  it('must touch the map and can’t overlap', () => {
    expect(fits(start, 'monastery', 5, 5, 0)).toBe(false);
    expect(fits(start, 'city-4-banner', 0, 0, 0)).toBe(false);
  });

  it('lists legal placements in a stable order', () => {
    const moves = legalPlacements(start, 'road-curve');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves).toEqual(legalPlacements(start, 'road-curve'));
    for (const m of moves) expect(fits(start, 'road-curve', m.x, m.y, m.rotation)).toBe(true);
  });
});

describe('regions and scoring', () => {
  it('completes a two-tile city worth 4', () => {
    const b = board(at(START_TILE, 0, 0), at('city-1', 0, -1, 2));
    const { regions: rs } = regions(b);
    const city = rs.find((r) => r.kind === 'city')!;
    expect(city.cells.sort()).toEqual(['0,-1', '0,0']);
    expect(city.complete).toBe(true);
    expect(regionPoints(b, city, rs, false)).toBe(4);
  });

  it('scores an unfinished city 1 per tile and banner at the end', () => {
    const b = board(at(START_TILE, 0, 0), at('city-2-across-banner', 0, -1, 1)); // city runs north–south, open at the top
    const { regions: rs } = regions(b);
    const city = rs.find((r) => r.kind === 'city')!;
    expect(city.complete).toBe(false);
    expect(city.banners).toBe(1);
    expect(regionPoints(b, city, rs, true)).toBe(3);
  });

  it('completes a road between two ends', () => {
    // Start road runs east–west; a junction closes the east end, a monastery closes the west end.
    const b = board(at(START_TILE, 0, 0), at('road-junction-3', 1, 0, 0), at('monastery-road', -1, 0, 3));
    const { regions: rs, regionOf } = regions(b);
    const road = rs[regionOf.get('0,0#1')!]!;
    expect(road.kind).toBe('road');
    expect(road.cells.sort()).toEqual(['-1,0', '0,0', '1,0']);
    expect(road.complete).toBe(true);
    expect(regionPoints(b, road, rs, false)).toBe(3);
  });

  it('completes a monastery once all eight neighbours are placed', () => {
    const tiles: Placed[] = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) tiles.push(at('monastery', x, y));
    const b = board(...tiles);
    const { regions: rs, regionOf } = regions(b);
    const middle = rs[regionOf.get('0,0#0')!]!;
    const corner = rs[regionOf.get('-1,-1#0')!]!;
    expect(middle.complete).toBe(true);
    expect(regionPoints(b, middle, rs, false)).toBe(9);
    expect(corner.complete).toBe(false);
    expect(regionPoints(b, corner, rs, true)).toBe(4);
  });

  it('scores farmers 3 per completed city their field touches', () => {
    const b = board(at(START_TILE, 0, 0), at('city-1', 0, -1, 2));
    const { regions: rs, regionOf } = regions(b);
    const strip = rs[regionOf.get('0,0#2')!]!; // between the city and the road
    const below = rs[regionOf.get('0,0#3')!]!; // south of the road
    expect(regionPoints(b, strip, rs, true)).toBe(3);
    expect(regionPoints(b, below, rs, true)).toBe(0);
  });

  it('gives the points to the majority, and to everyone tied', () => {
    const b = board(at(START_TILE, 0, 0), at('city-1', 0, -1, 2));
    const { regions: rs } = regions(b);
    const city = rs.find((r) => r.kind === 'city')!;
    expect(majority(city, [])).toEqual([]);
    expect(majority(city, [{ seat: 's1', cell: '0,0', feature: 0 }])).toEqual(['s1']);
    expect(
      majority(city, [
        { seat: 's2', cell: '0,0', feature: 0 },
        { seat: 's1', cell: '0,-1', feature: 0 },
      ]),
    ).toEqual(['s1', 's2']);
  });
});
