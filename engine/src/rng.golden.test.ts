// Golden values and a uniformity check for the shuffle (research 04, D-031).
// If a golden test fails, the RNG changed: bump RNG_VERSION, because old logs won't replay.

import { describe, expect, it } from 'vitest';
import { RNG_VERSION, Rng, newRngState } from './rng';

const SEED = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

describe(`rng ${RNG_VERSION}`, () => {
  it('matches the golden outputs', () => {
    const rng = new Rng(newRngState(SEED));
    expect(Array.from({ length: 4 }, () => rng.u32('deck'))).toEqual(GOLDEN_U32);
    const deck = rng.shuffle('shuffle/r1', Array.from({ length: 52 }, (_, i) => i));
    expect(deck).toEqual(GOLDEN_DECK);
  });

  it('shuffles uniformly: every card equally likely in every position', () => {
    const N = 60_000;
    const counts = Array.from({ length: 52 }, () => new Array<number>(52).fill(0));
    const rng = new Rng(newRngState(SEED));
    const base = Array.from({ length: 52 }, (_, i) => i);
    for (let n = 0; n < N; n++) {
      rng.shuffle('uniform', [...base]).forEach((card, pos) => counts[card]![pos]!++);
    }
    const expected = N / 52;
    let chi2 = 0;
    for (const row of counts) for (const c of row) chi2 += (c - expected) ** 2 / expected;
    // (52-1)^2 = 2601 degrees of freedom: mean 2601, sd ≈ 72. Fixed seed, so not flaky.
    expect(chi2).toBeGreaterThan(2601 - 5 * 72);
    expect(chi2).toBeLessThan(2601 + 5 * 72);
  });
});

// Cross-checked against Node's OpenSSL ChaCha20 with an HMAC-SHA256-derived key.
const GOLDEN_U32 = [4165979436, 3460387355, 69804273, 3280850722];
const GOLDEN_DECK = [
  45, 30, 50, 1, 3, 33, 46, 31, 37, 2, 36, 22, 35, 34, 49, 16, 25, 43, 38, 9, 5, 32, 8, 14, 10, 4, 7, 20, 28, 26, 15, 51, 39, 44, 11,
  12, 18, 47, 48, 19, 40, 23, 0, 27, 24, 21, 42, 6, 41, 13, 17, 29,
];
