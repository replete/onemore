// Components, zones and what each viewer may see (architecture §3.2, §3.3).
//
// Opaque refs: clients never see real component ids. Each component has a random
// ref that changes whenever it moves, is shuffled or is flipped, so a hidden card
// can't be tracked or decoded from its id (research 01, research 07).

import type { Rng } from './rng';
import type { CardView, ComponentState, MatchState, SeatId, Viewer, Visibility, ZoneState, ZoneView } from './types';

const REF_STREAM = 'refs';
const SHUFFLE_STREAM = 'shuffle';

/** Mutating operations on a draft match state. */
export class Table {
  constructor(
    private readonly state: MatchState<unknown>,
    private readonly rng: Rng,
  ) {}

  addZone(id: string, opts: { visibility: Visibility; owner?: SeatId }): void {
    if (this.state.table.zones[id]) throw new Error(`zone exists: ${id}`);
    const zone: ZoneState = { id, visibility: opts.visibility, items: [] };
    if (opts.owner !== undefined) zone.owner = opts.owner;
    this.state.table.zones[id] = zone;
  }

  /** Creates one component per definition id, placed in `zone` in order. Returns the new ids. */
  create(defs: string[], zone: string): string[] {
    const z = this.zone(zone);
    const ids: string[] = [];
    for (const def of defs) {
      const id = `c${Object.keys(this.state.table.components).length + 1}`;
      this.state.table.components[id] = { id, def };
      z.items.push(id);
      this.rekey(id);
      ids.push(id);
    }
    return ids;
  }

  /** Moves a component to the top of `to`. `face` overrides visibility; omit to follow the zone. */
  move(id: string, to: string, opts: { face?: 'up' | 'down' } = {}): void {
    const from = this.zoneOf(id);
    from.items.splice(from.items.indexOf(id), 1);
    this.zone(to).items.push(id);
    const c = this.component(id);
    if (opts.face) c.face = opts.face;
    else delete c.face;
    delete c.knownTo;
    this.rekey(id);
  }

  /** Moves the top component of `from` to `to`. Returns its id. */
  draw(from: string, to: string, opts: { face?: 'up' | 'down' } = {}): string {
    const id = this.zone(from).items.at(-1);
    if (id === undefined) throw new Error(`zone is empty: ${from}`);
    this.move(id, to, opts);
    return id;
  }

  flip(id: string, face: 'up' | 'down'): void {
    this.component(id).face = face;
    this.rekey(id);
  }

  shuffle(zone: string): void {
    const z = this.zone(zone);
    this.rng.shuffle(SHUFFLE_STREAM, z.items);
    for (const id of z.items) this.rekey(id);
  }

  items(zone: string): ComponentState[] {
    return this.zone(zone).items.map((id) => this.component(id));
  }

  component(id: string): ComponentState {
    const c = this.state.table.components[id];
    if (!c) throw new Error(`no component: ${id}`);
    return c;
  }

  zone(id: string): ZoneState {
    const z = this.state.table.zones[id];
    if (!z) throw new Error(`no zone: ${id}`);
    return z;
  }

  zoneOf(id: string): ZoneState {
    for (const z of Object.values(this.state.table.zones)) if (z.items.includes(id)) return z;
    throw new Error(`component not in any zone: ${id}`);
  }

  private rekey(id: string): void {
    this.state.refs[id] = `r${this.rng.token(REF_STREAM)}`;
  }
}

/** Can `viewer` see the face of the component at `index` in `zone`? */
export function canSee(state: MatchState<unknown>, zone: ZoneState, index: number, viewer: Viewer): boolean {
  const id = zone.items[index];
  if (id === undefined) return false;
  const c = state.table.components[id];
  if (!c) return false;
  if (viewer.kind === 'seat' && c.knownTo?.includes(viewer.seat)) return true;
  if (c.face === 'up') return true;
  if (c.face === 'down') return false;
  switch (zone.visibility) {
    case 'public':
      return true;
    case 'owner':
      return viewer.kind === 'seat' && viewer.seat === zone.owner;
    case 'top':
      return index === zone.items.length - 1;
    case 'hidden':
    case 'count':
      return false;
  }
}

/** A zone as `viewer` may see it. The only function that should put cards in a view. */
export function viewZone(state: MatchState<unknown>, zoneId: string, viewer: Viewer): ZoneView {
  const zone = state.table.zones[zoneId];
  if (!zone) throw new Error(`no zone: ${zoneId}`);
  const view: ZoneView = { id: zone.id, count: zone.items.length };
  if (zone.owner !== undefined) view.owner = zone.owner;
  if (zone.visibility === 'count') return view;
  view.cards = zone.items.map((id, index): CardView => {
    const ref = state.refs[id];
    if (!ref) throw new Error(`no ref for ${id}`);
    const card: CardView = { ref };
    if (canSee(state, zone, index, viewer)) card.def = state.table.components[id]!.def;
    return card;
  });
  return view;
}

/** Defs of the components `viewer` can see in `zone` (for rules that compute visible totals). */
export function visibleDefs(state: MatchState<unknown>, zoneId: string, viewer: Viewer): string[] {
  const zone = state.table.zones[zoneId];
  if (!zone) throw new Error(`no zone: ${zoneId}`);
  return zone.items.flatMap((id, i) => (canSee(state, zone, i, viewer) ? [state.table.components[id]!.def] : []));
}
