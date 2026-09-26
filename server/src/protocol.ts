// Messages between the room server and clients (architecture §1, protocol sketch).
// Carried as Colyseus room messages; imported by the client as types only.

import type { Answer, GameEvent, GameMeta, SeatDecision, SeatId } from '@onemore/engine';

export type Role = 'player' | 'screen';
export type Phase = 'lobby' | 'playing';

export interface JoinOptions {
  name?: string;
  /** From the admin QR code (D-020). */
  adminCode?: string;
}

export interface ParticipantInfo {
  id: string;
  name: string;
  role: Role;
  admin: boolean;
  seat?: SeatId;
  connected: boolean;
  /** Screens only: the layout an admin chose for this screen (D-020). */
  layout?: string;
  /** Asking to take over this participant's seat ("Are you Sam?", D-026). */
  claiming?: string;
}

/** A request to take over a disconnected player's seat, shown to admins (D-026). */
export interface Claim {
  from: string;
  fromName: string;
  target: string;
  targetName: string;
}

/** Sent to each client whenever the room itself changes. */
export interface RoomMessage {
  code: string;
  phase: Phase;
  /** The chosen game's id. */
  game: string;
  /** Every game this server offers, for the lobby's picker. */
  games: GameMeta[];
  /** The chosen game's option values. */
  options: Record<string, boolean>;
  you: ParticipantInfo;
  participants: ParticipantInfo[];
  /** Only for admins and screens, and only before the game starts (D-020). */
  adminCode?: string;
  /** Only for admins: pending requests to take over a seat. */
  claims?: Claim[];
}

/** Sent to each client after every change to the game. */
export interface ViewMessage<V = unknown> {
  rev: number;
  view: V;
  /** Only the decisions waiting on this client's seat. */
  decisions: SeatDecision[];
  /** What just happened, filtered for this client. Empty on refreshes, so nothing is announced twice. */
  events: GameEvent[];
  /** Absent players the game is waiting on, and when their grace period ends (server time, ms). */
  waiting: { seat: SeatId; until: number }[];
  serverTime: number;
}

/** Clock sync (D-033): the client sends its own timestamp; the server echoes it with its time. */
export interface PingMessage {
  t: number;
}
export interface PongMessage {
  t: number;
  server: number;
}

export interface ActMessage {
  decision: string;
  answer: Answer;
}

export type AdminCommand =
  | { type: 'start' }
  | { type: 'new-game' }
  | { type: 'set-game'; game: string }
  | { type: 'set-option'; option: string; value: boolean }
  | { type: 'make-screen'; participant?: string }
  | { type: 'make-player'; participant: string }
  | { type: 'make-admin'; participant: string }
  | { type: 'remove'; participant: string }
  | { type: 'skip'; seat: SeatId }
  | { type: 'approve-claim'; participant: string }
  | { type: 'deny-claim'; participant: string }
  /** Sets the layout of one screen, or of every screen if no participant is given. */
  | { type: 'screen-layout'; layout: string; participant?: string };

export interface ErrorMessage {
  message: string;
}
