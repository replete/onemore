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

- **Room layer.** Everything to do with people and connections: rooms, roles, timers, the action log, and sending views out. It's built on Colyseus rooms with Colyseus's state sync turned off, behind a thin adapter (D-025).
- **Rules execution.** Calls into pure rules modules, which know nothing about connections, clocks or storage.

### Rooms and roles

- **Room.** One game session. It's identified by a Google Meet–style code such as `kfp-nwt-hdz`, made of 19 consonants (D-011, D-027). The screen shows its link, `https://<host>/kfp-nwt-hdz`, as a QR code, with the code underneath. A room holds its participants, the chosen game and options, and the game state.
- **Participants** (D-009, D-020):
  - **Player:** anyone who joins through the room link. Takes a seat and gets a private view on their phone.
  - **Screen:** a view-only device (TV, tablet or laptop) showing the public table. Admins choose which devices are screens: an admin can make their own device the shared screen ("Make this the shared screen"), or turn any connected client into one. A room can have several. An interactive tablet mode, where players can also touch the screen, comes later.
  - **Spectator:** watches the public view from anywhere through a separate spectator link, if an admin has opened one.
- **Admin** is a flag on a participant, not a separate role (D-020):
  - The creator starts as admin, and admins can make others admins.
  - A separate **admin QR code** joins whoever scans it as an admin. The shared screen shows it on the join screen before the game starts, and that's how a TV that created a room hands control to a phone. During the game, admins are marked on every screen.
  - If no admin is connected for 2 minutes, admin passes to the player who has been connected longest (D-026).
  - Admins see **Start game**, **Game options** and **Make this the shared screen**. They can also lock the room, remove participants, set the absence policy (D-010), open spectating and control screens.
- **Lobby approval.** An optional room setting (D-020): admins approve each person before they join.
- **Screen commands.** Admins control each screen's **layout**, and each game defines which layouts it offers (D-020). Layout changes what a screen shows, not the game, so screen commands don't go through the rules or the action log.
- **Seat token.** Every participant gets a random secret, stored in the browser, so they get the same seat and role back when they reconnect after their phone sleeps.

### Connections and absence

Phones drop their connection all the time. iOS closes the WebSocket as soon as the screen locks, and Android freezes background pages within 1–5 minutes (research 03). So we design for the connection dying, not for keeping it alive (D-026).

- **Seats are held for the whole game.** Leaving means saying so or being removed.
- **The game doesn't wait long.** When a decision is waiting on an absent player, everyone sees that they're reconnecting. After a **60-second grace period**, the game plays that decision's default action (in 21, *stand*). Their later decisions are auto-played straight away until they return. Admins can skip, end a timer early or change the policy at any time.
- **Reconnecting is immediate.** The client reconnects as soon as the page is visible again (`visibilitychange`, `pageshow` with `persisted`, `resume`, `online`), using its token from localStorage or an HttpOnly cookie. It doesn't wait for `onclose`, and an app-level heartbeat catches connections that have quietly died.
- **Lost tokens.** Without a token (private tabs, the iOS Code Scanner), the player sees "Are you Sam? Rejoin", and an admin approves it.
- **Keeping screens on.** Phones request a screen wake lock after the first tap and again whenever the page becomes visible. If the lock is refused, they fall back to a "keep your screen on" hint.
- **Rooms outlive their players briefly.** A shared screen dropping doesn't pause anything, and an empty room is kept for 15 minutes.

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

Messages travel as Colyseus room messages (MessagePack over WebSocket), and every message has a `type`. Colyseus handles joining and reconnection itself (`joinById`, reconnection tokens), so `hello` and `welcome` below are conceptual.

- Client → server:
  - `hello {room, seatToken?, protocol}`
  - `join {name?, adminCode?, spectatorCode?}`
  - `act {rev, decision, action}`
  - `admin {command}`
  - `ping {clientTime}`
