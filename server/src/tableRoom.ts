// One room = one table (D-025): Colyseus handles connections and reconnection; our
// engine computes every view. Colyseus state sync is not used (no schema state).

import { timingSafeEqual } from 'node:crypto';
import { Room, type Client, type Delayed, type Deferred } from 'colyseus';
import {
  autoAnswer,
  createMatch,
  decisionsFor,
  eventsFor,
  headerOf,
  newSeed,
  submit,
  type GameEvent,
  type GameModule,
  type MatchState,
  type SeatId,
  type SubmitResult,
  type Viewer,
} from '@onemore/engine';
import { generateCode, newSecret } from './codes';
import { DEFAULT_GAME, GAMES, defaultOptions } from './games';
import { FileMatchStore, type MatchRecorder, type MatchStore } from './matchLog';
import type {
  ActMessage,
  AdminCommand,
  JoinOptions,
  ParticipantInfo,
  Phase,
  Role,
  RoomMessage,
  ViewMessage,
} from './protocol';

export const GRACE_MS = Number(process.env['ONEMORE_GRACE_MS'] ?? 60_000); // D-026
const ADMIN_HANDOVER_MS = 2 * 60_000; // D-026
const EMPTY_ROOM_MS = 15 * 60_000; // D-026
const NAME_MAX = 16;

/** Codes of rooms alive in this process, to redraw on collision (D-027). */
const activeCodes = new Set<string>();
const store: MatchStore = new FileMatchStore();

interface Participant {
  id: string;
  name: string;
  role: Role;
  admin: boolean;
  seat?: SeatId;
  connected: boolean;
  /** When the current connection started; the longest-connected player inherits admin. */
  connectedSince: number;
  /** Set once a grace period has run out: later decisions are played straight away (D-026). */
  autoplay: boolean;
  joinOrder: number;
  reconnection?: Deferred<Client>;
  layout?: string;
  /** Id of the disconnected participant whose seat this one is asking for. */
  claiming?: string;
}

type Game = GameModule<unknown>;

export class TableRoom extends Room {
  override maxClients = 24;
  override maxMessagesPerSecond = 20;
  override autoDispose = false;

  /** The game chosen in the lobby, and its options (D-020). */
  private gameId = DEFAULT_GAME;
  private options: Record<string, boolean> = defaultOptions(GAMES[DEFAULT_GAME]!.meta);
  /** The rules module of the match in play; fixed when the game starts. */
  private game: Game = GAMES[DEFAULT_GAME]!.module;
  private readonly adminCode = newSecret();
  private code = '';
  private phase: Phase = 'lobby';
  private readonly participants = new Map<string, Participant>();
  private joinCounter = 0;
  private match: MatchState<unknown> | undefined;
  private log: MatchRecorder | undefined;
  /** Grace timers for absent players, keyed by `${decision}|${seat}`. */
  private readonly grace = new Map<string, { timer: Delayed; until: number }>();
  private emptyTimer: Delayed | undefined;
  /** Events from the actions applied since views were last sent. */
  private pendingEvents: GameEvent[] = [];
  private noAdminSince: number | undefined;

  override onCreate(): void {
    this.code = generateCode((code) => activeCodes.has(code));
    activeCodes.add(this.code);
    this.roomId = this.code;

    // Clock sync and heartbeat (D-033): answer at once with the server's time.
    this.onMessage('ping', (client, message: unknown) => {
      const t = (message as { t?: unknown })?.t;
      if (typeof t === 'number') client.send('pong', { t, server: Date.now() });
    });
    this.onMessage('act', (client, message: unknown) => this.onAct(client, message));
    this.onMessage('admin', (client, message: unknown) => this.onAdmin(client, message));
    this.onMessage('name', (client, message: unknown) => this.onName(client, message));
    this.onMessage('claim', (client, message: unknown) => this.onClaim(client, message));
    this.clock.setInterval(() => this.checkAdmins(), 10_000);
    this.checkEmpty(); // a room nobody ever joins still gets cleaned up
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    const first = this.participants.size === 0;
    this.participants.set(client.sessionId, {
      id: client.sessionId,
      name: cleanName(options?.name),
      role: 'player',
      admin: first || this.isAdminCode(options?.adminCode),
      connected: true,
      connectedSince: Date.now(),
      autoplay: false,
      joinOrder: this.joinCounter++,
    });
    this.refreshAll();
  }

  override onDrop(client: Client): void {
    const p = this.participants.get(client.sessionId);
    if (!p) return;
    p.connected = false;
    // Seats are held for the whole game (D-026); we release them ourselves.
    p.reconnection = this.allowReconnection(client, 'manual');
    this.refreshAll();
  }

