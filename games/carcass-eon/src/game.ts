// Carcass Eon rules (D-038, D-039). A turn is two decisions: place the drawn tile,
// then optionally place a follower on it. Completed features score at once; at the
// end, unfinished features and (with Farmers on) fields score.

import type { GameEvent, GameModule, MatchState, PendingDecision, SeatId, SetupContext } from '@onemore/engine';
import { fits, legalPlacements, majority, regionPoints, regions, cellKey, type Board, type Follower } from './map';
import { START_TILE, bagContents, tileDef, type FeatureKind } from './tiles';

export const MIN_SEATS = 2;
export const MAX_SEATS = 5;
export const FOLLOWERS = 7;

export interface CarcassState {
  phase: 'place' | 'follow' | 'done';
  /** Index into seats of the player whose turn it is. */
  turn: number;
  /** How many tiles have been placed after the start tile; makes decision ids unique. */
  placed: number;
  board: Board;
  /** Component id of the drawn tile, while there is one. */
  current: string | null;
  /** Cell of the tile placed this turn, during the follow step. */
  lastPlaced: string | null;
  followers: Follower[];
  supply: Record<SeatId, number>;
  scores: Record<SeatId, number>;
  /** Tiles set aside because they fit nowhere (public). */
  discarded: string[];
  farmers: boolean;
}

export interface CarcassView {
  phase: CarcassState['phase'];
  turn: SeatId | null;
  board: { cell: string; def: string; rotation: number; x: number; y: number }[];
  lastPlaced: string | null;
  current: string | null;
  bag: number;
  followers: (Follower & { kind: FeatureKind })[];
  supply: Record<SeatId, number>;
  scores: Record<SeatId, number>;
  discarded: string[];
  farmers: boolean;
}

type S = MatchState<CarcassState>;
type Ctx = SetupContext;

const LABEL: Record<FeatureKind, string> = { city: 'City', road: 'Road', monastery: 'Monastery', field: 'Field (farmer)' };

function currentDef(ctx: Ctx, g: CarcassState): string {
  return ctx.table.component(g.current!).def;
}

/** Draws until a tile fits somewhere; tiles that don't are set aside for all to see. Ends the game when the bag is empty. */
function drawPlaceable(ctx: Ctx, g: CarcassState): void {
  g.current = null;
  while (ctx.table.zone('bag').items.length > 0) {
    const id = ctx.table.draw('bag', 'current');
    if (legalPlacements(g.board, ctx.table.component(id).def).length > 0) {
      g.current = id;
      g.phase = 'place';
      return;
    }
    ctx.table.move(id, 'discard');
    g.discarded.push(ctx.table.component(id).def);
  }
  finalScoring(g);
}

/** Features on the placed tile that a follower could take right now. */
function followerOptions(g: CarcassState, seat: SeatId): { feature: number; kind: FeatureKind }[] {
  if (!g.lastPlaced || (g.supply[seat] ?? 0) < 1) return [];
  const placed = g.board[g.lastPlaced]!;
  const { regions: rs, regionOf } = regions(g.board);
  return tileDef(placed.def)
    .features.map((f, feature) => ({ feature, kind: f.kind }))
    .filter(({ feature, kind }) => {
      if (kind === 'field' && !g.farmers) return false;
      const region = rs[regionOf.get(`${g.lastPlaced}#${feature}`)!]!;
      return majority(region, g.followers).length === 0;
    });
}

/** Scores features completed by the tile just placed, and returns their followers. */
function scoreCompleted(g: CarcassState): GameEvent[] {
  const events: GameEvent[] = [];
  const cell = g.lastPlaced!;
  const [x, y] = cell.split(',').map(Number) as [number, number];
  const { regions: rs } = regions(g.board);
  const near = new Set<string>();
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) near.add(cellKey(x + dx, y + dy));

  rs.forEach((region) => {
    if (!region.complete || region.kind === 'field') return;
    const touchesNewTile = region.cells.includes(cell) || (region.kind === 'monastery' && near.has(region.cells[0]!));
    if (!touchesNewTile) return;
    const winners = majority(region, g.followers);
    if (winners.length === 0) return;
    const points = regionPoints(g.board, region, rs, false);
    for (const seat of winners) g.scores[seat] = (g.scores[seat] ?? 0) + points;
    events.push({ type: 'scored', kind: region.kind, seats: winners, points, cells: region.cells });
    returnFollowers(g, region.nodes);
  });
  return events;
}

function returnFollowers(g: CarcassState, nodes: string[]): void {
  const set = new Set(nodes);
  g.followers = g.followers.filter((f) => {
    if (!set.has(`${f.cell}#${f.feature}`)) return true;
    g.supply[f.seat] = (g.supply[f.seat] ?? 0) + 1;
    return false;
  });
}

function finalScoring(g: CarcassState): void {
  const { regions: rs } = regions(g.board);
  rs.forEach((region) => {
    if (region.kind === 'field' && !g.farmers) return;
    const winners = majority(region, g.followers);
    if (winners.length === 0) return;
    const points = regionPoints(g.board, region, rs, true);
    for (const seat of winners) g.scores[seat] = (g.scores[seat] ?? 0) + points;
  });
  g.phase = 'done';
  g.current = null;
}

