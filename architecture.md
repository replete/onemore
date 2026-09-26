# One More: Architecture

> Living document: how the system fits together and how games are modelled. This is an early draft and much of it is **proposed**. Check the status of each decision in [decisions.md](decisions.md).

## 1. System shape

```
  Table screen (TV/tablet)            Phones (players)
          │ public view                   │ private views
          └──────────── WebSocket ────────┘
                          │
                     Game server
              ┌───────────┴────────────┐
            Rooms                  Rules modules + content packs
   (seats, connections,            (per game, versioned)
    seed, action log)
```

- **Room.** One game session. It has a short join code (e.g. four letters), a QR code pointing at `https://<host>/<code>`, seats, the chosen game and variant options, and the game state.
- **Seat.** A place at the table. A player claims one with a name and gets a **seat token**, a random secret stored in the browser, which lets them reconnect after their phone sleeps.
- **Table.** The shared screen connects as a special viewer that gets the *public* view. Whether it can also be a player (a tablet in the middle, pass-and-play) is an open question.
- **Server loop.** Receive an action from a seat, check it's legal for that seat right now, apply it, append it to the log, compute every viewer's new view, and push. That's the whole game loop.
- **Rules module.** The game logic (e.g. `shithead`), written as pure code against the engine contract (§3.1).
- **Content pack.** Data: card definitions, deck lists, tiles, boards and art, versioned by content hash. A room pins exact rules and content versions when it's created. Clients fetch assets by hash, so they can be cached forever.

### Protocol sketch

JSON over WebSocket. Every message has a `type`.

- Client → server: `hello {room, seatToken?, protocol}`, `join {name}`, `act {rev, action}`, `ping`
- Server → client: `welcome {seat, seatToken, game, versions}`, `view {rev, view, legalActions, events}`, `rejected {reason}`, `room {seats, status}`

`rev` goes up by one with each applied action. Clients send the `rev` they acted on, and the server rejects stale actions rather than guessing what was meant. Push the full view every time to start with, and move to diffs only if we need to.

## 2. Trust and security

The client is untrusted. Assume anyone can open dev tools, edit the JavaScript or write their own client.

| Threat | Defence |
|---|---|
| Seeing hidden cards (other hands, deck order) | The server never sends them. Views are computed per viewer on the server. |
| Making illegal moves | The server checks every action against `legalActions`. |
| Rigging shuffles or dice | Randomness only happens on the server, from a per-room seed. |
| Acting as another player | Seat tokens. Actions are accepted only from that seat's own connection. |
| Joining a room uninvited | Short codes are guessable, so rate-limit joins and let the host lock the room and remove seats. |
| Players showing each other their phones | Not our problem, same as with real cards. |

About everyone needing the same package: pinning versions keeps clients **compatible** (same rules, same card art). It isn't what keeps the game **fair**. Because the server is authoritative, a modified client can only change what it displays, or send actions that the server rejects.

## 3. The game model

This is the hard, interesting part, and the part we'll revise most.

### 3.1 The engine contract

Every game implements the same small interface, and everything else is helpers.

```ts
interface GameModule<State, Action> {
  id: string;                                       // "shithead"
  version: string;
  setup(ctx: SetupContext): State;                  // seats, options, content, rng
  legalActions(state: State, seat: SeatId): Action[];
  apply(state: State, action: Action, ctx: ApplyContext): { state: State; events: GameEvent[] };
  view(state: State, viewer: Viewer): View;         // what this seat (or the table) may see
  outcome(state: State): Outcome | null;            // null while the game is in progress
}
```

It has three properties:

- **Deterministic.** The same seed and the same actions always produce the same game. All randomness goes through the RNG passed in by the engine.
- **Pure.** No I/O, no clocks, no globals. That makes it easy to test, to replay and to run anywhere.
- **Events alongside state.** `apply` also returns what happened ("seat 2 drew a card", "7♥ moved from hand to pile") so clients can animate it. Events are redacted per viewer, just like views: others see "Sam drew a card", Sam sees "you drew the 7♥".

This shape is deliberately close to boardgame.io, OpenSpiel and Board Game Arena.

### 3.2 Vocabulary

- **Component.** A physical-ish thing: a card, tile, piece, token or die. It has a *definition* (what it is, e.g. "7 of hearts" or "road-city tile") and *instances* (this particular copy, with its own id).
- **Zone.** Where components live: deck, hand, discard pile, tableau, board cell, bag or supply. A zone has an owner (a seat, or none), is ordered or unordered, and has a visibility (§3.3).
- **Board.** A zone with geometry: a square grid, a hex grid, a graph of spaces, or an unbounded grid that grows as tiles are laid.
- **Seat / player.** A participant. A **viewer** is a seat, the table (public view) or a spectator.
- **Turn / phase / step.** The structure of play (§3.4).
- **Action.** Something a seat may do: `{ type, component?, from?, to?, params? }`.
- **Event.** Something that happened, used for animation and logs.
- **View.** The redacted state for one viewer.
- **Content pack.** Definitions plus assets. **Rules module:** code. **Variant:** options on a rules module (e.g. "jokers wild", "tens burn the pile").

