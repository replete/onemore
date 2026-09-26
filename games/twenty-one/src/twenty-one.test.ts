import { describe, expect, it } from 'vitest';
import {
  Rng,
  autoAnswer,
  createMatch,
  decisionsFor,
  headerOf,
  newRngState,
  newSeed,
  replay,
  submit,
  type LogEntry,
  type MatchState,
  type Viewer,
} from '@onemore/engine';
import { findLeaks, secretsFor, withHiddenShuffled } from '@onemore/engine/testing';
import { handTotal, twentyOne, type TwentyOneState, type TwentyOneView } from './index';

const SEATS = ['s1', 's2', 's3'];

function viewers(s: MatchState<TwentyOneState>): Viewer[] {
  return [{ kind: 'public' }, ...s.seats.map((seat) => ({ kind: 'seat' as const, seat }))];
}

/** Every message each viewer would receive: the view plus that seat's decisions. */
function expectNoLeaks(s: MatchState<TwentyOneState>): void {
  for (const viewer of viewers(s)) {
    const message = {
      view: twentyOne.view(s, viewer),
      decisions: viewer.kind === 'seat' ? decisionsFor(twentyOne, s, viewer.seat) : [],
    };
    expect(findLeaks(message, secretsFor(s as MatchState<unknown>, viewer))).toEqual([]);
    // Derived leaks: the viewer's messages must not change when hidden cards are swapped around.
    const other = withHiddenShuffled(s, viewer);
    expect({
      view: twentyOne.view(other, viewer),
      decisions: viewer.kind === 'seat' ? decisionsFor(twentyOne, other, viewer.seat) : [],
    }).toEqual(message);
  }
}

describe('handTotal', () => {
  it('counts aces as 11 when that does not bust', () => {
    expect(handTotal(['AS', 'KH'])).toEqual({ total: 21, soft: true });
    expect(handTotal(['AS', 'AH', '9D'])).toEqual({ total: 21, soft: true });
    expect(handTotal(['AS', 'KH', 'QD'])).toEqual({ total: 21, soft: false });
    expect(handTotal(['7S', '8H', '9D'])).toEqual({ total: 24, soft: false });
  });
});

describe('twenty-one', () => {
  it('deals two cards each and hides the dealer’s second card', () => {
    const s = createMatch(twentyOne, { seats: SEATS, options: {}, seed: newSeed() });
    const view = twentyOne.view(s, { kind: 'public' }) as TwentyOneView;
    expect(view.seats.every((seat) => seat.cards.length === 2 || seat.status === 'natural')).toBe(true);
    expect(view.dealer.cards).toHaveLength(2);
    expect(view.dealer.cards[0]!.def).toBeDefined();
    expect(view.dealer.cards[1]!.def).toBeUndefined();
  });

  it('plays random games to the end without leaking hidden information', () => {
    for (let game = 0; game < 200; game++) {
      const picker = new Rng(newRngState(newSeed()));
      let s = createMatch(twentyOne, { seats: SEATS, options: {}, seed: newSeed() });
      const log: LogEntry[] = [];
      expectNoLeaks(s);

      for (let step = 0; s.g.phase === 'playing'; step++) {
        expect(step).toBeLessThan(100);
        const seat = s.seats[s.g.turn]!;
        const [decision] = decisionsFor(twentyOne, s, seat);
        const option = picker.int('pick', 3) === 0 ? 'stand' : 'hit';
        const r = submit(twentyOne, s, seat, { decision: decision!.id, answer: { option } });
        if (!r.ok) throw new Error(r.error);
        log.push(r.entry);
        s = r.state;
        expectNoLeaks(s);
      }

      // Round over: every card accounted for, the dealer's hand played out, results for everyone.
      expect(Object.keys(s.table.components)).toHaveLength(52);
      const dealer = handTotal(s.table.zones['dealer']!.items.map((id) => s.table.components[id]!.def)).total;
      const allBust = s.seats.every((seat) => s.g.status[seat] === 'bust');
      if (!allBust) expect(dealer).toBeGreaterThanOrEqual(17);
      expect(Object.keys(s.g.results).sort()).toEqual([...SEATS].sort());
      for (const seat of SEATS) if (s.g.status[seat] === 'bust') expect(s.g.results[seat]).toBe('lose');

      expect(replay(twentyOne, headerOf(s), log)).toEqual(s);
    }
  });

  it('only accepts a move from the player whose turn it is', () => {
    const s = createMatch(twentyOne, { seats: SEATS, options: {}, seed: 'b'.repeat(64) });
    const seat = s.seats[s.g.turn];
    if (!seat) return; // everyone was dealt 21
    const other = SEATS.find((x) => x !== seat)!;
    const [decision] = decisionsFor(twentyOne, s, seat);
    expect(decisionsFor(twentyOne, s, other)).toEqual([]);
    expect(submit(twentyOne, s, other, { decision: decision!.id, answer: { option: 'hit' } }).ok).toBe(false);
  });

  it('stands for an absent player', () => {
    const s = createMatch(twentyOne, { seats: SEATS, options: {}, seed: 'c'.repeat(64) });
    const seat = s.seats[s.g.turn];
    if (!seat) return;
    const [decision] = decisionsFor(twentyOne, s, seat);
    const r = autoAnswer(twentyOne, s, decision!.id);
    expect(r.ok && r.state.g.status[seat]).toBe('stood');
  });

  it('deals a new round from a full, reshuffled deck', () => {
    let s = createMatch(twentyOne, { seats: SEATS, options: {}, seed: 'd'.repeat(64) });
    while (s.g.phase === 'playing') {
      const r = autoAnswer(twentyOne, s, twentyOne.decisions(s)[0]!.id);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const [next] = decisionsFor(twentyOne, s, 's2');
    expect(next!.mode).toBe('any');
    const r = submit(twentyOne, s, 's2', { decision: next!.id, answer: { option: 'deal' } });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.g.round).toBe(2);
    expect(r.state.table.zones['deck']!.items.length + 2 * (SEATS.length + 1)).toBe(52);
    expectNoLeaks(r.state);
  });
});
