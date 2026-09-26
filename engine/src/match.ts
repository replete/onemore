// The engine contract (architecture §3.1) and the functions the room layer calls.
//
// Rules mutate a draft: the engine clones the state before every setup/apply, so
// from the outside every step is pure and deterministic (D-007).

import { Rng, newRngState } from './rng';
import { Table } from './table';
import type {
  Answer,
  GameEvent,
  LogEntry,
  MatchHeader,
  MatchState,
  Outcome,
  PendingDecision,
  Prompt,
  SeatDecision,
  SeatId,
  Submission,
  Viewer,
} from './types';

export interface SetupContext {
  readonly seats: readonly SeatId[];
  readonly options: Readonly<Record<string, unknown>>;
  readonly table: Table;
  readonly rng: Rng;
}

export interface ApplyContext<G> extends SetupContext {
  /** The game's own state, on the draft. Mutate it. */
  readonly g: G;
  readonly state: MatchState<G>;
  /** True when the room layer played this on the seat's behalf (absence or timeout). */
  readonly auto: boolean;
}

export interface GameModule<G> {
  id: string;
  version: string;
  setup(ctx: SetupContext): G;
  /** Who must decide what, right now. Derived from the state; ids must be deterministic. */
  decisions(state: MatchState<G>): PendingDecision[];
  /** Applies a validated answer by mutating the draft in `ctx`. */
  apply(ctx: ApplyContext<G>, by: SeatId | 'system', decision: PendingDecision, answer: Answer): GameEvent[] | void;
  view(state: MatchState<G>, viewer: Viewer): unknown;
  outcome(state: MatchState<G>): Outcome | null;
}

export type SubmitResult<G> =
  | { ok: true; state: MatchState<G>; events: GameEvent[]; entry: LogEntry }
  | { ok: false; error: string };

export function createMatch<G>(game: GameModule<G>, header: Omit<MatchHeader, 'gameId' | 'version'>): MatchState<G> {
  const state: MatchState<G> = {
    game: { id: game.id, version: game.version },
    seats: [...header.seats],
    options: structuredClone(header.options),
    g: undefined as G,
    table: { components: {}, zones: {} },
    refs: {},
    rng: newRngState(header.seed),
    rev: 0,
  };
  const rng = new Rng(state.rng);
  const table = new Table(state as MatchState<unknown>, rng);
  state.g = game.setup({ seats: state.seats, options: state.options, table, rng });
  return state;
}

export function headerOf(state: MatchState<unknown>): MatchHeader {
  return {
    gameId: state.game.id,
    version: state.game.version,
    seats: [...state.seats],
    options: structuredClone(state.options),
    seed: state.rng.seed, // the seed never changes; streams only record how much was drawn
  };
}

/** The decisions waiting on `seat`, as that seat may receive them: refs instead of ids, no defaults. */
export function decisionsFor<G>(game: GameModule<G>, state: MatchState<G>, seat: SeatId): SeatDecision[] {
  return game
    .decisions(state)
    .filter((d) => d.seats.includes(seat))
    .map((d) => {
      const out: SeatDecision = { id: d.id, mode: d.mode, blocking: d.blocking, prompt: toWire(state, d.prompt) };
      if (d.timerMs !== undefined) out.timerMs = d.timerMs;
      return out;
    });
}

/** Validates a submission from a client (refs on the wire) and applies it. Never mutates `state`. */
export function submit<G>(
  game: GameModule<G>,
  state: MatchState<G>,
  by: SeatId,
  submission: Submission,
): SubmitResult<G> {
  const decision = game.decisions(state).find((d) => d.id === submission.decision);
  if (!decision) return { ok: false, error: 'That decision is no longer open.' };
  if (!decision.seats.includes(by)) return { ok: false, error: 'That decision is not yours to make.' };
  const answer = fromWire(state, decision.prompt, submission.answer);
  if (typeof answer === 'string') return { ok: false, error: answer };
  return applyAnswer(game, state, { by, decision: decision.id, answer });
}

/**
 * Plays a decision's default answer on a seat's behalf (absence or timeout, D-026).
 * With several seats (an `any` decision), the answer is applied by 'system'.
 */
export function autoAnswer<G>(game: GameModule<G>, state: MatchState<G>, decisionId: string): SubmitResult<G> {
  const decision = game.decisions(state).find((d) => d.id === decisionId);
  if (!decision) return { ok: false, error: 'That decision is no longer open.' };
  if (!decision.defaultAnswer) return { ok: false, error: 'That decision has no default answer.' };
  const by = decision.seats.length === 1 ? decision.seats[0]! : 'system';
  return applyAnswer(game, state, { by, decision: decision.id, answer: decision.defaultAnswer, auto: true });
}

