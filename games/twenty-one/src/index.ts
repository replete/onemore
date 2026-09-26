// 21, minimal version (D-021): the server deals; each player hits or stands in turn;
// the dealer draws to 17 and stands on all 17s. No betting yet. Full rules and
// variations come later, as game options.

import {
  cards,
  viewZone,
  visibleDefs,
  type CardView,
  type GameModule,
  type MatchState,
  type PendingDecision,
  type SeatId,
  type SetupContext,
  type Viewer,
} from '@onemore/engine';

export const MAX_SEATS = 7;

export type Status = 'playing' | 'stood' | 'bust' | 'twenty-one' | 'natural';
export type Result = 'win' | 'lose' | 'push';

export interface TwentyOneState {
  phase: 'playing' | 'done';
  round: number;
  /** Index into seats of the player whose turn it is, while playing. */
  turn: number;
  status: Record<SeatId, Status>;
  results: Record<SeatId, Result>;
  /** Component id of the dealer's face-down card. */
  hole: string;
}

export interface SeatView {
  seat: SeatId;
  cards: CardView[];
  total: number;
  status: Status;
  result?: Result;
}

export interface TwentyOneView {
  phase: TwentyOneState['phase'];
  round: number;
  turn: SeatId | null;
  dealer: { cards: CardView[]; total: number; bust: boolean };
  seats: SeatView[];
  deck: number;
}

type S = MatchState<TwentyOneState>;
type Ctx = SetupContext & { g?: TwentyOneState };

