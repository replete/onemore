# One More: Architecture

> Living document: how the system fits together and how games are modelled. This is an early draft. Check the status of each decision in [decisions.md](decisions.md).

## 1. System shape

```
   Screens (TV/tablet)                  Phones (players)
           │ public view                    │ private views
           └──────────── WebSocket ─────────┘
                           │
   ┌──────────────────── Game server ───────────────────┐
   │  Room layer                                        │
   │  connections, rooms, roles, timers, log, fan-out   │
   │                        │                           │
   │                        │ narrow, data-only calls   │
   │                        │                           │
   │  Rules execution                                   │
   │  rules modules + content packs (versioned)         │
   └────────────────────────────────────────────────────┘
```

The server has two layers:

- **Room layer.** Everything to do with people and connections: rooms, roles, timers, the action log, and sending views out.
- **Rules execution.** Calls into pure rules modules, which know nothing about connections, clocks or storage.

### Rooms and roles

- **Room.** One game session. It's identified by a Google Meet–style code such as `abc-def-ghi` (D-011), and the screen shows its link, `https://<host>/abc-def-ghi`, as a QR code. A room holds its participants, the chosen game and options, and the game state.
- **Participants** join through the room link and choose a role (D-009):
  - **Player:** takes a seat and gets a private view on their phone.
  - **Screen:** a view-only device (TV, tablet or laptop) showing the public table. A room can have several. An interactive tablet mode, where players can also touch the screen, comes later.
  - **Spectator:** watches the public view from anywhere through a separate spectator link, if an admin has opened one.
- **Admin** is a flag on a participant, not a separate role. The creator is admin by default and can make others admins. Admins choose the game and options, start it, lock the room, remove participants, set the absence policy (D-010), open spectating and control screens.
- **Screen commands.** Admins can send presentation commands to screens, such as "follow a player" or "zoom" (the full set is TBD). They change what a screen shows, not the game, so they don't go through the rules or the action log.
- **Seat token.** Every participant gets a random secret, stored in the browser, so they get the same seat and role back when they reconnect after their phone sleeps.

### Server loop

1. Receive an action from a seat.
2. Check that the action is legal for that seat right now.
3. Apply it.
4. Append it to the log.
5. Compute every viewer's new view.
6. Push the views out.

That's the whole game loop. When a timer expires, it enters the same loop as a system action (§3.4).

### Content and versions

- **Rules module.** The game logic (e.g. `twenty-one`), written as pure code against the engine contract (§3.1).
- **Content pack.** Data: card definitions, deck lists, tiles, boards and art, versioned by content hash. A room pins exact rules and content versions when it's created. Clients fetch assets by hash, so assets can be cached forever.

### Protocol sketch

JSON over WebSocket, and every message has a `type`.

- Client → server:
  - `hello {room, seatToken?, protocol}`
  - `join {as: player|screen|spectator, name?}`
  - `act {rev, action}`
  - `admin {command}`
  - `ping {clientTime}`
- Server → client:
  - `welcome {participant, seatToken, role, game, versions}`
  - `view {rev, view, legalActions, events, deadlines}`
  - `rejected {reason}`
  - `room {participants, status}`
  - `screen {command}`
  - `pong {clientTime, serverTime}`

How the fields work:

- `rev` goes up by one with each applied action. Clients send the `rev` they acted on, and the server rejects stale actions rather than guessing what was meant.
- `deadlines` are absolute server times. `ping` and `pong` let each client estimate its clock offset, so countdowns match on every device (D-013).
- To start with, the server pushes the full view every time. We'll move to diffs only if we need to.

## 2. Trust and security

The client is untrusted. Assume anyone can open dev tools, edit the JavaScript or write their own client.

| Threat | Defence |
|---|---|
| Seeing hidden cards (other hands, deck order) | The server never sends them. Views are computed per viewer on the server. |
| Making illegal moves | The server checks every action against the legal actions. |
| Rigging or predicting shuffles | Randomness only happens on the server. Seeds come from a secure random source and never leave the server, because anyone who knew the seed could predict every shuffle. |
| Acting as another player | Seat tokens. Actions are only accepted from that seat's own connection. |
| Joining a room uninvited | Meet-style codes have trillions of combinations, so they can't be guessed. Joins are rate-limited anyway, and admins can lock the room and remove participants. |
| Spectators taking seats | The spectator link uses a different code from the room. |
| Players showing each other their phones | Not our problem, same as with real cards. |

About everyone needing the same package: pinning versions keeps clients **compatible** (same rules, same card art). It isn't what keeps the game **fair**. Because the server is authoritative, a modified client can only change what it displays, or send actions that the server rejects.

