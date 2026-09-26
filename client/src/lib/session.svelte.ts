// The connection to a room (D-025, D-026): join, reconnect, and the latest messages.
// Phones drop connections constantly, so we reconnect the moment the page is
// visible again rather than waiting for the socket to notice (research 03).

import { Client, type Room } from '@colyseus/sdk';
import type { Answer } from '@onemore/engine';
import type { AdminCommand, JoinOptions, RoomMessage, ViewMessage } from '@onemore/server/protocol';

const endpoint = import.meta.env.VITE_SERVER_URL ?? `${location.protocol}//${location.hostname}:5551`;
const tokenKey = (code: string) => `onemore:token:${code}`;

export type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'lost';

export class Session {
  room = $state<RoomMessage | null>(null);
  view = $state<ViewMessage | null>(null);
  error = $state<string | null>(null);
  status = $state<Status>('idle');
  /** Server time minus local time, from the latest view (for countdowns). */
  clockOffset = $state(0);

  private readonly client = new Client(endpoint);
  private conn: Room | null = null;
  private code: string | null = null;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.recover();
    });
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) void this.recover();
    });
    window.addEventListener('online', () => void this.recover());
  }

  async create(options: JoinOptions): Promise<string> {
    this.status = 'connecting';
    this.attach(await this.client.create('table', options));
    return this.conn!.roomId;
  }

  async join(code: string, options: JoinOptions): Promise<void> {
    this.status = 'connecting';
    try {
      this.attach(await this.client.joinById(code, options));
    } catch (err) {
      this.status = 'idle';
      throw err;
    }
  }

  /** Rejoins with the token saved for this room, if there is one. Returns false if we can't. */
  async resume(code: string): Promise<boolean> {
    const token = readToken(code);
    if (!token) return false;
    this.status = 'reconnecting';
    try {
      this.attach(await this.client.reconnect(token));
      return true;
    } catch {
      forgetToken(code);
      this.status = 'idle';
      return false;
    }
  }

  act(decision: string, answer: Answer): void {
    this.error = null;
    this.conn?.send('act', { decision, answer });
  }

  admin(command: AdminCommand): void {
    this.error = null;
    this.conn?.send('admin', command);
  }

  setName(name: string): void {
    this.conn?.send('name', { name });
  }

  private attach(room: Room): void {
    this.conn = room;
    this.code = room.roomId;
    this.status = 'connected';
    saveToken(room.roomId, room.reconnectionToken);

    room.onMessage('room', (message: RoomMessage) => {
      this.room = message;
    });
    room.onMessage('view', (message: ViewMessage) => {
      this.view = message;
      this.clockOffset = message.serverTime - Date.now();
    });
    room.onMessage('error', (message: { message: string }) => {
      this.error = message.message;
    });
    room.onDrop(() => {
      this.status = 'reconnecting';
    });
    room.onReconnect(() => {
      this.status = 'connected';
      saveToken(room.roomId, room.reconnectionToken);
    });
    room.onLeave((code) => {
      if (this.conn !== room) return;
      // 4000 = we chose to leave; anything else means the connection is gone for now.
      this.status = code === 4000 ? 'idle' : 'lost';
      if (code === 4001 || code === 4000) forgetToken(room.roomId);
    });
  }

  /** After the page comes back: if the connection was lost, rejoin our seat. */
  private async recover(): Promise<void> {
    if (this.status === 'lost' && this.code) await this.resume(this.code);
  }
}

function readToken(code: string): string | null {
  try {
    return localStorage.getItem(tokenKey(code));
  } catch {
    return null;
  }
}

function saveToken(code: string, token: string): void {
  try {
    localStorage.setItem(tokenKey(code), token);
  } catch {
    // Private browsing: rejoining will need "Are you Sam?" (not built yet).
  }
}

function forgetToken(code: string): void {
  try {
    localStorage.removeItem(tokenKey(code));
  } catch {
    // ignore
  }
}

/** Keeps the screen on while playing (research 03). Re-requested whenever the page is visible. */
export function keepAwake(): void {
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } };
  if (!nav.wakeLock) return;
  const request = () => nav.wakeLock!.request('screen').catch(() => undefined);
  void request();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void request();
  });
}