/** Best total for a hand, counting one ace as 11 when that doesn't bust. */
export function handTotal(defs: string[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const def of defs) {
    const rank = cards.rankOf(def);
    if (rank === 'A') {
      aces += 1;
      total += 1;
    } else if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') total += 10;
    else total += Number(rank);
  }
  if (aces > 0 && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

const handOf = (seat: SeatId) => `hand:${seat}`;

function defsIn(ctx: Ctx, zone: string): string[] {
  return ctx.table.items(zone).map((c) => c.def);
}

function deal(ctx: Ctx, g: TwentyOneState): void {
  const { table, seats } = ctx;
  for (const seat of seats) table.draw('deck', handOf(seat), { face: 'up' });
  table.draw('deck', 'dealer', { face: 'up' });
  for (const seat of seats) table.draw('deck', handOf(seat), { face: 'up' });
  g.hole = table.draw('deck', 'dealer', { face: 'down' });

  g.phase = 'playing';
  g.results = {};
  for (const seat of seats) {
    g.status[seat] = handTotal(defsIn(ctx, handOf(seat))).total === 21 ? 'natural' : 'playing';
  }
  g.turn = -1;
  advance(ctx, g);
}

/** Moves the turn to the next seat still playing, or plays out the dealer. */
function advance(ctx: Ctx, g: TwentyOneState): void {
  const next = ctx.seats.findIndex((seat, i) => i > g.turn && g.status[seat] === 'playing');
  if (next >= 0) {
    g.turn = next;
    return;
  }
  finishRound(ctx, g);
}

function finishRound(ctx: Ctx, g: TwentyOneState): void {
  const { table, seats } = ctx;
  table.flip(g.hole, 'up');
  const anyStanding = seats.some((seat) => g.status[seat] !== 'bust');
  while (anyStanding && handTotal(defsIn(ctx, 'dealer')).total < 17 && table.zone('deck').items.length > 0) {
    table.draw('deck', 'dealer', { face: 'up' });
  }
  const dealer = defsIn(ctx, 'dealer');
  const dealerTotal = handTotal(dealer).total;
  const dealerNatural = dealer.length === 2 && dealerTotal === 21;

  for (const seat of seats) {
    const status = g.status[seat]!;
    const total = handTotal(defsIn(ctx, handOf(seat))).total;
    let result: Result;
    if (status === 'bust') result = 'lose';
    else if (status === 'natural') result = dealerNatural ? 'push' : 'win';
    else if (dealerNatural) result = 'lose';
    else if (dealerTotal > 21 || total > dealerTotal) result = 'win';
    else result = total === dealerTotal ? 'push' : 'lose';
    g.results[seat] = result;
  }
  g.phase = 'done';
  g.turn = -1;
}

function collectAndShuffle(ctx: Ctx): void {
  const { table, seats } = ctx;
  for (const zone of ['dealer', ...seats.map(handOf)]) {
    for (const c of table.items(zone)) table.move(c.id, 'deck');
  }
  table.shuffle('deck');
}

export const twentyOne: GameModule<TwentyOneState> = {
  id: 'twenty-one',
  version: '0.1.0',

  setup(ctx) {
    if (ctx.seats.length < 1 || ctx.seats.length > MAX_SEATS) {
      throw new Error(`21 needs 1–${MAX_SEATS} players`);
    }
    const { table } = ctx;
    table.addZone('deck', { visibility: 'count' });
    table.addZone('dealer', { visibility: 'public' });
    for (const seat of ctx.seats) table.addZone(handOf(seat), { visibility: 'public', owner: seat });
    table.create(cards.standardDeck(), 'deck');
    table.shuffle('deck');

    const g: TwentyOneState = { phase: 'playing', round: 1, turn: -1, status: {}, results: {}, hole: '' };
    deal(ctx, g);
    return g;
  },

  decisions(s: S): PendingDecision[] {
    const { g } = s;
    if (g.phase === 'done') {
      return [
        {
          id: `r${g.round}:next`,
          seats: [...s.seats],
          mode: 'any',
          blocking: true,
          prompt: { kind: 'choose', options: [{ id: 'deal', label: 'Deal again' }] },
        },
      ];
    }
    const seat = s.seats[g.turn];
    if (seat === undefined) return [];
    const size = s.table.zones[handOf(seat)]!.items.length;
    return [
      {
        id: `r${g.round}:${seat}:${size}`,
        seats: [seat],
        mode: 'one',
        blocking: true,
        prompt: {
          kind: 'choose',
          options: [
            { id: 'hit', label: 'Hit' },
            { id: 'stand', label: 'Stand' },
          ],
        },
        defaultAnswer: { option: 'stand' },
      },
    ];
  },

  apply(ctx, by, _decision, answer) {
    const { g, table } = ctx;
    const option = 'option' in answer ? answer.option : undefined;

    if (option === 'deal') {
      collectAndShuffle(ctx);
      g.round += 1;
      deal(ctx, g);
      return [{ type: 'dealt', round: g.round }];
    }

    const seat = by as SeatId;
    if (option === 'hit' && table.zone('deck').items.length > 0) {
      table.draw('deck', handOf(seat), { face: 'up' });
      const total = handTotal(defsIn(ctx, handOf(seat))).total;
      if (total > 21) g.status[seat] = 'bust';
      else if (total === 21) g.status[seat] = 'twenty-one';
      else return [{ type: 'hit', seat }];
    } else {
      g.status[seat] = 'stood';
    }
    advance(ctx, g);
    return [{ type: option === 'hit' ? 'hit' : 'stand', seat, auto: ctx.auto }];
  },

  view(s: S, viewer: Viewer): TwentyOneView {
    const { g } = s;
    // Totals only ever count cards this viewer can see (never the face-down card).
    const dealerTotal = handTotal(visibleDefs(s as MatchState<unknown>, 'dealer', viewer)).total;
    return {
      phase: g.phase,
      round: g.round,
      turn: g.phase === 'playing' ? (s.seats[g.turn] ?? null) : null,
      dealer: {
        cards: viewZone(s as MatchState<unknown>, 'dealer', viewer).cards ?? [],
        total: dealerTotal,
        bust: g.phase === 'done' && dealerTotal > 21,
      },
      seats: s.seats.map((seat): SeatView => {
        const view: SeatView = {
          seat,
          cards: viewZone(s as MatchState<unknown>, handOf(seat), viewer).cards ?? [],
          total: handTotal(visibleDefs(s as MatchState<unknown>, handOf(seat), viewer)).total,
          status: g.status[seat]!,
        };
        const result = g.results[seat];
        if (result) view.result = result;
        return view;
      }),
      deck: s.table.zones['deck']!.items.length,
    };
  },

  outcome(s: S) {
    return s.g.phase === 'done' ? { results: { ...s.g.results } } : null;
  },
};

export default twentyOne;