## 3. The game model

This is the hard, interesting part, and the part we'll revise most.

### 3.1 The engine contract

Every game implements the same small interface, and everything else is helpers.

```ts
interface GameModule<State, Action> {
  id: string;                                       // "twenty-one"
  version: string;
  setup(ctx: SetupContext): State;                  // seats, options, content, rng
  legalActions(state: State, seat: SeatId): Action[];
  apply(state: State, action: Action, ctx: ApplyContext): { state: State; events: GameEvent[] };
  view(state: State, viewer: Viewer): View;         // what this seat, screen or spectator may see
  timers(state: State): Timer[];                    // durations only, e.g. { id: "respond", ms: 5000 }
  outcome(state: State): Outcome | null;            // null while the game is in progress
}
```

It has four properties:

- **Deterministic.** The same seed and the same actions always produce the same game. All randomness goes through the RNG passed in by the engine.
- **Pure.** No I/O, no clocks, no globals. That makes it easy to test, to replay and to run anywhere.
- **Plain data.** State, actions, views and events are JSON-serialisable data, with no classes, functions, Maps or Dates. That's what lets them be stored, sent over the wire and replayed.
- **Events alongside state.** `apply` also returns what happened ("seat 2 drew a card", "7♥ moved from hand to pile") so clients can animate it. Events are redacted per viewer, just like views: others see "Sam drew a card", Sam sees "you drew the 7♥".

This shape is deliberately close to boardgame.io, OpenSpiel and Board Game Arena (research 01).

### 3.2 Vocabulary

- **Component.** A physical-ish thing: a card, tile, piece, token or die. It has a *definition* (what it is, e.g. "7 of hearts" or "road-city tile") and *instances* (this particular copy, with its own id).
- **Zone.** Where components live: deck, hand, discard pile, tableau, board cell, bag or supply. A zone has an owner (a seat, or none), is ordered or unordered, and has a visibility (§3.3).
- **Board.** A zone with geometry: a square grid, a hex grid, a graph of spaces, or an unbounded grid that grows as tiles are laid.
- **Seat / player.** A participant who plays.
- **Viewer.** Anyone who gets a view: a player's seat, or the public view shown to screens and spectators.
- **Turn / phase / step.** The structure of play (§3.4).
- **Action.** Something a seat may do: `{ type, component?, from?, to?, params? }`.
- **System action.** An action submitted by the room layer rather than a seat, e.g. `timeout`.
- **Event.** Something that happened, used for animation and logs.
- **View.** The redacted state for one viewer.
- **Content pack.** Definitions plus assets.
- **Rules module.** The code for one game.
- **Variant.** Options on a rules module (e.g. "jokers wild", "tens burn the pile").

### 3.3 Visibility

Hidden information is what separates a card game from a board, so visibility is built into the model from the start.

Each zone has a default visibility, and individual components can override it (face up or face down):