### 3.3 Visibility

Hidden information is what separates a card game from a board, so visibility is built into the model from the start.

Each zone has a default visibility, and individual components can override it (face up or face down):

- `public`: everyone sees it.
- `owner`: only the owning seat sees it. Everyone else sees a card back.
- `hidden`: nobody sees it, not even the owner (a face-down deck, Shithead's face-down cards).
- `count`: others see only how many there are (an opponent's hand size).
- `top`: only the top component is visible (a discard pile in some games).

Shithead as an example: the deck is `hidden` (count shown), each hand is `owner`, the three face-down table cards are `hidden`, the three face-up table cards are `public`, and the pile is `public`. The table screen gets the public view and each phone gets its own seat's view.

Game-specific exceptions (peeking, or showing a card to one player) use a "known to" set on the instance, which the view function respects.

### 3.4 Flow: turns, phases and simultaneous play

Flow is modelled as a state machine, like Board Game Arena's. Each state says who is active and which action types are allowed. The common shapes are:

- **Strict turn order.** Most games.
- **Simultaneous.** Everyone acts, and the state moves on once they all have (Shithead's opening swap, drafting, bidding).
- **Out-of-turn interrupts.** Someone may act during another player's turn (burning with four of a kind, "Snap!", instant-speed responses in collectible games). This is the hard case, and it probably needs an explicit "response window" concept rather than one-off exceptions.

### 3.5 Legal actions and the UI

This is how the UI stays separate from the rules. With each view, the server sends that seat's legal actions. The client knows no rules. It maps the legal actions onto what's on screen:

- When a card is picked up or dragged, highlight every zone or component that's a `to` target of a legal action involving that card.
- When it's dropped on a target and exactly one legal action matches (component plus target), send that action. If several match (e.g. play as an attack or discard), show a small chooser.
- A gesture with no target, like flicking a card up to play it, sends the single "play this card" action if there is exactly one.
- Actions that don't involve a component (pass, stick, bet 10) become buttons.
- If a card has no legal actions, it can't be dragged. Illegal moves don't get rejected; the UI gives you no way to make them.

**Open issue:** some games have too many legal actions to list in full. Choosing any subset of six cards is already 63 options. Carcassonne tile placement (open positions × 4 rotations) is usually fine. The likely answer is action *templates* with constraints ("choose 1–3 cards of equal rank") that are validated on submit. We'll decide when a real game needs it.

Games can ship custom renderers for special pieces, but the generic renderer should be able to play any game: ugly, but correct.

### 3.6 Determinism, logs and replays

A room is fully described by its rules version, content version, options, seats, seed and action list. From that we can:

- rebuild any room after a server restart, which gives us persistence cheaply;
- replay a bug exactly ("send us the log");
- write tests as scripts of actions;
- later, add undo (where the game allows it), spectator replays and bots.

### 3.7 Rules as code, content as data

Proposed in [D-004](decisions.md#d-004-rules-as-code-content-as-data): rules are TypeScript modules written against a shared engine library, and content (card definitions, decks, tiles) is data. There's no rules DSL yet. When the same pattern shows up in several games, it becomes a library helper. The first place a small effect language is likely to pay off is authoring card effects at volume for the collectible family.

## 4. The three families against the model

### Classic card games

- **Content:** the standard 52-card deck as a pack, with variants (jokers, stripped decks, multiple decks).
- **Library:** shuffle, deal, draw, rank orders (ace high or low, trumps), sets and runs, trick-taking, poker hand evaluation, turn rotation, betting and chips.
- **First target: Shithead.** It has hidden, owner and public zones in one game, a simultaneous opening, special cards and out-of-turn play, which makes it a good stress test at a small size.

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
  - The server sends legal placements, which show as ghost positions on the table and on the phone.
- **The shared table screen shines here.** The board lives on the TV, while each phone shows your tile, your pieces and a zoomed-in placement view.

## 5. Technology

Undecided; see [D-008](decisions.md#d-008-technology-stack). The current leaning is TypeScript on both server and client. That gives game authors one language and shared types for actions and views, and lets rules modules also run in the browser (for tests, and for offline or pass-and-play). Go is the strongest alternative: a single binary and great concurrency. But turn-based games put very little load on a server, and we'd lose the shared types and code. Keeping the server a thin layer of rooms and sockets makes this choice cheap to revisit.