function endTurn(ctx: Ctx, g: CarcassState): GameEvent[] {
  const events = scoreCompleted(g);
  g.lastPlaced = null;
  g.turn = (g.turn + 1) % ctx.seats.length;
  drawPlaceable(ctx, g);
  return events;
}

export const carcassEon: GameModule<CarcassState> = {
  id: 'carcass-eon',
  version: '0.1.0',

  setup(ctx) {
    if (ctx.seats.length < MIN_SEATS || ctx.seats.length > MAX_SEATS) {
      throw new Error(`Carcass Eon needs ${MIN_SEATS}–${MAX_SEATS} players`);
    }
    const { table, seats } = ctx;
    table.addZone('bag', { visibility: 'count' });
    table.addZone('current', { visibility: 'public' });
    table.addZone('board', { visibility: 'public' });
    table.addZone('discard', { visibility: 'public' });
    table.create([START_TILE], 'board');
    table.create(bagContents(), 'bag');
    table.shuffle('bag', 'bag');

    const g: CarcassState = {
      phase: 'place',
      turn: 0,
      placed: 0,
      board: { [cellKey(0, 0)]: { def: START_TILE, rotation: 0, x: 0, y: 0 } },
      current: null,
      lastPlaced: null,
      followers: [],
      supply: Object.fromEntries(seats.map((s) => [s, FOLLOWERS])),
      scores: Object.fromEntries(seats.map((s) => [s, 0])),
      discarded: [],
      farmers: ctx.options['farmers'] !== false,
    };
    drawPlaceable(ctx, g);
    return g;
  },

  decisions(s: S): PendingDecision[] {
    const { g } = s;
    const seat = s.seats[g.turn]!;
    if (g.phase === 'place' && g.current) {
      const def = s.table.components[g.current]!.def;
      const sites = legalPlacements(g.board, def).map((p) => `${p.x},${p.y},${p.rotation}`);
      return [
        {
          id: `p${g.placed}`,
          seats: [seat],
          mode: 'one',
          blocking: true,
          prompt: { kind: 'place', component: g.current, sites },
          defaultAnswer: { site: sites[0]! },
        },
      ];
    }
    if (g.phase === 'follow') {
      const options = followerOptions(g, seat).map(({ feature, kind }) => ({ id: `f${feature}`, label: LABEL[kind] }));
      return [
        {
          id: `f${g.placed}`,
          seats: [seat],
          mode: 'one',
          blocking: true,
          prompt: { kind: 'choose', options: [{ id: 'none', label: 'No follower' }, ...options] },
          defaultAnswer: { option: 'none' },
        },
      ];
    }
    return [];
  },

  apply(ctx, by, decision, answer) {
    const { g, table } = ctx;
    const seat = by as SeatId;

    if (decision.prompt.kind === 'place' && 'site' in answer) {
      const [x, y, rotation] = answer.site.split(',').map(Number) as [number, number, number];
      const def = currentDef(ctx, g);
      if (!fits(g.board, def, x, y, rotation)) throw new Error('illegal placement slipped through');
      const cell = cellKey(x, y);
      g.board[cell] = { def, rotation, x, y };
      table.move(g.current!, 'board');
      g.current = null;
      g.lastPlaced = cell;
      g.placed += 1;
      const events: GameEvent[] = [{ type: 'placed', seat, cell, def, rotation }];
      if (followerOptions(g, seat).length === 0) return [...events, ...endTurn(ctx, g)];
      g.phase = 'follow';
      return events;
    }

    if ('option' in answer && answer.option.startsWith('f')) {
      const feature = Number(answer.option.slice(1));
      g.followers.push({ seat, cell: g.lastPlaced!, feature });
      g.supply[seat] = (g.supply[seat] ?? 0) - 1;
    }
    return endTurn(ctx, g);
  },

  view(s: S): CarcassView {
    const { g } = s;
    return {
      phase: g.phase,
      turn: g.phase === 'done' ? null : (s.seats[g.turn] ?? null),
      board: Object.entries(g.board)
        .map(([cell, p]) => ({ cell, ...p }))
        .sort((a, b) => a.y - b.y || a.x - b.x),
      lastPlaced: g.lastPlaced,
      current: g.current ? s.table.components[g.current]!.def : null,
      bag: s.table.zones['bag']!.items.length,
      followers: g.followers.map((f) => ({ ...f, kind: tileDef(g.board[f.cell]!.def).features[f.feature]!.kind })),
      supply: { ...g.supply },
      scores: { ...g.scores },
      discarded: [...g.discarded],
      farmers: g.farmers,
    };
  },

  outcome(s: S) {
    if (s.g.phase !== 'done') return null;
    const best = Math.max(...Object.values(s.g.scores));
    return { results: Object.fromEntries(s.seats.map((seat) => [seat, s.g.scores[seat] === best ? 'win' : 'lose'])) };
  },
};