- Server → client:
  - `welcome {participant, seatToken, role, game, versions}`
  - `view {rev, view, decisions, events, deadlines}`
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
| Making illegal moves | The server only accepts an action if it answers a current pending decision and comes from a seat that decision is waiting on. |
| Tracking or decoding hidden cards by their ids | Views give hidden components opaque ids, which change when a component is shuffled or moves while hidden (§3.3). |
| Rigging or predicting shuffles | Randomness only happens on the server. Seeds come from a secure random source and never leave the server, because anyone who knew the seed could predict every shuffle. |
| Acting as another player | Seat tokens. Actions are only accepted from that seat's own connection. |
| Joining a room uninvited | Meet-style codes have about 3 × 10^11 combinations, so they can't be guessed. Code lookups are rate-limited per IP address anyway, which is what stopped Jackbox's codes being brute-forced (research 03). Admins can lock the room, remove participants, or turn on lobby approval. |
| Offensive names or codes | Names have a length limit, and admins can remove players. There's no profanity filter for names (D-029). Codes contain no vowels, and a blocklist catches anything left. |
| Becoming an admin uninvited | The admin QR code carries a separate code from the room. It's only shown on the shared screen's join screen before the game starts. During the game, admins are marked, so everyone can see who they are. |
| Spectators taking seats | The spectator link uses a different code from the room. |
| Players showing each other their phones | Not our problem, same as with real cards. |

About everyone needing the same package: pinning versions keeps clients **compatible** (same rules, same card art). It isn't what keeps the game **fair**. Because the server is authoritative, a modified client can only change what it displays, or send actions that the server rejects.

## 3. The game model

This is the hard, interesting part, and the part we'll revise most. [Research 01](research/01-game-modelling-result.md) surveyed how other systems model games. Its main lesson: share the *substrate* (components, zones, turn machinery, views, logs), and write each game's rules as code on top of it.

### 3.1 The engine contract

Every game implements the same small interface, and everything else is helpers. As built in `engine/src/match.ts`:

```ts
interface GameModule<G> {
  id: string;                                       // "twenty-one"
  version: string;
  setup(ctx: SetupContext): G;                      // ctx: seats, options, table, rng
  decisions(state: MatchState<G>): PendingDecision[]; // who must decide what, right now (§3.4)
  apply(ctx: ApplyContext<G>, by: SeatId | 'system', decision: PendingDecision, answer: Answer): GameEvent[] | void;
  view(state: MatchState<G>, viewer: Viewer): unknown; // what this seat, screen or spectator may see
  outcome(state: MatchState<G>): Outcome | null;    // null while the game is in progress
}

interface PendingDecision {
  id: string;                                       // deterministic, derived from the state
  seats: SeatId[];                                  // who it's waiting on
  mode: 'one' | 'each' | 'any';                     // one seat / every seat answers / first answer wins
  blocking: boolean;                                // false = play carries on around it (D-023)
  prompt: Prompt;                                   // the typed choices (§3.5)
  timerMs?: number;                                 // a duration, never a clock time
  defaultAnswer?: Answer;                           // played on timeout or absence (D-026); never sent to clients
}
```

`apply` mutates a draft. The engine clones the state before every setup and apply, so from the outside each step is still pure: the same state and answer always give the same new state. Rules reach the table and randomness only through `ctx.table` and `ctx.rng`.

The server only accepts an action if it answers one of the current pending decisions and comes from a seat that decision is waiting on (D-018).

It has four properties:

- **Deterministic.** The same seed and the same actions always produce the same game. All randomness goes through the RNG passed in by the engine.
- **Pure.** No I/O, no clocks, no globals. That makes it easy to test, to replay and to run anywhere.
- **Plain data.** State, actions, views and events are JSON-serialisable data, with no classes, functions, Maps or Dates. That's what lets them be stored, sent over the wire and replayed. Actions refer to components by id, never by object. Research 01 found that holding object references in actions was the most common mistake in one framework (TAG).
- **Events alongside state.** `apply` also returns what happened ("seat 2 drew a card", "7♥ moved from hand to pile") so clients can animate it. Events are redacted per viewer, just like views: others see "Sam drew a card", Sam sees "you drew the 7♥". Events can nest cause and effect, like Hearthstone's blocks ("Sam played a spell → it hit the dragon → the dragon died"), so clients can put animations in order.

This shape is close to boardgame.io, OpenSpiel, TAG and Board Game Arena.

### 3.2 Vocabulary

