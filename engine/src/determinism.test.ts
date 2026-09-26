// Rules code must be deterministic (D-007, D-031): no ambient randomness or clocks.
// Seeds come from newSeed() in rng.ts, which is the one allowed exception.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const BANNED = /Math\.random|Date\.now|new Date\(|performance\.now|crypto\./;
const ALLOWED = new Set(['engine/src/rng.ts', 'engine/src/testing.ts']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

describe('determinism', () => {
  it('rules code never reads clocks or ambient randomness', () => {
    const files = [
      ...sources(join(ROOT, 'engine', 'src')),
      ...readdirSync(join(ROOT, 'games')).flatMap((g) => sources(join(ROOT, 'games', g, 'src'))),
    ];
    const offenders = files
      .map((f) => f.slice(ROOT.length + 1))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => BANNED.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
