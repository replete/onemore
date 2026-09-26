import { describe, expect, it } from 'vitest';
import {
  autoAnswer,
  createMatch,
  decisionsFor,
  headerOf,
  newSeed,
  replay,
  submit,
  viewZone,
  type GameModule,
  type LogEntry,
  type MatchState,
} from './index';
import { Rng, newRngState } from './rng';
import { findLeaks, secretsFor } from './testing';

const SEED = 'a'.repeat(64);

describe('Rng', () => {
  it('is deterministic for a seed and stream', () => {
    const a = new Rng(newRngState(SEED));
    const b = new Rng(newRngState(SEED));
    const xs = Array.from({ length: 40 }, () => a.u32('deck'));
    expect(Array.from({ length: 40 }, () => b.u32('deck'))).toEqual(xs);
  });

  it('keeps streams independent', () => {
    const a = new Rng(newRngState(SEED));
    const b = new Rng(newRngState(SEED));
    a.u32('other');
    a.u32('other');
    expect(a.u32('deck')).toBe(b.u32('deck'));
  });

  it('continues across blocks from a saved state', () => {
    const state = newRngState(SEED);
    const all = new Rng(newRngState(SEED));
    const expected = Array.from({ length: 50 }, () => all.u32('deck'));
    const got: number[] = [];
    for (let i = 0; i < 50; i++) got.push(new Rng(state).u32('deck')); // a fresh Rng each time, as after a restore
    expect(got).toEqual(expected);
  });

  it('shuffles into a permutation and draws unbiased ranges', () => {
    const rng = new Rng(newRngState(newSeed()));
    const deck = rng.shuffle('deck', Array.from({ length: 52 }, (_, i) => i));
    expect([...deck].sort((x, y) => x - y)).toEqual(Array.from({ length: 52 }, (_, i) => i));
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) counts[rng.int('r', 3)]!++;
    for (const c of counts) expect(c).toBeGreaterThan(850);
  });

  it('rejects bad seeds and stream names', () => {
    expect(() => newRngState('xyz')).toThrow();
    expect(() => new Rng(newRngState(SEED)).u32('')).toThrow();
    expect(() => new Rng(newRngState(SEED)).u32('x'.repeat(65))).toThrow();
  });

  it('keeps scoped streams independent of each other', () => {
    const a = new Rng(newRngState(SEED));
    const b = new Rng(newRngState(SEED));
    for (let i = 0; i < 100; i++) a.u32('shuffle/r1'); // extra draws in round 1…
    expect(a.u32('shuffle/r2')).toBe(b.u32('shuffle/r2')); // …don't shift round 2
  });
});

// A tiny game to exercise the engine: each seat is dealt one hidden card and may
// swap it with the top of the deck once, or keep it.
type G = { done: string[] };
const swapGame: GameModule<G> = {
  id: 'swap',
  version: '1',
  setup({ seats, table }) {
    table.addZone('deck', { visibility: 'count' });
    table.create(['AS', '2S', '3S', '4S', '5S', '6S'], 'deck');
    table.shuffle('deck');
    for (const seat of seats) {
      table.addZone(`hand:${seat}`, { visibility: 'owner', owner: seat });
      table.draw('deck', `hand:${seat}`);
    }
    return { done: [] };
  },
  decisions(s) {
    return s.seats
      .filter((seat) => !s.g.done.includes(seat))
      .map((seat) => {
        const card = s.table.zones[`hand:${seat}`]!.items[0]!;
        return {
          id: `swap:${seat}`,
          seats: [seat],
          mode: 'one' as const,
          blocking: true,
          prompt: {
            kind: 'pick' as const,
            options: [
              { id: 'swap', component: card, target: 'deck' },
              { id: 'keep', component: card },
            ],
          },
          defaultAnswer: { option: 'keep' },
        };
      });
  },
  apply({ g, table }, by, _decision, answer) {
    if ('option' in answer && answer.option === 'swap') {
      const [card] = table.items(`hand:${by}`);
      table.move(card!.id, 'deck');
      table.shuffle('deck');
      table.draw('deck', `hand:${by}`);
    }
    g.done.push(by as string);
  },
  view(s, viewer) {
    return { hands: s.seats.map((seat) => viewZone(s, `hand:${seat}`, viewer)), deck: viewZone(s, 'deck', viewer) };
  },
  outcome(s) {
    return s.g.done.length === s.seats.length ? { results: {} } : null;
  },
};

function newMatch(): MatchState<G> {
  return createMatch(swapGame, { seats: ['s1', 's2'], options: {}, seed: SEED });
}

describe('match', () => {
  it('shows each seat only its own card, and never real ids', () => {
    const s = newMatch();
    const v1 = swapGame.view(s, { kind: 'seat', seat: 's1' }) as { hands: { cards: { def?: string }[] }[] };
    expect(v1.hands[0]!.cards[0]!.def).toBeDefined();
    expect(v1.hands[1]!.cards[0]!.def).toBeUndefined();
    for (const viewer of [{ kind: 'seat', seat: 's1' }, { kind: 'seat', seat: 's2' }, { kind: 'public' }] as const) {
      const message = { view: swapGame.view(s, viewer), decisions: viewer.kind === 'seat' ? decisionsFor(swapGame, s, viewer.seat) : [] };
      expect(findLeaks(message, secretsFor(s, viewer))).toEqual([]);
    }
  });

  it('sends prompts with refs, not ids, and changes refs when a card moves', () => {
    const s = newMatch();
    const [d] = decisionsFor(swapGame, s, 's1');
    expect(d!.prompt.kind).toBe('pick');
    const ref = d!.prompt.kind === 'pick' ? d!.prompt.options[0]!.component : '';
    expect(ref).toMatch(/^r/);
    const r = submit(swapGame, s, 's1', { decision: 'swap:s1', answer: { option: 'swap' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.values(r.state.refs)).not.toContain(ref);
  });

  it('rejects closed decisions, other seats and bad options without changing state', () => {
    const s = newMatch();
    const before = structuredClone(s);
    expect(submit(swapGame, s, 's2', { decision: 'swap:s1', answer: { option: 'swap' } }).ok).toBe(false);
    expect(submit(swapGame, s, 's1', { decision: 'swap:s1', answer: { option: 'nope' } }).ok).toBe(false);
    expect(submit(swapGame, s, 's1', { decision: 'gone', answer: { option: 'swap' } }).ok).toBe(false);
    expect(s).toEqual(before);
  });

  it('plays the default answer for an absent seat', () => {
    const r = autoAnswer(swapGame, newMatch(), 'swap:s2');
    expect(r.ok && r.entry).toEqual({ by: 's2', decision: 'swap:s2', answer: { option: 'keep' }, auto: true });
  });

  it('replays a log to the same state', () => {
    let s = newMatch();
    const log: LogEntry[] = [];
    for (const [seat, option] of [['s1', 'swap'], ['s2', 'keep']] as const) {
      const r = submit(swapGame, s, seat, { decision: `swap:${seat}`, answer: { option } });
      if (!r.ok) throw new Error(r.error);
      log.push(r.entry);
      s = r.state;
    }
    expect(replay(swapGame, headerOf(s), log)).toEqual(s);
  });
});