- **Component.** A physical-ish thing: a card, tile, piece, token or die. It has a *definition* (what it is, e.g. "7 of hearts" or "road-city tile") and *instances* (this particular copy). An instance is `{ id, defId, zone, owner, props }`. The zone it's in is just another property, as in Hearthstone's model, and `props` holds game-specific values such as face up, damage or rotation.
- **Zone.** Where components live: deck, hand, discard pile, tableau, bag or supply. A zone has an owner (a seat, or none), is ordered or unordered, and has a visibility (§3.3).
- **Board and sites.** A board is a graph of **sites**: squares, hexes, spaces on a track, or places a tile could go. A growing map, as in tile laying, is a board whose sites become playable as tiles are placed (Ludii works this way).
- **Seat / player.** A participant who plays.
- **Viewer.** Anyone who gets a view: a player's seat, or the public view shown to screens and spectators.
- **Phase / turn / step.** The overall shape of play (§3.4).
- **Pending decision.** A choice the game is waiting on: who can make it, what the choices are, and whether there's a timer (§3.4).
- **Prompt.** The typed form of a decision's choices, such as "pick one of these cards" or "place this tile on one of these sites" (§3.5).
- **Action.** An answer to a pending decision.
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

Hidden information can also leak in less obvious ways (research 01):

- **Ids leak.** If the ids clients see never change, a card can be tracked after it's hidden again. If ids follow deck order, anyone can work out a hidden card from its id. So views give hidden components opaque ids, and those ids change whenever the component is shuffled or moves while hidden. Hearthstone has `HIDE_ENTITY` for the same reason.
- **Deck order is a secret too**, not just the cards themselves.
- **Test, don't trust.** Property tests check that no message sent to a viewer contains something that viewer shouldn't see, such as an opponent's hand, the deck order or the seed. The tests cover every message type, including the first sync and replayed logs, not just views. boardgame.io leaks the whole starting state through its sync message ([research 07](research/07-boardgame-io-result.md)).

### 3.4 Flow: phases, pending decisions and timers

Flow has two layers, as in most of the engines research 01 looked at (D-017):

- **Phases, turns and steps** form a state machine for the overall shape of the game: deal, play, score, and whose turn it is.
- **A stack of pending decisions** says who must decide what, right now. The stack lives in the game state. When a decision is answered, the game can push more decisions on top, such as "choose a target" after "play this card", or "everyone else discards one" in the middle of someone's turn. When those are resolved, play carries on underneath.

That one mechanism covers the common shapes of play:

