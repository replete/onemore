// The games a room can play. Each game package exports its rules module and its
// lobby metadata (name, player range, options).

import type { GameMeta, GameModule } from '@onemore/engine';
import { carcassEon, meta as carcassMeta } from '@onemore/carcass-eon';
import { twentyOne, meta as twentyOneMeta } from '@onemore/twenty-one';

export interface GameEntry {
  meta: GameMeta;
  module: GameModule<unknown>;
}

export const GAMES: Record<string, GameEntry> = {
  [twentyOneMeta.id]: { meta: twentyOneMeta, module: twentyOne as GameModule<unknown> },
  [carcassMeta.id]: { meta: carcassMeta, module: carcassEon as GameModule<unknown> },
};

export const DEFAULT_GAME = twentyOneMeta.id;

export function defaultOptions(meta: GameMeta): Record<string, boolean> {
  return Object.fromEntries(meta.options.map((o) => [o.id, o.default]));
}
