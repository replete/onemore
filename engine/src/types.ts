// Core types shared by the engine, rules modules, the server and the client.
// Everything here is plain JSON data (architecture §3.1).

export type SeatId = string;

/** Who a view is for: one seat, or the public view shown to screens and spectators. */
export type Viewer = { kind: 'seat'; seat: SeatId } | { kind: 'public' };

export type Visibility = 'public' | 'owner' | 'hidden' | 'count' | 'top';

// --- Prompts (D-018) ---------------------------------------------------------

export interface ChooseOption {
  id: string;
  label: string;
}

export interface PickOption {
  id: string;
  /** Real component id inside the engine; replaced by an opaque ref before it leaves the server. */
  component: string;
  /** Optional target, e.g. a zone id the component would go to. */
  target?: string;
  label?: string;
}

export type Prompt =
  | { kind: 'choose'; options: ChooseOption[] }
  | { kind: 'pick'; options: PickOption[] }
  | { kind: 'pickN'; from: string[]; min: number; max: number; hint?: string }
  | { kind: 'place'; component: string; sites: string[] };

export type Answer =
  | { option: string } // choose, pick
  | { components: string[] } // pickN (refs on the wire, real ids inside the engine)
  | { site: string }; // place

// --- Pending decisions (D-017, D-023) ------------------------------------------

export interface PendingDecision {
  /** Deterministic id derived from the state, so replays produce the same ids. */
  id: string;
  seats: SeatId[];
  /** one: a single seat decides; each: every seat answers; any: the first valid answer wins. */
  mode: 'one' | 'each' | 'any';
  /** false = play carries on around it (D-023). */
  blocking: boolean;
  prompt: Prompt;
  /** A duration, never a clock time (D-013). */
  timerMs?: number;
  /** Played when the timer runs out or the seat is absent (D-026). Never sent to clients. */
  defaultAnswer?: Answer;
}

/** A pending decision as one seat receives it: refs instead of ids, no default answer. */
export interface SeatDecision {
  id: string;
  mode: PendingDecision['mode'];
  blocking: boolean;
  prompt: Prompt;
  timerMs?: number;
}

export interface Submission {
  decision: string;
  answer: Answer;
}

// --- Table (components and zones) --------------------------------------------

export interface ComponentState {
  id: string;
  /** Definition id, e.g. "7H" for the seven of hearts. */
  def: string;
  /** Overrides the zone's visibility when set. */
  face?: 'up' | 'down';
  /** Seats that may see this component whatever its zone says (peeking, reveals). */
  knownTo?: SeatId[];
}

export interface ZoneState {
  id: string;
  owner?: SeatId;
  visibility: Visibility;
  /** Component ids, bottom to top. */
  items: string[];
}

export interface TableState {
  components: Record<string, ComponentState>;
  zones: Record<string, ZoneState>;
}

/** A card as a viewer sees it: always an opaque ref, plus its definition only if visible. */
export interface CardView {
  ref: string;
  def?: string;
}

export interface ZoneView {
  id: string;
  owner?: SeatId;
  count: number;
  /** Omitted for `count` zones: the viewer only learns how many there are. */
  cards?: CardView[];
}

// --- Randomness (D-024) --------------------------------------------------------

export interface RngState {
  /** 32 bytes as hex. Never leaves the server. */
  seed: string;
  /** 32-bit words consumed so far, per stream. */
  streams: Record<string, number>;
}

// --- Matches ---------------------------------------------------------------------

export interface MatchState<G> {
  game: { id: string; version: string };
  seats: SeatId[];
  options: Record<string, unknown>;
  g: G;
  table: TableState;
  /** Component id -> current opaque ref. Never leaves the server. */
  refs: Record<string, string>;
  rng: RngState;
  /** Number of actions applied so far. */
  rev: number;
}

export interface MatchHeader {
  gameId: string;
  version: string;
  seats: SeatId[];
  options: Record<string, unknown>;
  seed: string;
}

export interface LogEntry {
  by: SeatId | 'system';
  decision: string;
  answer: Answer;
  /** Played on the seat's behalf: absence or timeout (D-026). */
  auto?: boolean;
}

export type Outcome = { results: Record<SeatId, string> };

export type GameEvent = { type: string; [key: string]: unknown };