  override onReconnect(client: Client): void {
    const p = this.participants.get(client.sessionId);
    if (!p) return;
    p.connected = true;
    p.connectedSince = Date.now();
    p.autoplay = false;
    delete p.reconnection;
    this.refreshAll();
  }

  override onLeave(client: Client): void {
    const p = this.participants.get(client.sessionId);
    if (!p) return;
    if (this.phase === 'lobby' || !p.seat) {
      this.participants.delete(p.id);
    } else {
      // Left for good mid-game: keep the seat, play it automatically (D-026).
      p.connected = false;
      p.autoplay = true;
    }
    this.refreshAll();
  }

  override onDispose(): void {
    activeCodes.delete(this.code);
    for (const g of this.grace.values()) g.timer.clear();
  }

  // --- Messages ------------------------------------------------------------------

  private onAct(client: Client, message: unknown): void {
    const p = this.participants.get(client.sessionId);
    if (!isAct(message)) return this.fail(client, 'Malformed move.');
    if (this.phase !== 'playing' || !this.match || !p?.seat) return this.fail(client, 'You are not playing.');
    this.commit(submit(this.game, this.match, p.seat, message), client);
  }

  private onAdmin(client: Client, message: unknown): void {
    const p = this.participants.get(client.sessionId);
    if (!p?.admin) return this.fail(client, 'Only admins can do that.');
    const cmd = message as AdminCommand;
    const target = (id: string | undefined) => this.participants.get(id ?? p.id);

    switch (cmd?.type) {
      case 'start':
        return this.start(client);
      case 'set-game': {
        if (this.phase !== 'lobby') return this.fail(client, 'Finish this game first.');
        const entry = GAMES[(cmd as { game?: string }).game ?? ''];
        if (!entry) return this.fail(client, 'No such game.');
        this.gameId = entry.meta.id;
        this.options = defaultOptions(entry.meta);
        return this.refreshAll();
      }
      case 'set-option': {
        if (this.phase !== 'lobby') return this.fail(client, 'Finish this game first.');
        const option = GAMES[this.gameId]!.meta.options.find((o) => o.id === cmd.option);
        if (!option || typeof cmd.value !== 'boolean') return this.fail(client, 'No such option.');
        this.options[option.id] = cmd.value;
        return this.refreshAll();
      }
      case 'new-game':
        this.phase = 'lobby';
        this.match = undefined;
        this.log = undefined;
        for (const q of this.participants.values()) delete q.seat;
        return this.refreshAll();
      case 'make-screen': {
        const t = target(cmd.participant);
        if (!t) return this.fail(client, 'No such participant.');
        if (t.seat && this.phase === 'playing') return this.fail(client, 'Seated players can’t become screens mid-game.');
        t.role = 'screen';
        return this.refreshAll();
      }
      case 'make-player': {
        const t = target(cmd.participant);
        if (!t) return this.fail(client, 'No such participant.');
        t.role = 'player';
        return this.refreshAll();
      }
      case 'make-admin': {
        const t = target(cmd.participant);
        if (!t) return this.fail(client, 'No such participant.');
        t.admin = true;
        return this.refreshAll();
      }
      case 'remove': {
        const t = target(cmd.participant);
        if (!t || t.id === p.id) return this.fail(client, 'No such participant.');
        t.reconnection?.reject();
        this.clients.find((c) => c.sessionId === t.id)?.leave(4001);
        if (t.seat && this.phase === 'playing') {
          t.connected = false;
          t.autoplay = true;
        } else {
          this.participants.delete(t.id);
        }
        return this.refreshAll();
      }
      case 'screen-layout': {
        const layouts = GAMES[this.gameId]!.meta.layouts ?? [];
        if (!layouts.some((l) => l.id === cmd.layout)) return this.fail(client, 'No such layout.');
        const screens = [...this.participants.values()].filter(
          (q) => q.role === 'screen' && (!cmd.participant || q.id === cmd.participant),
        );
        for (const q of screens) q.layout = cmd.layout;
        return this.refreshAll();
      }
      case 'approve-claim':
      case 'deny-claim': {
        const from = this.participants.get(cmd.participant);
        const target = from?.claiming ? this.participants.get(from.claiming) : undefined;
        if (!from || !target) return this.fail(client, 'That request has gone.');
        delete from.claiming;
        if (cmd.type === 'approve-claim') {
          if (target.connected) return this.fail(client, `${target.name} is connected again.`);
          this.transferSeat(target, from);
        }
        return this.refreshAll();
      }
      case 'skip': {
        if (!this.match) return;
        const decision = this.game.decisions(this.match).find((d) => d.seats.length === 1 && d.seats[0] === cmd.seat);
        if (!decision) return this.fail(client, 'Nothing to skip.');
        return this.commit(autoAnswer(this.game, this.match, decision.id), client);
      }
      default:
        return this.fail(client, 'Unknown command.');
    }
  }