- **Strict turn order:** one `one` decision at a time, for the active player.
- **Simultaneous play:** an `each` decision (Shithead's opening swap, drafting, bidding).
- **Out-of-turn interrupts** (D-013, D-023) come in two kinds:
  - **Non-blocking (the default).** An `any` decision that sits alongside the normal turn instead of on top of it. Play doesn't pause, and the first valid claim wins. This covers "Snap!", and cut-ins and burns in Shithead. Prompts are private and nothing on the shared screen changes, so nobody learns who could have responded.
  - **Blocking windows**, only where the rules need a pause, such as counter-spells. They open at a few fixed points for every eligible seat, whether or not the player holds a response. Each runs at a fixed short pace (about 2.5 s, with a visible timer) and closes early only if everyone passes by hand. There's no auto-pass unless a game opts in (D-034, proposed). Research 05 found this is the only approach that never gives away a hand.
- **Chains of effects:** responses to responses stack up and resolve in order, like Magic's stack.

The references are TAG's `IExtendedSequence` stack, BGA's `MULTIPLE_ACTIVE_PLAYER` states, boardgame.io's stages, and Hearthstone's blocks.

**Timers** (D-013):

- Rules modules never read a clock (D-007). A pending decision declares its timer as a duration. The room layer arms the timer when the decision appears and cancels it when the decision goes away.
- When a timer expires, the room layer submits a system `timeout` action for that decision, which is applied and logged like any other action. Replays read timeouts from the log, not the clock, so they stay deterministic.
- Deadlines go to clients as absolute server times, and every device shows the same countdown (D-033):
  - The client syncs its clock with 8–10 pings on connect, then every 15–30 s and when the page becomes visible. Its offset is the median of the lowest-round-trip quarter of samples, measured with `performance.now()`.
  - The client draws countdowns every animation frame and blends in corrections.
  - The server accepts an action up to the deadline plus a small capped grace, min(150 ms, RTT/2 + 50 ms), and rejects anything later with a clear message.
  - The pings double as the heartbeat that detects dead connections.
- **Turn timers are off by default** (D-034, proposed): people in the same room can nudge each other. A game can offer a generous timer, e.g. 60 s with a visible rope in the last 15 s.
- If two answers to an `any` decision race, the first valid one wins, and the log fixes the order. With **Fair first-response** on (D-022, D-032):
  - The server collects claims for about 120 ms after the first valid one.
  - It ranks them by arrival time minus half each client's round trip, using round trips it measured itself. Client timestamps are never trusted.
  - Exact ties go to seat order.
  - Players see the margin ("Alex by 45 ms").
  - Reaction moments start at an announced server time, and impossibly early claims count as false starts.

Research 05 found that in one room, differences in network delay are much smaller than differences in reaction time, so this is about settling near-ties fairly, not about correcting large gaps.

### 3.5 Prompts and the UI

This is how the UI stays separate from the rules (D-005). With each view, the server sends each seat the pending decisions waiting on it, as typed prompts (D-018). The client knows no rules. It only knows how to present each kind of prompt:

| Prompt | What the player does | Example |
|---|---|---|
| `pick` | Choose one component, by tapping it or dragging it to a target | Play a card from your hand onto the pile |
| `pickN` | Select between `min` and `max` components, then confirm | Discard 3 of 6; play a set of cards of equal rank |
| `place` | Drag a component onto one of the highlighted sites | Lay a tile; move a piece |
| `choose` | Tap a button | Hit or stand; pass; bet 10 |

On the phone, that looks like this:

- Dragging a card highlights every target it could go to under the current prompts. Dropping it on a target sends that choice. If more than one choice matches (e.g. play as an attack or discard), a small chooser appears.
- A gesture with no target, like flicking a card up to play it, sends the single "play this card" choice if there is exactly one.
- A card with no choices can't be dragged. Illegal moves don't get rejected; the UI gives you no way to make them.
- Out-of-turn plays work the same way. During a response window, a phone whose player isn't active simply has a prompt.

**Big choice spaces** (D-018). Small sets of choices are listed in full. Big ones are handled in one of two ways, both of which research 01 found in use (TAG, Dominion AIs, RLCard):

- a `pickN` prompt with constraints ("1–3 cards of equal rank"), where the server validates the answer when it arrives;
- splitting the choice into a sequence of smaller decisions. For example, Carcassonne placement becomes "pick a site", then "pick a rotation".

Games can ship custom renderers for special pieces, but the generic renderer should be able to play any game: ugly, but correct.

### 3.6 Determinism, logs and replays

A room is fully described by its rules version, content version, options, seats, seed and action list, including system actions. From that we can:

- rebuild any room after a server restart (D-014);
- replay a bug exactly ("send us the log");
- write tests as scripts of actions;
- later, add spectator replays, undo and bots.

Research 01 suggests some rules for the later features:

- **Undo** means replaying the log up to an earlier point. It's only safe back to the last moment when hidden information was revealed or randomness was used.
- **Bots** only see the view of the seat they play for. If they simulate ahead, they use their own random seed, so they can't learn about upcoming shuffles.
- **Replays** need the exact rules and content versions. Rooms already pin both.

Randomness (D-024, D-031; confirmed by research 04):

- **Seed:** 256 bits from the operating system's secure random source, one seed per room, never sent to clients.
- **Generator:** ChaCha20 from `@noble/ciphers`. Each named stream is keyed by HMAC-SHA256(seed, name), so streams are independent and can be scoped: round 3 deals from `shuffle/r3`.
- **Shuffle:** Fisher–Yates, drawing unbiased integers by rejection sampling, always starting from the canonical card order. A deal depends only on the seed, the round and which cards are there.
- **Version:** matches record `RNG_VERSION`, and replays refuse a mismatch.
- **Tests:** golden outputs cross-checked against OpenSSL, a statistical check that shuffles are uniform, and a scan that bans clocks and `Math.random` from rules code.

Saved replays (a seed, actions and the expected views) double as regression tests.

### 3.7 Rules as code, content as data

Proposed in [D-004](decisions.md#d-004-rules-as-code-content-as-data): rules are TypeScript modules written against a shared engine library, and content (card definitions, decks, tiles) is data. There's no rules DSL yet.

Research 01 backs this. Every broad declarative rules language it looked at hit firm limits with hidden information, arithmetic or special-effect cards: GDL, Regular Boardgames, Zillions, RECYCLE, and the card game description languages. The engines that cover many games write rules in code, sometimes with a small embedded DSL. So we start with code, and move a pattern into data only once three or more games need it. The first place that's likely to happen is card effects for the collectible family (§4).

## 4. The three families against the model

### Classic card games

- **Content:** the standard 52-card deck as a pack, with variants (jokers, stripped decks, multiple decks).
- **Library:** shuffle, deal, draw, rank orders (ace high or low, trumps), sets and runs, trick-taking, poker hand evaluation, turn rotation, betting and chips.
- **First game: 21** (D-015). It has one hidden card, simple actions (hit or stand) and a clear result. A minimal version with no betting doubles as the walking skeleton.
- **Second game: Shithead.** It tests what 21 doesn't: hidden, owner-only and public zones in one game, a simultaneous opening swap, and out-of-turn play with timers.
- **Then** (D-036, proposed; research 02): Crazy Eights/Switch (matching with special cards), Cheat (face-down claims and challenges), and Spoons (simultaneous passing and a reaction race). Each game adds one family and one new primitive.
- **House rules are options.** Research 02 found that most variants of a folk game change only two switches: which cards have special powers, and the draw and penalty rules. Each game ships those as options, with a sensible default.

### Collectible / deck-building card games

- **Content:** card sets with stats and effects. A deck is a list of card ids validated against a format (e.g. "30 cards, max 2 copies").
- **Data model:** Hearthstone's is the proven reference. Every card, player and the game itself is an entity with integer tags, and even the zone a card is in is just a tag.
- **Effects as data:** a small vocabulary of actions and selectors, as in Fireplace (`Hit(ENEMY_MINIONS, 4)`):
  - triggers: on play, on death, start of turn;
  - selectors: any enemy minion, a random friendly;
  - effects: damage, heal, draw, summon, buff.

  Triggers are written in the same vocabulary as the actions they listen for. Unique cards can escape to code.
- **Resolution order is the hard part.** Research 01 found that event ordering causes the most pain and bugs in these engines. MTG Arena's approach is the one to copy:
  - each event is proposed first;
  - card rules can then modify, replace or prevent it;
  - then it executes, and the triggers it caused are collected.

  Continuous effects (buffs, auras) are recomputed from scratch in a fixed order of layers, not patched incrementally.
- Deck building and collections mean saved decks at least, and eventually accounts. That comes later.

### Board games

- **Content:** fixed boards or placed tiles, plus pieces and tokens.
- **Geometry:** a board is a graph of sites (§3.2), which covers square and hex grids, spaces on a track, and growing maps whose sites become playable as tiles are laid.
- **Carcassonne-like tile laying:**
  - Tiles have typed edges (road, city, field) and features that span several tiles.
  - A placement is legal if its edges match the neighbouring tiles.
  - Scoring tracks features as they merge across tiles and completes them (union-find over feature segments).
  - Placement is two decisions: pick a site, then a rotation. The possible sites show as ghost positions on the screen and on the phone.
- **The shared screen shines here.** The board lives on the TV, and an admin can have it follow the active player. Each phone shows your tile, your pieces and a zoomed-in placement view.

## 5. Technology

We're using TypeScript on both server and client (D-008). The room layer runs on Colyseus with its state sync turned off (D-025, [research 08](research/08-colyseus-result.md)). The engine doesn't depend on Colyseus.

**Persistence** (D-014, D-035; research 06):

- **Now:** rooms live in memory. Every action is appended to a JSON-lines log behind a small `MatchStore` interface. Each line carries a schema version and a sequence number. Logs record seats only, never names.
- **Next:** a SQLite (WAL) store behind the same interface, with snapshots at round boundaries and rooms reloaded lazily when someone reconnects. Deploys will drain rooms rather than kill them.
- **Later:** Postgres and room routing across a few servers, then a fleet, when research 06's triggers appear.