/** Applies an internal log entry (real ids). Used by submit, autoAnswer and replay. */
export function applyAnswer<G>(game: GameModule<G>, state: MatchState<G>, entry: LogEntry): SubmitResult<G> {
  const decision = game.decisions(state).find((d) => d.id === entry.decision);
  if (!decision) return { ok: false, error: `decision not open: ${entry.decision}` };
  const problem = checkAnswer(decision.prompt, entry.answer);
  if (problem) return { ok: false, error: problem };

  const draft = structuredClone(state);
  const rng = new Rng(draft.rng);
  const table = new Table(draft as MatchState<unknown>, rng);
  const ctx: ApplyContext<G> = {
    seats: draft.seats,
    options: draft.options,
    table,
    rng,
    g: draft.g,
    state: draft,
    auto: entry.auto === true,
  };
  const events = game.apply(ctx, entry.by, decision, entry.answer) ?? [];
  draft.rev += 1;
  return { ok: true, state: draft, events, entry };
}

export function viewFor<G>(game: GameModule<G>, state: MatchState<G>, viewer: Viewer): unknown {
  return game.view(state, viewer);
}

/** Rebuilds a match from its header and log (D-007). Throws if any entry no longer applies. */
export function replay<G>(game: GameModule<G>, header: MatchHeader, log: LogEntry[]): MatchState<G> {
  if (header.gameId !== game.id || header.version !== game.version) {
    throw new Error(`log is for ${header.gameId}@${header.version}, not ${game.id}@${game.version}`);
  }
  let state = createMatch(game, header);
  for (const [i, entry] of log.entries()) {
    const result = applyAnswer(game, state, entry);
    if (!result.ok) throw new Error(`replay failed at entry ${i}: ${result.error}`);
    state = result.state;
  }
  return state;
}

// --- Wire mapping: real ids never leave the engine -------------------------------

function refOf(state: MatchState<unknown>, id: string): string {
  const ref = state.refs[id];
  if (!ref) throw new Error(`no ref for ${id}`);
  return ref;
}

function toWire(state: MatchState<unknown>, prompt: Prompt): Prompt {
  switch (prompt.kind) {
    case 'choose':
      return structuredClone(prompt);
    case 'pick':
      return { ...prompt, options: prompt.options.map((o) => ({ ...o, component: refOf(state, o.component) })) };
    case 'pickN':
      return { ...prompt, from: prompt.from.map((id) => refOf(state, id)) };
    case 'place':
      return { ...prompt, component: refOf(state, prompt.component), sites: [...prompt.sites] };
  }
}

/** Converts a wire answer (refs) to an internal one (real ids), or returns an error message. */
function fromWire(state: MatchState<unknown>, prompt: Prompt, answer: Answer): Answer | string {
  if (prompt.kind === 'pickN') {
    if (!('components' in answer) || !Array.isArray(answer.components)) return 'Expected a set of cards.';
    const byRef = new Map(prompt.from.map((id) => [refOf(state, id), id]));
    const ids: string[] = [];
    for (const ref of answer.components) {
      const id = typeof ref === 'string' ? byRef.get(ref) : undefined;
      if (!id) return 'One of those cards is not a choice.';
      ids.push(id);
    }
    return { components: ids };
  }
  return answer;
}

/** Checks an internal answer against its prompt. Returns an error message, or undefined if valid. */
function checkAnswer(prompt: Prompt, answer: Answer): string | undefined {
  switch (prompt.kind) {
    case 'choose':
    case 'pick':
      if (!('option' in answer) || typeof answer.option !== 'string') return 'Expected an option.';
      if (!prompt.options.some((o) => o.id === answer.option)) return 'That option is not available.';
      return undefined;
    case 'pickN': {
      if (!('components' in answer) || !Array.isArray(answer.components)) return 'Expected a set of cards.';
      const set = new Set(answer.components);
      if (set.size !== answer.components.length) return 'The same card was chosen twice.';
      if (set.size < prompt.min || set.size > prompt.max) return `Choose between ${prompt.min} and ${prompt.max}.`;
      if (![...set].every((id) => prompt.from.includes(id))) return 'One of those cards is not a choice.';
      return undefined;
    }
    case 'place':
      if (!('site' in answer) || typeof answer.site !== 'string') return 'Expected a place.';
      if (!prompt.sites.includes(answer.site)) return 'That place is not available.';
      return undefined;
  }
}
