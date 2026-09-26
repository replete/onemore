# Decisions

> A log of significant decisions, oldest first. Each entry covers context, decision and consequences. To change an accepted decision, add a new entry that supersedes it rather than editing the old one.
>
> Statuses: **Proposed** (awaiting agreement), **Accepted**, **Superseded by D-xxx**.

## Pending questions

Things we still need to decide. Each one becomes a D-entry once it's decided.

- Tech stack: see D-008.
- Does the table screen ever act as a player (a tablet in the middle of the table, pass-and-play)?
- Who controls the room: the table screen that created it, or the first phone to join?
- What happens when a player leaves mid-game: wait, hand the seat to a bot, or end the game?
- Spectators: are they allowed, and do they get only the public view?
- Big action spaces: action templates or full enumeration? ([architecture §3.5](architecture.md#35-legal-actions-and-the-ui))
- How do out-of-turn interrupts and response windows work? ([architecture §3.4](architecture.md#34-flow-turns-phases-and-simultaneous-play))
- Hosting and persistence: keep rooms in memory with action logs on disk to start?
- Which game do we build end to end first?

---

## D-001 Root working documents

**Status:** Accepted, 2026-09-26

**Context:** The project is still mostly ideas. We need a shared place for them that stays current.

**Decision:** Keep four living documents at the project root:

- [vision.md](vision.md): what and why.
- [architecture.md](architecture.md): how, including the game model.
- decisions.md: this log.
- [tasks.md](tasks.md): what's next.

**Consequences:** The docs get updated as part of the work, not afterwards. Decisions change through new entries, not by rewriting old ones.

## D-002 Server-authoritative game state

**Status:** Accepted, 2026-09-26

**Context:** Card games depend on hidden information, and clients run on players' own phones where they can be modified.

**Decision:** The server holds the only real game state. It runs the rules, owns all randomness and sends each viewer only what that viewer may see. Clients send requests to act.

**Consequences:**

- Modifying the client can only change what it displays, or produce actions the server rejects.
- Every action is a round trip to the server, which is fine for turn-based games.
- No peer-to-peer or client-hosted games.

## D-003 No accounts to start

**Status:** Accepted, 2026-09-26

**Context:** Joining has to be instant, and accounts add both friction and scope.

**Decision:** Players join with a room code and a display name. A random seat token stored in the browser lets them reconnect. No accounts, profiles or federation for now.

**Consequences:** No persistent stats, friends or saved decks. Deck building for collectible games will need decks saved locally at least, and eventually accounts. We'll revisit this then.

## D-004 Rules as code, content as data

**Status:** Proposed

**Context:** The goal is to make games easy to build. There are two options:

- (a) each game is code written against a shared engine library;
- (b) games are described in a data DSL, as Ludii and GDL do.

A DSL is powerful, but it's a big project in its own right, and designing one before we've built any games would be guesswork.

**Decision:** Rules modules are code. Content (cards, decks, tiles, boards) is data. Shared behaviour moves into an engine library once it has proved itself. A small effect language may follow for collectible card effects.

**Consequences:** Game authors have to be programmers for now, but we get to a first game faster. Revisit after about three games.

## D-005 Clients are rules-agnostic; server sends legal actions

**Status:** Proposed

**Context:** The UI needs to know where a dragged card can go. Duplicating the rules on the client would cause drift and bugs.

**Decision:** With every view, the server sends that seat's legal actions. The client turns them into drag targets, buttons and choosers, and never evaluates rules itself. See [architecture §3.5](architecture.md#35-legal-actions-and-the-ui).

**Consequences:**

- A generic UI can play any game.
- Games with huge action spaces will need action templates (still an open question).
- Game-specific renderers are optional polish.

## D-006 Build concrete games before generalising

**Status:** Proposed

**Context:** The value is in the reusable engine, which makes it tempting to design the engine first.

**Decision:** Build real games, and extract shared machinery only when a second or third game needs it. The engine's design follows the games.

**Consequences:** Early code will contain duplication, and that's expected. [architecture.md](architecture.md) records patterns as they emerge.

## D-007 Deterministic engine: seed + action log

**Status:** Proposed

**Context:** Multiplayer games with hidden information are hard to debug, and a server restart shouldn't kill live rooms.

**Decision:** Rules are pure and deterministic. All randomness comes from a seeded RNG, one per room. A room is persisted as its versions, options, seats, seed and action log.

**Consequences:**

- Exact replays for bug reports and tests.
- Cheap persistence.
- Later: undo, replays and bots.
- Rules code can only use time, randomness and I/O through the context the engine provides.

## D-008 Technology stack

**Status:** Proposed. Leaning towards TypeScript everywhere.

**Context:** Real-time multiplayer over WebSockets, browser clients, and game authors writing rules. Go has been suggested.

**Options:**

- **TypeScript everywhere (Node or Bun server).** Shared types for actions and views, one language for authors, and rules that can run in the browser for tests and offline play.
- **Go server with a TypeScript client.** Excellent concurrency and simple deployment. But the schemas would have to be shared through codegen, and the rules couldn't run in the browser.
- **Elixir/Phoenix.** Built for many long-lived connections, but it adds a third language.

**Leaning:** TypeScript everywhere. Turn-based games put little load on a server, so having one language matters more than raw performance.

**Consequences:** To be written when this is accepted.
