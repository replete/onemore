// Messages between the room server and clients (architecture §1, protocol sketch).
// Carried as Colyseus room messages; imported by the client as types only.

import type { Answer, GameMeta, SeatDecision, SeatId } from '@onemore/engine';

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
}

/** Sent to each client after every change to the game. */
export interface ViewMessage<V = unknown> {
  rev: number;
  view: V;
  /** Only the decisions waiting on this client's seat. */
  decisions: SeatDecision[];
  /** Absent players the game is waiting on, and when their grace period ends (server time, ms). */
  waiting: { seat: SeatId; until: number }[];
  serverTime: number;
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
  | { type: 'skip'; seat: SeatId };

export interface ErrorMessage {
  message: string;
}
