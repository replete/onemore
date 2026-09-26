// End-to-end: a real server and real SDK clients over WebSockets.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import type { TwentyOneView } from '@onemore/twenty-one';
import type { RoomMessage, ViewMessage } from './protocol';

process.env['ONEMORE_GRACE_MS'] = '300';
process.env['ONEMORE_LOG_DIR'] = mkdtempSync(join(tmpdir(), 'onemore-logs-'));

const PORT = 20000 + Math.floor(Math.random() * 20000);
const URL = `http://localhost:${PORT}`;
let server: { gracefullyShutdown: (exit?: boolean) => Promise<void> };

beforeAll(async () => {
  const { createServer } = await import('./index');
  const s = createServer();
  await s.listen(PORT);
  server = s as unknown as typeof server;
});

afterAll(async () => {
  // Rooms outlive their players by design (D-026), so shutdown disposes them; ignore that noise.
  await server.gracefullyShutdown(false).catch(() => undefined);
});

/** A connected client that remembers the latest message of each type. */
class Tester {
  room!: Room;
  latest: { room?: RoomMessage; view?: ViewMessage<TwentyOneView>; error?: { message: string } } = {};
  private waiters: (() => void)[] = [];

  static async create(options: object = {}): Promise<Tester> {
    const t = new Tester();
    t.attach(await new Client(URL).create('table', options));
    await t.until(() => t.latest.room !== undefined);
    return t;
  }

  static async join(code: string, options: object = {}): Promise<Tester> {
    const t = new Tester();
    t.attach(await new Client(URL).joinById(code, options));
    await t.until(() => t.latest.room !== undefined);
    return t;
  }

  attach(room: Room): void {
    this.room = room;
    for (const type of ['room', 'view', 'error'] as const) {
      room.onMessage(type, (message: never) => {
        this.latest[type] = message;
        for (const w of this.waiters) w();
      });
    }
  }

