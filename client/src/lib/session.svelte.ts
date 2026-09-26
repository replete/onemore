// The connection to a room (D-025, D-026): join, reconnect, and the latest messages.
// Phones drop connections constantly, so we reconnect the moment the page is
// visible again rather than waiting for the socket to notice (research 03).

import { Client, type Room } from '@colyseus/sdk';
import type { Answer } from '@onemore/engine';
import type { AdminCommand, JoinOptions, PongMessage, RoomMessage, ViewMessage } from '@onemore/server/protocol';
import { ClockSync } from './clock';

// In development the game server runs beside Vite on :5551; in production it serves this page itself.
const endpoint =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? `${location.protocol}//${location.hostname}:5551` : location.origin);
const tokenKey = (code: string) => `onemore:token:${code}`;
const HEARTBEAT_MS = 15_000; // D-033: re-sync every 15–30 s; doubles as the heartbeat (D-026)
const DEAD_AFTER_MS = 6_000; // no pong this long after a ping: treat the connection as dead

export type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'lost';

export class Session {
  room = $state<RoomMessage | null>(null);
  view = $state<ViewMessage | null>(null);
  error = $state<string | null>(null);
  status = $state<Status>('idle');
  /** Server time minus Date.now(), from clock sync (D-033). */
  clockOffset = $state(0);
  /** Best round trip to the server, in ms. */
  rtt = $state<number | null>(null);

  private readonly client = new Client(endpoint);
  private conn: Room | null = null;
  private code: string | null = null;
  private readonly clock = new ClockSync();
  private pending = new Map<number, number>(); // ping t -> performance.now() when sent
  private heartbeat: ReturnType<typeof setInterval> | undefined;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.recover();
        this.syncClock(4);
      }
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

  /** "Are you Sam?": ask to take over a disconnected player's seat (D-026). */
  claim(participant: string): void {
    this.error = null;
    this.conn?.send('claim', { participant });
  }

  private attach(room: Room): void {
    this.conn = room;
    this.code = room.roomId;
    this.status = 'connected';
    saveToken(room.roomId, room.reconnectionToken);
    this.clock.reset();
    this.pending.clear();
    this.syncClock(8);
    this.startHeartbeat();

    room.onMessage('room', (message: RoomMessage) => {
      this.room = message;
    });
    room.onMessage('view', (message: ViewMessage) => {
      this.view = message;
      if (this.clock.offset === null) this.clockOffset = message.serverTime - Date.now(); // until pings answer
    });
    room.onMessage('pong', (message: PongMessage) => {
      const sentAt = this.pending.get(message.t);
      if (sentAt === undefined) return;
      this.pending.delete(message.t);
      this.clock.add(sentAt, performance.now(), message.server);
      this.clockOffset = this.clock.offset ?? this.clockOffset;
      this.rtt = this.clock.rtt;
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
      this.syncClock(8);
    });
    room.onLeave((code) => {
      if (this.conn !== room) return;
      // 4000 = we chose to leave; anything else means the connection is gone for now.
      this.status = code === 4000 ? 'idle' : 'lost';
      if (code === 4001 || code === 4000) forgetToken(room.roomId);
    });
  }

  /** Sends `count` pings about 100 ms apart (D-033). */
  private syncClock(count: number): void {
    for (let i = 0; i < count; i++) setTimeout(() => this.ping(), i * 100);
  }

  private ping(): void {
    if (!this.conn || this.status !== 'connected') return;
    const t = performance.now();
    this.pending.set(t, t);
    this.conn.send('ping', { t });
  }

  /**
   * Every 15 s: ping, and if nothing comes back within 6 s while the page is visible,
   * assume the socket has quietly died and close it so the SDK reconnects (research 03).
   */
  private startHeartbeat(): void {
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      if (document.visibilityState !== 'visible' || this.status !== 'connected') return;
      const oldest = Math.min(...this.pending.values());
      if (this.pending.size > 0 && performance.now() - oldest > DEAD_AFTER_MS) {
        this.pending.clear();
        (this.conn?.connection as unknown as { close?: (code?: number) => void })?.close?.(4999);
        return;
      }
      this.ping();
    }, HEARTBEAT_MS);
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
