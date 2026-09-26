// Leak checks (architecture §3.3): no message to a viewer may contain what that
// viewer shouldn't see. Use on every message type, not just views.

import { canSee } from './table';
import type { MatchState, Viewer } from './types';

/**
 * Strings that must never appear in a message to `viewer`:
 * the seed, every real component id, and the definition of every component hidden
 * from the viewer (when that definition is unique on the table).
 */
export function secretsFor(state: MatchState<unknown>, viewer: Viewer): string[] {
  const secrets = [state.rng.seed];
  const defCount = new Map<string, number>();
  for (const c of Object.values(state.table.components)) {
    secrets.push(JSON.stringify(c.id));
    defCount.set(c.def, (defCount.get(c.def) ?? 0) + 1);
  }
  for (const zone of Object.values(state.table.zones)) {
    zone.items.forEach((id, index) => {
      const def = state.table.components[id]!.def;
      if (!canSee(state, zone, index, viewer) && defCount.get(def) === 1) secrets.push(JSON.stringify(def));
    });
  }
  return secrets;
}

/** The secrets that appear in `message`. Empty means no leak. */
export function findLeaks(message: unknown, secrets: string[]): string[] {
  const text = JSON.stringify(message);
  return secrets.filter((s) => text.includes(s));
}

/**
 * A copy of `state` with the definitions of every component hidden from `viewer`
 * shuffled among themselves. A viewer's messages must be identical for both states:
 * anything that changes reveals hidden information, including derived leaks such as
 * a total that counts a face-down card. (It can't catch leaks cached in the game's
 * own state, only ones computed from the table.)
 */
export function withHiddenShuffled<S extends MatchState<unknown>>(state: S, viewer: Viewer, random: () => number = Math.random): S {
  const copy = structuredClone(state);
  const hidden: string[] = [];
  for (const zone of Object.values(copy.table.zones)) {
    zone.items.forEach((id, index) => {
      if (!canSee(copy, zone, index, viewer)) hidden.push(id);
    });
  }
  const defs = hidden.map((id) => copy.table.components[id]!.def);
  for (let i = defs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [defs[i], defs[j]] = [defs[j]!, defs[i]!];
  }
  hidden.forEach((id, i) => {
    copy.table.components[id]!.def = defs[i]!;
  });
  return copy;
}
