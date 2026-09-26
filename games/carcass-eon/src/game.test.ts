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
import { FOLLOWERS, carcassEon, type CarcassState, type CarcassView } from './game';
import { tileDef } from './tiles';

type S = MatchState<CarcassState>;

function expectNoLeaks(s: S): void {
  const viewers: Viewer[] = [{ kind: 'public' }, ...s.seats.map((seat) => ({ kind: 'seat' as const, seat }))];
  for (const viewer of viewers) {
    const message = (state: S) => ({
      view: carcassEon.view(state, viewer),
      decisions: viewer.kind === 'seat' ? decisionsFor(carcassEon, state, viewer.seat) : [],
    });
    expect(findLeaks(message(s), secretsFor(s as MatchState<unknown>, viewer))).toEqual([]);
    expect(message(withHiddenShuffled(s, viewer))).toEqual(message(s));
  }
}

function expectInvariants(s: S): void {
  const v = carcassEon.view(s, { kind: 'public' }) as CarcassView;
  expect(v.board.length + v.discarded.length + v.bag + (v.current ? 1 : 0)).toBe(72);
  for (const seat of s.seats) {
    expect(v.supply[seat]! + v.followers.filter((f) => f.seat === seat).length).toBe(FOLLOWERS);
  }
}

/** Test helper: make `def` the tile in hand by swapping it with the one drawn. */
function forceCurrent(s: S, def: string): S {
  const next = structuredClone(s);
  const bag = next.table.zones['bag']!;
  const current = next.table.zones['current']!;
  const wanted = bag.items.find((id) => next.table.components[id]!.def === def)!;
  bag.items.splice(bag.items.indexOf(wanted), 1, ...current.items);
  current.items = [wanted];
  next.g.current = wanted;
  return next;
}

function act(s: S, seat: string, answer: { site: string } | { option: string }): S {
  const [d] = decisionsFor(carcassEon, s, seat);
  const r = submit(carcassEon, s, seat, { decision: d!.id, answer });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('carcass eon', () => {
  it.each([2, 3, 5])('plays random %i-player games to the end without leaks, and replays them', (players) => {
    for (let game = 0; game < 4; game++) {
      const seats = Array.from({ length: players }, (_, i) => `s${i + 1}`);
      const picker = new Rng(newRngState(newSeed()));
      let s = createMatch(carcassEon, { seats, options: {}, seed: newSeed() });
      const log: LogEntry[] = [];
      expectNoLeaks(s);

      for (let step = 0; s.g.phase !== 'done'; step++) {
        expect(step).toBeLessThan(400);
        const seat = s.seats[s.g.turn]!;
        const [d] = decisionsFor(carcassEon, s, seat);
        const prompt = d!.prompt;
        const answer =
          prompt.kind === 'place'
            ? { site: prompt.sites[picker.int('pick', prompt.sites.length)]! }
            : prompt.kind === 'choose'
              ? { option: prompt.options[picker.int('pick', prompt.options.length)]!.id }
              : (() => {
                  throw new Error('unexpected prompt');
                })();
        const r = submit(carcassEon, s, seat, { decision: d!.id, answer });
        if (!r.ok) throw new Error(r.error);
        log.push(r.entry);
        s = r.state;
        expectInvariants(s);
        if (step % 10 === 0) expectNoLeaks(s);
      }

      expect(s.table.zones['bag']!.items).toHaveLength(0);
      expect(Object.values(s.g.scores).every((n) => n >= 0)).toBe(true);
      expect(s.g.followers.length).toBeGreaterThanOrEqual(0);
      expect(replay(carcassEon, headerOf(s), log)).toEqual(s);
    }
  });

  it('scores a completed city at once and returns the follower', () => {
    let s = createMatch(carcassEon, { seats: ['s1', 's2'], options: {}, seed: 'a'.repeat(64) });
    s = forceCurrent(s, 'city-1');
    s = act(s, 's1', { site: '0,-1,2' }); // city faces south onto the start tile's city: completes it
    const [follow] = decisionsFor(carcassEon, s, 's1');
    expect(follow!.prompt.kind).toBe('choose');
    const cityOption = follow!.prompt.kind === 'choose' ? follow!.prompt.options.find((o) => o.label === 'City')! : undefined;
    s = act(s, 's1', { option: cityOption!.id });
    expect(s.g.scores['s1']).toBe(4);
    expect(s.g.supply['s1']).toBe(FOLLOWERS);
    expect(s.g.turn).toBe(1);
  });

  it('offers fields only when Farmers is on', () => {
    const labels = (farmers: boolean) => {
      let s = createMatch(carcassEon, { seats: ['s1', 's2'], options: { farmers }, seed: 'b'.repeat(64) });
      s = forceCurrent(s, 'road-straight');
      s = act(s, 's1', { site: '1,0,1' });
      const [d] = decisionsFor(carcassEon, s, 's1');
      return d!.prompt.kind === 'choose' ? d!.prompt.options.map((o) => o.label) : [];
    };
    expect(labels(true)).toContain('Field (farmer)');
    expect(labels(false)).not.toContain('Field (farmer)');
  });

  it('plays for an absent player: first legal spot, no follower', () => {
    let s = createMatch(carcassEon, { seats: ['s1', 's2'], options: {}, seed: 'c'.repeat(64) });
    const place = carcassEon.decisions(s)[0]!;
    const r = autoAnswer(carcassEon, s, place.id);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    if (s.g.phase === 'follow') {
      const r2 = autoAnswer(carcassEon, s, carcassEon.decisions(s)[0]!.id);
      if (!r2.ok) throw new Error(r2.error);
      s = r2.state;
    }
    expect(s.g.turn).toBe(1);
    expect(s.g.followers).toEqual([]);
  });

  it('never offers a feature someone already holds', () => {
    let s = createMatch(carcassEon, { seats: ['s1', 's2'], options: {}, seed: 'd'.repeat(64) });
    // s1 claims the start tile's road by extending it east.
    s = forceCurrent(s, 'road-straight');
    s = act(s, 's1', { site: '1,0,1' });
    const roadIndex = tileDef('road-straight').features.findIndex((f) => f.kind === 'road');
    s = act(s, 's1', { option: `f${roadIndex}` });
    // s2 extends the same road west: the road option must not be offered.
    s = forceCurrent(s, 'road-straight');
    s = act(s, 's2', { site: '-1,0,1' });
    const [d] = decisionsFor(carcassEon, s, 's2');
    const labels = d!.prompt.kind === 'choose' ? d!.prompt.options.map((o) => o.label) : [];
    expect(labels).not.toContain('Road');
  });
});
