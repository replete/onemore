# Decisions

> A log of significant decisions, oldest first. Each entry covers context, decision and consequences. To change an accepted decision, add a new entry that supersedes it rather than editing the old one.
>
> Statuses: **Proposed** (awaiting agreement), **Accepted**, **Superseded by D-xxx**.
>
> Research that informs decisions lives in [research/](research/) (D-016).

## Pending questions

Things we still need to decide. Each one becomes a D-entry once it's decided.

- A room created on a TV makes the TV its admin, but TVs are bad at input. How does admin control get to a phone: an admin QR code on the screen, or the first phone to join? (research 03)
- Which commands can admins send to screens: follow a player, zoom, layout, anything else? (D-009)
- What's the grace period, and what's each game's default absence policy? (D-010, research 03)
- Which ruleset and variants for 21: casino Blackjack, Pontoon or home rules? Is the dealer the server or a player? Chips or no chips? Claude drafts these from existing variants; no deep research needed. (D-015)
- How do we keep reaction races (e.g. "Snap!") fair given network latency? (D-013, research 05)
- How do we open response windows without revealing that someone is able to respond? (D-013, research 05)
- Which PRNG and shuffle? (D-007, research 04)

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
- Games with huge action spaces need action templates (D-012).
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

**Status:** Accepted, 2026-09-26

**Context:** Real-time multiplayer over WebSockets, browser clients, and game authors writing rules. Go was suggested. We looked at three options:

- **TypeScript everywhere (Node or Bun server).** Shared types for actions and views, one language for authors, and rules that can run in the browser for tests and offline play.
- **Go server with a TypeScript client.** Excellent concurrency and simple deployment. But the schemas would have to be shared through codegen, and the rules couldn't run in the browser.
- **Elixir/Phoenix.** Built for many long-lived connections, but it adds a third language.

**Decision:** TypeScript on both server and client, for now. Turn-based games put little load on a server, so having one language matters more today than raw performance.

**Consequences:** Rules, server and client share one language and one set of types.

## D-009 Players, screens, spectators and admins

**Status:** Accepted, 2026-09-26

**Context:** A room has phones playing, one or more shared screens, and possibly remote viewers. Someone has to run it.

**Decision:**

- Anyone who opens the room link chooses to join as a **player** or as a **screen**. A screen is a view-only device showing the public table, and a room can have several.
- **Spectators** watch the public view through a separate link (D-011).
- **Admin** is a flag on any participant. Whoever creates the room is admin by default, and admins can make others admins.
- Admins run the room: choosing the game and options, starting it, locking it, removing participants, the absence policy (D-010) and spectating (D-011).
- Admins can also send **screen commands**, such as "follow a player". The full set is TBD.
- An interactive tablet mode (a screen that players can also touch) is a later option.

**Consequences:**

- Screen commands only change what a screen shows. They don't go through the rules or the action log.
- A room created on a TV makes the TV its admin, and TVs are bad at input. We need a way to hand admin to a phone (pending question).

## D-010 Disconnects and absent players

**Status:** Accepted, 2026-09-26

**Context:** Phones sleep and networks drop, so a player who has disappeared usually hasn't left. But a game can't wait forever.

**Decision:**

- Distinguish between **disconnected** and **left**. A disconnected player's seat is held, and they reconnect with their seat token. A player has left if they said so, or if they've been gone longer than a grace period.
- During the grace period, everyone else sees that the player is reconnecting, and nothing else changes.
- After the grace period, an **absence policy** applies. Each game sets a default, and admins can change it. The options depend on the game:
  - wait (pause the game);
  - skip their turns;
  - play a simple default action for them;
  - remove them;
  - end the game.

**Consequences:** Each rules module has to declare which absence policies it supports and what its default action is. The grace period length and each game's default policy are still pending (research 03).

## D-011 Room codes and spectator links

**Status:** Accepted, 2026-09-26

**Context:** Room ids get read aloud, typed on phones and shown as QR codes. Short codes are easy to type but also easy to guess.

**Decision:**