  private onName(client: Client, message: unknown): void {
    const p = this.participants.get(client.sessionId);
    const name = (message as { name?: unknown })?.name;
    if (!p || typeof name !== 'string') return;
    p.name = cleanName(name);
    this.refreshAll();
  }

  /** "Are you Sam?": an unseated player asks to take over a disconnected seat (D-026). */
  private onClaim(client: Client, message: unknown): void {
    const p = this.participants.get(client.sessionId);
    const targetId = (message as { participant?: unknown })?.participant;
    const target = typeof targetId === 'string' ? this.participants.get(targetId) : undefined;
    if (!p || p.seat || p.role !== 'player') return this.fail(client, 'You already have a seat.');
    if (!target || target.connected || !target.seat) return this.fail(client, 'That seat isn’t free.');
    p.claiming = target.id;
    this.refreshAll();
  }

  /** Gives `from` the seat, name and admin rights of `target`, and releases `target` for good. */
  private transferSeat(target: Participant, from: Participant): void {
    from.seat = target.seat!;
    from.name = target.name;
    from.admin = from.admin || target.admin;
    from.role = 'player';
    from.joinOrder = target.joinOrder;
    from.autoplay = false;
    target.reconnection?.reject();
    this.participants.delete(target.id);
  }

  // --- Game ----------------------------------------------------------------------

  private start(client: Client): void {
    if (this.phase !== 'lobby') return this.fail(client, 'The game has already started.');
    const { meta, module } = GAMES[this.gameId]!;
    const players = this.ordered().filter((p) => p.role === 'player');
    if (players.length < meta.minSeats) return this.fail(client, `${meta.name} needs at least ${meta.minSeats} players.`);
    if (players.length > meta.maxSeats) return this.fail(client, `${meta.name} seats up to ${meta.maxSeats}.`);

    const seats: SeatId[] = [];
    players.forEach((p, i) => {
      p.seat = `s${i + 1}`;
      p.autoplay = false;
      if (!p.name) p.name = `Player ${i + 1}`;
      seats.push(p.seat);
    });
    this.game = module;
    this.match = createMatch(this.game, { seats, options: { ...this.options }, seed: newSeed() });
    this.log = store.start(this.code, headerOf(this.match)); // seats only: no names in logs (D-035)
    this.phase = 'playing';
    this.refreshAll();
  }

  private commit(result: SubmitResult<unknown>, client?: Client): void {
    if (!result.ok) return client ? this.fail(client, result.error) : undefined;
    this.match = result.state;
    this.log?.append(result.entry, result.state.rev);
    this.pendingEvents.push(...result.events);
    this.settle();
    this.sendViews();
  }

  /** Plays for absent players whose grace period is over, then (re)arms grace timers. */
  private settle(): void {
    if (!this.match || this.phase !== 'playing') return this.clearGrace();
    for (let guard = 0; guard < 500; guard++) {
      const decision = this.waitingOnAbsent().find(({ p }) => p.autoplay)?.decision;
      if (!decision) break;
      const result: SubmitResult<unknown> = autoAnswer(this.game, this.match, decision);
      if (!result.ok) break;
      this.match = result.state;
      this.log?.append(result.entry, result.state.rev);
      this.pendingEvents.push(...result.events);
    }

    const needed = new Set<string>();
    for (const { decision, seat, p } of this.waitingOnAbsent()) {
      const key = `${decision}|${seat}`;
      needed.add(key);
      if (this.grace.has(key)) continue;
      const timer = this.clock.setTimeout(() => {
        this.grace.delete(key);
        p.autoplay = true;
        this.settle();
        this.sendViews();
      }, GRACE_MS);
      this.grace.set(key, { timer, until: Date.now() + GRACE_MS });
    }
    for (const [key, g] of this.grace) {
      if (!needed.has(key)) {
        g.timer.clear();
        this.grace.delete(key);
      }
    }
  }