- `public`: everyone sees it.
- `owner`: only the owning seat sees it. Everyone else sees a card back.
- `hidden`: nobody sees it, not even the owner (a face-down deck, Shithead's face-down cards).
- `count`: others see only how many there are (an opponent's hand size).
- `top`: only the top component is visible (a discard pile in some games).

Two examples:

- **21.** The dealer's second card is `hidden` until the players have finished. Players' cards are usually `public`.
- **Shithead.** The deck is `hidden` (count shown), each hand is `owner`, the three face-down table cards are `hidden`, the three face-up table cards are `public`, and the pile is `public`.

Screens and spectators get the public view, and each phone gets its own seat's view.

Game-specific exceptions (peeking, or showing a card to one player) use a "known to" set on the instance, which the view function respects.

### 3.4 Flow: turns, interrupts and timers

Flow is modelled as a state machine, like Board Game Arena's. Each state says who is active and which action types are allowed. The common shapes are:

- **Strict turn order.** Most games.
- **Simultaneous.** Everyone acts, and the state moves on once they all have (Shithead's opening swap, drafting, bidding).
- **Out-of-turn interrupts** (D-013). During a **response window**, players who aren't active get legal actions too, such as burning the pile, "Snap!" or a counter-spell. The window closes when every eligible player has passed or when its timer runs out.

**Timers** (D-013):

- Rules modules never read a clock (D-007). They declare timers as durations through `timers(state)`, and the room layer arms and cancels them as those timers appear and disappear.
- When a timer expires, the room layer submits a system `timeout` action, which is applied and logged like any other action. Replays read timeouts from the log, not the clock, so they stay deterministic.
- Deadlines go to clients as absolute server times. Clients correct for their clock offset (from `ping`/`pong`), so every device shows the same countdown.
- If two interrupts race, the first valid one to reach the server wins, and the log fixes the order.

Two problems are still open (research 05):

- **Fairness.** In reaction races, players with lower latency have an edge.
- **Information leaks.** A window that opens only when someone *could* respond tells everyone that someone can.

### 3.5 Legal actions and the UI

This is how the UI stays separate from the rules (D-005). With each view, the server sends that seat's legal actions. The client knows no rules. It maps the legal actions onto what's on screen:

- When a card is picked up or dragged, highlight every zone or component that's a `to` target of a legal action involving that card.
- When it's dropped on a target and exactly one legal action matches (component plus target), send that action. If several match (e.g. play as an attack or discard), show a small chooser.
- A gesture with no target, like flicking a card up to play it, sends the single "play this card" action if there is exactly one.
- Actions that don't involve a component (pass, stick, bet 10) become buttons.
- If a card has no legal actions, it can't be dragged. Illegal moves don't get rejected; the UI gives you no way to make them.
- Out-of-turn plays work the same way. During a response window, a phone whose player isn't active simply has legal actions.

**Big action spaces** (D-012). Legal actions are listed in full by default. When a game has too many to list (choosing any subset of six cards is already 63), it returns action templates with constraints instead ("choose 1–3 cards of equal rank"), and the server validates what comes back. We build templates when a real game needs them.

Games can ship custom renderers for special pieces, but the generic renderer should be able to play any game: ugly, but correct.

### 3.6 Determinism, logs and replays

A room is fully described by its rules version, content version, options, seats, seed and action list, including system actions. From that we can:

- rebuild any room after a server restart (D-014);
- replay a bug exactly ("send us the log");
- write tests as scripts of actions;
- later, add undo (where the game allows it), spectator replays and bots.

Research 04 informs the choice of seeded RNG and shuffle. Saved replays (a seed, actions and the expected views) double as regression tests.

### 3.7 Rules as code, content as data

Proposed in [D-004](decisions.md#d-004-rules-as-code-content-as-data): rules are TypeScript modules written against a shared engine library, and content (card definitions, decks, tiles) is data. There's no rules DSL yet. When the same pattern shows up in several games, it becomes a library helper. The first place a small effect language is likely to pay off is authoring card effects at volume for the collectible family.

## 4. The three families against the model

### Classic card games

- **Content:** the standard 52-card deck as a pack, with variants (jokers, stripped decks, multiple decks).
- **Library:** shuffle, deal, draw, rank orders (ace high or low, trumps), sets and runs, trick-taking, poker hand evaluation, turn rotation, betting and chips.
- **First game: 21** (D-015). It has one hidden card, simple actions (hit or stand) and a clear result. A minimal version with no betting doubles as the walking skeleton.
- **Second game: Shithead.** It tests what 21 doesn't: hidden, owner-only and public zones in one game, a simultaneous opening swap, and out-of-turn play with timers.

### Collectible / deck-building card games

- **Content:** card sets with stats and effects. A deck is a list of card ids validated against a format (e.g. "30 cards, max 2 copies").
- **Effects as data**, from a small vocabulary:
  - triggers: on play, on death, start of turn;
  - selectors: any enemy minion, a random friendly;
  - effects: damage, heal, draw, summon, buff.

  Unique cards can escape to code.
- **The hard part is resolution order,** where triggers cause more triggers. It needs an explicit effect queue or stack with defined ordering. Hearthstone's entity-with-tags model and Forge/XMage are the references.
- Deck building and collections mean saved decks at least, and eventually accounts. That comes later.

### Board games

- **Content:** fixed boards or placed tiles, plus pieces and tokens.
- **Geometry:** square and hex grids, graphs of spaces, unbounded placement grids.
- **Carcassonne-like tile laying:**
  - Tiles have typed edges (road, city, field) and features that span several tiles.
  - A placement is legal if its edges match the neighbouring tiles.
  - Scoring tracks features as they merge across tiles and completes them (union-find over feature segments).
  - The server sends legal placements, which show as ghost positions on the screen and on the phone.
- **The shared screen shines here.** The board lives on the TV, and an admin can have it follow the active player. Each phone shows your tile, your pieces and a zoomed-in placement view.

## 5. Technology

We're using TypeScript on both server and client for now (D-008).

**Persistence** (D-014): rooms live in memory to start with, and action logs are appended to disk. A store that survives restarts comes later (research 06).