- Room ids are Google Meet–style codes such as `abc-def-ghi`: three groups of three lowercase letters. That gives trillions of combinations, so they can't be guessed, and they're still easy to read aloud. The exact alphabet (for example, leaving out letters that are easily confused) will come from research 03.
- Spectating is off by default. An admin can create a spectator link, and anyone with that link can watch the public view.
- The spectator link uses a different code from the room, so sharing it doesn't let anyone take a seat or join as a screen.

**Consequences:** A nine-letter code takes more typing than a four-letter one, so the QR code is the main way in. Room ids aren't secret, but guessing one isn't practical.

## D-012 Legal actions listed in full, templates when needed

**Status:** Accepted, 2026-09-26

**Context:** Under D-005, the server sends each seat its legal actions. Some games have too many to list: choosing any subset of six cards already gives 63.

**Decision:** List legal actions in full by default. When a game's action space is too big to list, the game returns action templates with constraints instead ("choose 1–3 cards of equal rank"), and the server validates what comes back. We build templates only when a real game needs them.

**Consequences:** Templates will need a second way of interacting on the client (multi-select, then confirm), but not until then.

## D-013 Interrupts and synced timers

**Status:** Accepted, 2026-09-26

**Context:** Some games let players act out of turn (burning the pile, "Snap!", responses in collectible games). That needs time limits, and every device has to agree on how much time is left.

**Decision:**

- Out-of-turn plays are legal actions for players who aren't active, offered during a **response window**. The window closes when every eligible player has passed or when its timer runs out.
- Timers belong to the room layer. Rules modules declare durations and never read a clock.
- When a timer expires, the room layer submits a system `timeout` action, which is applied and logged like any other action.
- Deadlines are sent to clients as absolute server times. Each client estimates its clock offset from ping round trips, so every device shows the same countdown.
- If interrupts race, the first valid one to reach the server wins, and the log fixes the order.

**Consequences:**

- Replays stay deterministic because timeouts come from the log, not the clock.
- Two problems are still open (research 05):
  - keeping reaction races fair given network latency;
  - opening response windows without revealing that someone is able to respond.

## D-014 Rooms in memory first

**Status:** Accepted, 2026-09-26

**Context:** Surviving restarts properly needs a real store, and that isn't an immediate problem.

**Decision:** Rooms live in server memory. Action logs are appended to disk, which helps with debugging. Once it's cheap to add, the logs will also let us rebuild rooms after a restart.

**Consequences:**

- Until rebuilding from logs works, a restart or deploy may end live games.
- Later we'll need a store built to survive restarts, probably memory backed by disk (snapshots plus log). At scale, that rewards compact formats for state and logs (research 06).

## D-015 First game is 21

**Status:** Accepted, 2026-09-26

**Context:** The first game should prove the whole loop with as little game as possible.

**Decision:** Our own take on 21. It has a shared deck, one hidden card (the dealer's), simple actions (hit or stand) and a clear result. A minimal version with no betting doubles as the walking-skeleton game.

**Consequences:**

- The ruleset and its variants are still to be written. Claude drafts them from existing variants (casino Blackjack, Pontoon, home rules). That doesn't need deep research.
- Shithead moves to second. It tests what 21 doesn't: hidden and owner-only cards on the table, a simultaneous opening and out-of-turn play.

## D-016 Research as numbered prompt and result pairs

**Status:** Accepted, 2026-09-26

**Context:** Several decisions depend on things we don't know yet, and research should stay easy to find next to the decisions it informs.

**Decision:** Research lives in [research/](research/) as numbered pairs:

- `NN-<slug>-prompt.md`: a prompt for an external deep-research tool;
- `NN-<slug>-result.md`: the report it returns.

Numbers follow the order in which topics were opened. Prompts are broad and stand alone, and they say as little as possible about One More, so the research spends its effort on the topic rather than on our design. Anything we can work out ourselves, such as the rules of 21, doesn't get a prompt.

**Consequences:** Decisions refer to research by number. When a result comes back, we review it and record what it changes here, linking to the result.