  /** Open decisions that only an absent player can answer. `any` decisions with others present don't wait. */
  private waitingOnAbsent(): { decision: string; seat: SeatId; p: Participant }[] {
    if (!this.match) return [];
    const out: { decision: string; seat: SeatId; p: Participant }[] = [];
    for (const d of this.game.decisions(this.match)) {
      if (d.mode === 'any' && d.seats.length > 1) continue;
      if (!d.defaultAnswer) continue;
      for (const seat of d.seats) {
        const p = this.bySeat(seat);
        if (p && !p.connected) out.push({ decision: d.id, seat, p });
      }
    }
    return out;
  }

  private clearGrace(): void {
    for (const g of this.grace.values()) g.timer.clear();
    this.grace.clear();
  }

  // --- Sending ---------------------------------------------------------------------

  private refreshAll(): void {
    this.settle();
    this.sendRooms();
    this.sendViews();
    this.checkEmpty();
  }

  private sendRooms(): void {
    const participants = this.ordered().map(info);
    for (const client of this.clients) {
      const p = this.participants.get(client.sessionId);
      if (!p) continue;
      const message: RoomMessage = {
        code: this.code,
        phase: this.phase,
        game: this.gameId,
        games: Object.values(GAMES).map((g) => g.meta),
        options: { ...this.options },
        you: info(p),
        participants,
      };
      if ((p.admin || p.role === 'screen') && this.phase === 'lobby') message.adminCode = this.adminCode;
      if (p.admin) {
        const claims = [...this.participants.values()].flatMap((q) => {
          const target = q.claiming ? this.participants.get(q.claiming) : undefined;
          return target ? [{ from: q.id, fromName: q.name, target: target.id, targetName: target.name }] : [];
        });
        if (claims.length) message.claims = claims;
      }
      client.send('room', message);
    }
  }

  private sendViews(): void {
    const match = this.match;
    if (!match || this.phase !== 'playing') return;
    const waiting = [...this.grace.entries()].map(([key, g]) => ({ seat: key.split('|')[1]!, until: g.until }));
    const events = this.pendingEvents;
    this.pendingEvents = [];
    for (const client of this.clients) {
      const p = this.participants.get(client.sessionId);
      if (!p) continue;
      const seat = p.role === 'player' ? p.seat : undefined;
      const viewer: Viewer = seat ? { kind: 'seat', seat } : { kind: 'public' };
      const message: ViewMessage = {
        rev: match.rev,
        view: this.game.view(match, viewer),
        decisions: seat ? decisionsFor(this.game, match, seat) : [],
        events: eventsFor(events, viewer),
        waiting,
        serverTime: Date.now(),
      };
      client.send('view', message);
    }
  }

  private fail(client: Client, message: string): void {
    client.send('error', { message });
  }

  // --- Housekeeping ----------------------------------------------------------------

  private checkAdmins(): void {
    const present = [...this.participants.values()];
    if (present.some((p) => p.admin && p.connected)) {
      this.noAdminSince = undefined;
      return;
    }
    this.noAdminSince ??= Date.now();
    if (Date.now() - this.noAdminSince < ADMIN_HANDOVER_MS) return;
    const next = present
      .filter((p) => p.connected && p.role === 'player')
      .sort((a, b) => a.connectedSince - b.connectedSince)[0];
    if (!next) return;
    next.admin = true;
    this.noAdminSince = undefined;
    this.sendRooms();
  }

  private checkEmpty(): void {
    const anyone = [...this.participants.values()].some((p) => p.connected);
    if (anyone) {
      this.emptyTimer?.clear();
      this.emptyTimer = undefined;
    } else if (!this.emptyTimer) {
      this.emptyTimer = this.clock.setTimeout(() => void this.disconnect(), EMPTY_ROOM_MS);
    }
  }

  private isAdminCode(candidate: unknown): boolean {
    if (typeof candidate !== 'string' || candidate.length !== this.adminCode.length) return false;
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(this.adminCode));
  }

  private bySeat(seat: SeatId): Participant | undefined {
    for (const p of this.participants.values()) if (p.seat === seat) return p;
    return undefined;
  }

  private ordered(): Participant[] {
    return [...this.participants.values()].sort((a, b) => a.joinOrder - b.joinOrder);
  }
}

function info(p: Participant): ParticipantInfo {
  const out: ParticipantInfo = { id: p.id, name: p.name, role: p.role, admin: p.admin, connected: p.connected };
  if (p.seat) out.seat = p.seat;
  if (p.role === 'screen' && p.layout) out.layout = p.layout;
  if (p.claiming) out.claiming = p.claiming;
  return out;
}

function cleanName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

function isAct(message: unknown): message is ActMessage {
  const m = message as ActMessage;
  return typeof m?.decision === 'string' && typeof m.answer === 'object' && m.answer !== null;
}