  async until(check: () => boolean, ms = 2000, label = ''): Promise<void> {
    if (check()) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting ${label}`)), ms);
      this.waiters.push(() => {
        if (check()) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  get code(): string {
    return this.latest.room!.code;
  }
}

describe('table room', () => {
  it('creates a room with a Meet-style code and makes the creator admin', async () => {
    const tv = await Tester.create();
    expect(tv.code).toMatch(/^[bcdfghjkmnpqrstvwxz]{3}-[bcdfghjkmnpqrstvwxz]{3}-[bcdfghjkmnpqrstvwxz]{3}$/);
    expect(tv.latest.room!.you.admin).toBe(true);
    expect(tv.latest.room!.adminCode).toMatch(/^[0-9a-f]{32}$/);

    const phone = await Tester.join(tv.code, { name: 'Sam' });
    expect(phone.latest.room!.you.admin).toBe(false);
    expect(phone.latest.room!.adminCode).toBeUndefined();

    const admin = await Tester.join(tv.code, { name: 'Jo', adminCode: tv.latest.room!.adminCode });
    expect(admin.latest.room!.you.admin).toBe(true);
    await Promise.all([tv, phone, admin].map((t) => t.room.leave()));
  });

  it('plays a round: screens see the public view, each phone sees only its own decisions', async () => {
    const tv = await Tester.create();
    tv.room.send('admin', { type: 'make-screen' });
    await tv.until(() => tv.latest.room!.you.role === 'screen');
    const sam = await Tester.join(tv.code, { name: 'Sam' });
    const jo = await Tester.join(tv.code, { name: 'Jo' });

    tv.room.send('admin', { type: 'start' });
    await Promise.all([tv, sam, jo].map((t) => t.until(() => t.latest.view !== undefined)));
    expect(tv.latest.view!.decisions).toEqual([]);
    expect(tv.latest.view!.view.seats.map((s) => s.seat)).toEqual(['s1', 's2']);

    // Play until the round is over: whoever has a decision stands.
    for (let step = 0; step < 10 && tv.latest.view!.view.phase === 'playing'; step++) {
      const rev = tv.latest.view!.rev;
      await Promise.all([sam, jo].map((t) => t.until(() => t.latest.view!.rev === rev)));
      const view = tv.latest.view!.view;
      expect(view.dealer.cards[1]!.def).toBeUndefined(); // the face-down card stays hidden
      const mover = [sam, jo].find((t) => t.latest.view!.decisions.some((d) => d.blocking && d.mode === 'one'));
      const other = [sam, jo].find((t) => t !== mover);
      if (!mover) break;
      expect(other!.latest.view!.decisions).toEqual([]);
      mover.room.send('act', { decision: mover.latest.view!.decisions[0]!.id, answer: { option: 'stand' } });
      await tv.until(() => tv.latest.view!.rev > rev);
    }
    expect(tv.latest.view!.view.phase).toBe('done');
    expect(tv.latest.view!.view.dealer.cards.every((c) => c.def)).toBe(true);
    await Promise.all([tv, sam, jo].map((t) => t.room.leave()));
  });

  it('rejects a move out of turn', async () => {
    const tv = await Tester.create();
    tv.room.send('admin', { type: 'make-screen' });
    const sam = await Tester.join(tv.code, { name: 'Sam' });
    const jo = await Tester.join(tv.code, { name: 'Jo' });
    tv.room.send('admin', { type: 'start' });
    await sam.until(() => sam.latest.view !== undefined);
    await jo.until(() => jo.latest.view !== undefined);
    const idle = [sam, jo].find((t) => t.latest.view!.decisions.length === 0);
    if (idle) {
      idle.room.send('act', { decision: 'r1:s1:2', answer: { option: 'hit' } });
      await idle.until(() => idle.latest.error !== undefined);
      expect(idle.latest.error!.message).toMatch(/not yours|no longer open/);
    }
    await Promise.all([tv, sam, jo].map((t) => t.room.leave()));
  });

  it('stands for a player who drops, after the grace period, and gives them back their seat', async () => {
    const tv = await Tester.create();
    tv.room.send('admin', { type: 'make-screen' });
    await tv.until(() => tv.latest.room!.you.role === 'screen');
    const sam = await Tester.join(tv.code, { name: 'Sam' });
    tv.room.send('admin', { type: 'start' });
    await sam.until(() => sam.latest.view !== undefined);
    // If Sam is dealt 21 the round ends at once (only "Deal again" is open); deal until Sam has a turn.
    const hasTurn = () => sam.latest.view!.decisions.some((d) => d.mode === 'one');
    for (let i = 0; i < 20 && !hasTurn(); i++) {
      const rev = sam.latest.view!.rev;
      sam.room.send('act', { decision: sam.latest.view!.decisions[0]!.id, answer: { option: 'deal' } });
      await sam.until(() => sam.latest.view!.rev > rev);
    }
    expect(hasTurn()).toBe(true);

    const token = sam.room.reconnectionToken;
    sam.room.reconnection.enabled = false;
    (sam.room.connection as unknown as { close: (code: number) => void }).close(4999);

    // The screen shows that the game is waiting on Sam, then stands for them.
    await tv.until(() => (tv.latest.view?.waiting.length ?? 0) > 0, 2000, 'for waiting');
    expect(tv.latest.view!.waiting[0]!.seat).toBe('s1');
    await tv.until(() => tv.latest.view!.view.phase === 'done', 3000, 'for auto-stand');
    expect(tv.latest.view!.view.seats[0]!.status).toBe('stood');

    // Sam comes back to the same seat.
    const back = new Tester();
    back.attach(await new Client(URL).reconnect(token));
    await tv.until(() => tv.latest.room!.participants.find((p) => p.name === 'Sam')!.connected, 2000, 'for reconnect');
    expect(tv.latest.room!.participants.find((p) => p.name === 'Sam')!.seat).toBe('s1');
    await Promise.all([tv, back].map((t) => t.room.leave()));
  });
});

describe('match logs', () => {
  it('replay exactly, carry versions and sequence numbers, and contain no names', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { replay } = await import('@onemore/engine');
    const { twentyOne } = await import('@onemore/twenty-one');
    const dir = process.env['ONEMORE_LOG_DIR']!;

    const tv = await Tester.create();
    tv.room.send('admin', { type: 'make-screen' });
    await tv.until(() => tv.latest.room!.you.role === 'screen');
    const sam = await Tester.join(tv.code, { name: 'Samantha' });
    tv.room.send('admin', { type: 'start' });
    await sam.until(() => sam.latest.view !== undefined);
    for (let i = 0; i < 5 && sam.latest.view!.view.phase === 'playing'; i++) {
      const d = sam.latest.view!.decisions.find((x) => x.mode === 'one');
      if (!d) break;
      const rev = sam.latest.view!.rev;
      sam.room.send('act', { decision: d.id, answer: { option: 'hit' } });
      await sam.until(() => sam.latest.view!.rev > rev);
    }

    const file = readdirSync(dir).find((f) => f.startsWith(tv.code));
    const text = readFileSync(join(dir, file!), 'utf8');
    expect(text).not.toContain('Samantha');
    const lines = text.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.every((l) => l.v === 1)).toBe(true);
    const [header, ...actions] = lines;
    expect(actions.map((a) => a.seq)).toEqual(actions.map((_, i) => i + 1));
    const state = replay(twentyOne, header.header, actions.map(({ by, decision, answer, auto }) => ({ by, decision, answer, ...(auto ? { auto } : {}) })));
    expect(state.rev).toBe(actions.length);
    await Promise.all([tv, sam].map((t) => t.room.leave()));
  });
});
