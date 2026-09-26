# Decisions

> A log of significant decisions, oldest first. Each entry covers context, decision and consequences. To change an accepted decision, add a new entry that supersedes it rather than editing the old one.
>
> Statuses: **Proposed** (awaiting agreement), **Accepted**, **Superseded by D-xxx**.
>
> Research that informs decisions lives in [research/](research/) (D-016).

## Pending questions

Things we still need to decide. Each one becomes a D-entry once it's decided.

- Fixed-pace response windows? (D-037, proposed)
- The card game order after Carcass Eon. (D-036, proposed)
- Carcass Eon: theme, tile counts, player count, and leaving fields out of v1. (See [games/carcass-eon/DESIGN.md](games/carcass-eon/DESIGN.md#open-questions).)
- Carcass Eon art: textures in procedural shapes, or whole-tile illustrations? Decide after the WaveSpeed trial. (D-038)
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

**Status:** Accepted, 2026-09-26

**Context:** The goal is to make games easy to build. There are two options:

- (a) each game is code written against a shared engine library;
- (b) games are described in a data DSL, as Ludii and GDL do.

A DSL is powerful, but it's a big project in its own right, and designing one before we've built any games would be guesswork.

**Decision:** Rules modules are code. Content (cards, decks, tiles, boards) is data. Shared behaviour moves into an engine library once it has proved itself. A small effect language may follow for collectible card effects.

**Consequences:** Game authors have to be programmers for now, but we get to a first game faster. Revisit after about three games.

**Research:** [research 01](research/01-game-modelling-result.md) supports this. Every broad declarative rules language it looked at (GDL, Regular Boardgames, Zillions, RECYCLE) hit firm limits with hidden information, arithmetic or special-effect cards. The engines that cover many games write rules in code, sometimes with a small embedded DSL.

## D-005 Clients are rules-agnostic; server sends legal actions

**Status:** Accepted, 2026-09-26

**Context:** The UI needs to know where a dragged card can go. Duplicating the rules on the client would cause drift and bugs.

**Decision:** With every view, the server sends that seat's legal actions. The client turns them into drag targets, buttons and choosers, and never evaluates rules itself. See [architecture §3.5](architecture.md#35-prompts-and-the-ui).

**Consequences:**

- A generic UI can play any game.
- Games with huge action spaces need action templates (D-012).
- Game-specific renderers are optional polish.

**Research:** [research 01](research/01-game-modelling-result.md) supports this. Hearthstone's server sends "Options" with their targets, so whether a card can be played "is entirely determined by the server". OpenSpiel, TAG and PettingZoo all expose an explicit list of legal actions. D-018 proposes the form these take.

## D-006 Build concrete games before generalising

**Status:** Accepted, 2026-09-26

**Context:** The value is in the reusable engine, which makes it tempting to design the engine first.

**Decision:** Build real games, and extract shared machinery only when a second or third game needs it. The engine's design follows the games.

**Consequences:** Early code will contain duplication, and that's expected. [architecture.md](architecture.md) records patterns as they emerge.

**Research:** [research 01](research/01-game-modelling-result.md) found the same thing. CardStock's authors wrote that "many of our earlier choices for the language proved to be ad-hoc and unable to generalize". The report recommends promoting a pattern into shared machinery only once three or more games need it.

## D-007 Deterministic engine: seed + action log

**Status:** Accepted, 2026-09-26

**Context:** Multiplayer games with hidden information are hard to debug, and a server restart shouldn't kill live rooms.

**Decision:** Rules are pure and deterministic. All randomness comes from a seeded RNG, one per room. A room is persisted as its versions, options, seats, seed and action log.

**Consequences:**

- Exact replays for bug reports and tests.
- Cheap persistence.
- Later: undo, replays and bots.
- Rules code can only use time, randomness and I/O through the context the engine provides.

**Research:** [research 01](research/01-game-modelling-result.md) supports this. Every system it looked at that covers many games has a seeded, logged stream of actions. Examples are boardgame.io's seed, Ludii's `Trial` and Hearthstone's replay packet stream. Replays also need the exact rules and content versions, and rooms already pin both.

## D-008 Technology stack

**Status:** Accepted, 2026-09-26

**Context:** Real-time multiplayer over WebSockets, browser clients, and game authors writing rules. Go was suggested. We looked at three options:

- **TypeScript everywhere (Node or Bun server).** Shared types for actions and views, one language for authors, and rules that can run in the browser for tests and offline play.
- **Go server with a TypeScript client.** Excellent concurrency and simple deployment. But the schemas would have to be shared through codegen, and the rules couldn't run in the browser.
- **Elixir/Phoenix.** Built for many long-lived connections, but it adds a third language.

**Decision:** TypeScript on both server and client, for now. Turn-based games put little load on a server, so having one language matters more today than raw performance.

**Consequences:** Rules, server and client share one language and one set of types.

## D-009 Players, screens, spectators and admins

**Status:** Accepted, 2026-09-26. Partly superseded by D-020: admins now choose which devices are screens.

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

**Status:** Superseded by D-018.

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

## D-017 Flow as phases plus a stack of pending decisions

**Status:** Accepted, 2026-09-26

**Context:** A turn-based state machine alone struggles with several common situations:

- everyone choosing at once;
- "everyone else discards a card" in the middle of someone's turn;
- out-of-turn responses (D-013);
- chains of effects.

[Research 01](research/01-game-modelling-result.md) found that most engines which handle card games add a stack of pending decisions on top of their phases. Examples are TAG's `IExtendedSequence`, BGA's `MULTIPLE_ACTIVE_PLAYER` states, boardgame.io's stages and Hearthstone's blocks.

**Decision:** Flow has two layers. Phases, turns and steps form a state machine for the overall shape of the game. On top of that sits a stack of **pending decisions**, kept in the game state. Each decision has:

- the seats it's waiting on;
- a mode: `one` (a single seat decides), `each` (every seat answers) or `any` (the first answer wins);
- a typed prompt (D-018);
- an optional timer, as a duration.

Answering a decision can push more decisions on top. A decision can also be **non-blocking**: it sits alongside the stack instead of on top, so play carries on around it (D-023). The engine contract replaces `legalActions` and `timers` with `decisions(state)`. See [architecture §3.4](architecture.md#34-flow-phases-pending-decisions-and-timers).

**Consequences:**

- Turn order, simultaneous play, response windows and effect chains all use one mechanism.
- Timers attach to decisions, so a `timeout` always names the decision it ends.
- Simple games pay a small cost: 21 is mostly a single `one` decision at a time.

## D-018 Legal actions as typed prompts

**Status:** Accepted, 2026-09-26. Supersedes D-012.

**Context:** Under D-005, the server tells each seat what it can do, and the client turns that into interactions. A flat list of actions leaves the client to work out how to present them, and it breaks down for big choices. [Research 01](research/01-game-modelling-result.md) found two working approaches to big choices:

- typed selection prompts, such as a Dominion AI's `SelectCards(source, min, max)`;
- splitting a big choice into sequential sub-decisions, such as TAG's advice to treat "discard 3 of 6" as three decisions.

**Decision:** Each pending decision carries a typed prompt:

- `pick`: one component, optionally with a target;
- `pickN`: between `min` and `max` components, with constraints;
- `place`: a component onto one of a set of sites;
- `choose`: one of a set of named options, shown as buttons.

Small sets of choices are listed in full. A big choice uses either `pickN` with constraints, validated on submit, or a sequence of smaller decisions (e.g. Carcassonne: pick a site, then a rotation). The server only accepts an action if it answers a current pending decision and comes from a seat that decision is waiting on. See [architecture §3.5](architecture.md#35-prompts-and-the-ui).

**Consequences:**

- The client needs to handle only four prompt types, whatever the game.
- New prompt types get added only when a real game needs one.

## D-019 Don't build on boardgame.io

**Status:** Accepted, 2026-09-26

**Context:** boardgame.io is the TypeScript framework closest to our design. [Research 07](research/07-boardgame-io-result.md) evaluated it against our architecture, using its source, its issues and a live test.

**Decision:** Build our own engine and room layer. Borrow boardgame.io's ideas where they fit: phase, turn and stage presets, a single `playerView` projection, `stateID` for stale moves, redacted log entries, and the storage adapter interface.

**Consequences:**

- We avoid its hidden-information leaks, which we confirmed in the live test:
  - every client, including spectators with no credentials, receives the unfiltered starting state: the deck order, all hands, and the seed and generator state;
  - the default seed is the match creation time, which the public lobby API returns.
- We avoid working around a model that lacks prompts, a decision stack and timers.
- We also avoid depending on a framework whose last release was in November 2022.
- We have to write the room server, the flow presets and the storage ourselves. For small, turn-based rooms, that's modest work.
- Lesson for our own design: test *every* message that goes over the wire for leaks, including the first sync, not just views.

## D-020 Admins, shared screens and lobby approval

**Status:** Accepted, 2026-09-26. Updated the same day: the admin QR code and the lobby default.

**Context:** D-009 left two questions open. How does admin control reach a phone when a room is created on a TV? And what can admins do to screens?

**Decision:**

- **Admin controls.** Whoever creates a room starts as its admin. Admins see **Start game**, **Game options** and **Make this the shared screen**.
- **Shared screens.** An admin can turn their own device into the shared screen, or turn any connected client into one. People joining no longer pick "screen" themselves, which supersedes that part of D-009.
- **Admin QR code.** A separate admin QR code joins whoever scans it as an admin. The shared screen shows it on the join screen, before the game starts. During the game it isn't shown, and admins are marked as admins, so everyone can see who they are.
- **Lobby approval.** An optional room setting makes admins approve each person before they join. It's off by default.
- **Screen commands.** Admins control a screen's **layout**. Each game defines which layouts it offers, with defaults for each family of games.

**Consequences:** The usual flow for creating a room on a TV:

1. Create the room on the TV.
2. Tap "Make this the shared screen".
3. Scan the admin QR code with a phone.

Creating a room on a phone and then opening the link on a TV works too: the admin makes the TV the shared screen from their phone.

## D-021 21: server dealer, variations as options

**Status:** Accepted, 2026-09-26

**Context:** D-015 left the 21 variant open.

**Decision:**

- The server is the dealer. A player as dealer can be added later as an option.
- 21 ships as one base game, with its variations as game options (for example, Pontoon-style rules or chips).
- Claude writes the rules and the variations from existing games.

**Consequences:** The minimal walking-skeleton version is the base game, without options.

## D-022 Fair first-response

**Status:** Accepted, 2026-09-26, as a direction that still has to be proven in testing. Details refined by D-032.

**Context:** When several players answer the same `any` decision (e.g. "Snap!"), the first answer to reach the server wins (D-013). That favours players with faster connections.

**Decision:**

- **Measure.** The server keeps measuring each client's latency from pings.
- **Compensate.** When answers arrive close together, the server orders them by arrival time minus each client's estimated one-way latency.
- **Make it an option.** This is a room option, **Fair first-response**, on by default for games with reaction races.

Claude added three safeguards:

- **Cap the compensation** at around 150 ms. Otherwise a client could gain by faking slow pings.
- **Estimate latency from a low percentile** of recent round trips, not the average, because phones on Wi-Fi have power-saving spikes.
- **Wait briefly before deciding.** After the first answer, the server waits for the length of the cap so later answers with more compensation can still win.

**Consequences:**

- Every race takes up to the length of the cap to resolve.
- We prove it with tests that use Colyseus's simulated latency (research 08) and with real phones. Research 05 may suggest better approaches.

## D-023 Response windows: non-blocking by default

**Status:** Accepted, 2026-09-26

**Context:** A window that opens only when somebody *could* respond tells everyone that somebody can (D-013). But a window after every event slows the game down.

**Decision:**

- **Non-blocking interrupts by default.** Play doesn't pause. The out-of-turn choice is offered alongside the normal turn to every seat that's eligible by public information, and the first valid claim wins (D-022). Prompts are private, and nothing on the shared screen changes, so nobody learns who could have responded. This covers Snap, cut-ins and burns in Shithead, and most casual card games.
- **Blocking windows only where the rules need a pause,** such as counter-spells in a collectible game. Whether a window opens must depend only on public information. It opens after every event of a type that anything in the game could respond to, for every eligible seat, whether or not they hold a response. It runs for a fixed, short time. It closes early only if every seat has passed by hand.
- **No auto-pass by default,** because auto-passing reveals who couldn't respond. A game can opt into auto-pass for speed where the leak doesn't matter.

**Consequences:** Pending decisions get a `blocking` flag. Non-blocking decisions sit alongside the stack rather than on top of it (D-017). Research 05 may refine the timings.

## D-024 Randomness: ChaCha20 with a 256-bit seed

**Status:** Accepted, 2026-09-26. Confirmed by research 04; details refined by D-031.

**Context:** We need randomness that can't be predicted and that replays exactly (D-007). Fortuna (used on an earlier project) keeps reseeding itself from pools of new randomness. That's good for unpredictability, but it means a game could never be replayed from its seed.

**Decision:**

- **Seed.** Each room gets 256 bits from the operating system's secure random source (`crypto.getRandomValues`). The seed never leaves the server. 256 bits is more than the roughly 2^226 possible orders of a 52-card deck.
- **Generator.** ChaCha20 (RFC 8439), keyed by the seed. This is Fortuna's generator without the reseeding: a cipher in counter mode, keyed by a secret. It's cryptographically strong, so seeing a lot of cards doesn't let anyone work backwards to the generator's state.
- **Library.** `@noble/ciphers`, which is pure TypeScript and independently audited, rather than our own implementation.
- **Streams.** Each purpose (the deck, bots and so on) gets its own stream, using a different nonce. Adding a random call in one place then doesn't shift every later result.
- **Shuffle.** Fisher–Yates, drawing unbiased integers by rejection sampling.

**Consequences:** It's deterministic and replayable, and the speed is irrelevant at card-game volumes. Research 04 may still change the details.

## D-025 Colyseus for the room layer, without its state sync

**Status:** Accepted, 2026-09-26. Claude made this decision, as you asked.

**Context:** [Research 08](research/08-colyseus-result.md) evaluated Colyseus for rooms, joining, reconnection and timers. The rules engine stays ours (D-019).

**Decision:** Use Colyseus rooms for these:

- Meet-style codes, set as the room id;
- joining;
- `onDrop`, `allowReconnection` and `onReconnect` for grace periods;
- `clock` for decision timers;
- `onAuth` for admin codes and lobby approval;
- message validation and rate limits.

Turn off its state sync (no `@colyseus/schema` or `StateView`), and send each viewer the view our engine computes as a plain message. Keep Colyseus behind a thin adapter in the server package.

**Consequences:**

- We write less of the room layer, and get scaling across processes (Redis) and graceful shutdown for later.
- Hiding information stays entirely in our engine.
- Colyseus is still pre-1.0, so expect API changes between versions. The adapter contains them.
- Restoring rooms after a restart is still ours to build, from the action log (D-014).

## D-026 Absence and reconnection

**Status:** Accepted, 2026-09-26. Claude made this decision, as you asked, based on [research 03](research/03-join-and-reconnect-result.md).

**Context:** D-010 left the grace period and the default absence policies open. Research 03 found three things:

- Phones drop their connection constantly. iOS closes the WebSocket as soon as the screen locks or the player switches apps, and Android Chrome freezes background pages after 1–5 minutes.
- Players' top complaint about Jackbox is waiting for absent players' timers to run out.
- What players find fair is that the game carries on without someone who's absent, and a player who comes back gets their seat and score back.

**Decision:**

- **Seats are held for the whole game.** A disconnected player can always come back to their seat and score. A player has only *left* if they say so or an admin removes them. We use Colyseus's `"manual"` reconnection mode for this (D-025).
- **The game doesn't wait long.** When a decision is waiting on an absent player, everyone sees "Sam is reconnecting…", and the player gets a **60-second grace period**. After that, the game plays that decision's **default action** for them. Each game defines its default actions: in 21 it's *stand*. After the first auto-play, their later decisions are auto-played straight away until they come back.
- **Admins can act sooner.** At any time, an admin can skip a waiting player, end a timer early, switch the absence policy (wait, auto-play or remove), or remove a player.
- **In the lobby,** seats are held until the game starts. If someone is still away at the start, the admin can start without them, and they can join at the next point the game allows.
- **If no admin is connected for 2 minutes,** admin passes to the player who has been connected longest.
- **A shared screen dropping doesn't pause anything.** Phones show their own decisions and deadlines, and the screen reconnects by itself.
- **If everyone leaves, the room is kept for 15 minutes,** then closed.
- **If the reconnect token is lost,** for example in a private tab or the iOS Code Scanner's separate web view, the player sees "Are you Sam? Rejoin". An admin approves the request.
- **On the client:**
  - The reconnect token is stored in localStorage and in an HttpOnly cookie.
  - The client reconnects straight away when the page becomes visible again (`visibilitychange`, `pageshow` with `persisted`, `resume` and `online`), rather than waiting for `onclose`.
  - An app-level heartbeat treats a missed pong as a dead connection.
  - The client asks for a screen wake lock after the first tap, asks again whenever the page becomes visible, and shows a "keep your screen on" hint if the wake lock is refused.

**Consequences:**

- Every rules module declares a default action for each kind of decision (see D-010).
- The 60-second grace period and 15-minute room lifetime are starting values, to be tuned by playing.

## D-027 Room code alphabet

**Status:** Accepted, 2026-09-26. Completes D-011, based on [research 03](research/03-join-and-reconnect-result.md).

**Context:** D-011 chose Meet-style codes (`abc-def-ghi`) and left the alphabet to research 03. Research 03 found:

- the common practice is dropping easily confused characters;
- a no-vowels alphabet avoids spelling real words;
- rate-limiting code lookups is what stopped Jackbox's codes from being brute-forced.

**Decision:**

- **The alphabet is 19 consonants,** `bcdfghjkmnpqrstvwxz`: no vowels, and no `l`. Three groups of three give about 3 × 10^11 codes.
- **Input is forgiving.** Codes are case-insensitive, hyphens are optional, and the code is shown under the QR code.
- **Bad codes are redrawn:** on a match against a small blocklist, and on a collision with an active room.
- **Code lookups are rate-limited** per IP address.

**Consequences:** The codes can't spell words, can't be guessed, and are still easy to read aloud one letter at a time.

## D-028 Client and tooling

**Status:** Accepted, 2026-09-26

**Context:** D-008 chose TypeScript. The client framework and tooling were still open.

**Decision:**

- **Client:** Svelte with Vite. The screen and the phone are two views in one app.
- **Server:** Node LTS running Colyseus (D-025).
- **Repo:** a pnpm workspace with separate packages: `engine`, `games/*`, `server` and `client`.
- **Tests:** Vitest.

**Consequences:** The engine package has no dependency on Colyseus or Svelte, so rules stay pure and can be tested on their own.

## D-029 No profanity filter for names

**Status:** Accepted, 2026-09-26

**Context:** Research 03 found that Jackbox and Kahoot filter names, but those games are often streamed to strangers. One More is for people in the same room.

**Decision:** No profanity filter for names. Names are limited to 16 characters, and admins can remove players.

**Consequences:** Revisit this if remote play or streaming arrives.

## D-030 Default ports

**Status:** Accepted, 2026-09-26

**Context:** The defaults (Colyseus 2567, Vite 5173) clash with other apps in development.

**Decision:** The web client runs on **5550** and the game server on **5551**. Vite uses `strictPort`, so it fails rather than moving to another port. The server's port can still be set with `PORT`.

**Consequences:** The client finds the server at `<same host>:5551` unless `VITE_SERVER_URL` is set.

## D-031 Randomness details

**Status:** Accepted, 2026-09-26. Refines D-024, based on [research 04](research/04-shuffling-and-fairness-result.md).

**Context:** Research 04 confirmed D-024: ChaCha20, a 256-bit seed from the OS, `@noble/ciphers`, and Fisher–Yates with rejection sampling. Every real shuffle failure it found came from one of three causes: a biased algorithm, a guessable seed, or streams wired together carelessly (Slay the Spire). It recommends:

- independent keys per stream;
- a fresh shuffle each hand, from a canonical order;
- recording the algorithm version;
- testing the dealt output, not just the generator.

**Decision:**

- **Per-stream keys.** Each stream's key is HMAC-SHA256(seed, stream name), using `@noble/hashes`. Streams can be scoped: 21 shuffles round 3 from `shuffle/r3`. Extra draws in one stream or round never shift another.
- **Canonical order.** Before every shuffle, the zone is put back in canonical order, so a deal depends only on the seed, the scope and which cards are there.
- **Version.** Matches record `RNG_VERSION` (`chacha20-hmac-v1`), and replays refuse a mismatch.
- **Tests:**
  - golden outputs for a fixed seed, cross-checked against Node's OpenSSL ChaCha20;
  - a statistical check over 60,000 shuffles that every card is equally likely in every position;
  - a check that rules code never uses `Math.random`, `Date.now`, `new Date`, `performance.now` or `crypto`.

**Consequences:**

- Changing the generator means bumping `RNG_VERSION`, and old logs then won't replay.
- Later, if players suspect a rigged shuffle, we can add a "verify this game" option. The server publishes SHA-256 of the seed at the start and reveals the seed at the end, so anyone can replay the shuffle.

## D-032 Fair first-response, refined

**Status:** Accepted, 2026-09-26. Refines D-022, based on [research 05](research/05-timers-and-interrupts-result.md). Still to be proven with real phones.

**Context:** Research 05 found that in one room, the differences in network delay are far smaller than the differences in human reaction time. Client timestamps can be forged, as Lichess found. Rewinding time the way shooters do is overkill for a card game.

**Decision:**

- **The first valid claim wins,** with a short collection window of about **120 ms** from the first valid claim to settle near-ties.
- **Near-ties are ranked by arrival time minus half the round trip,** using round trips the server measures itself (low percentile of recent pings). Client timestamps are never trusted.
- **Exact ties go to seat order.**
- **Show the margin** ("Alex by 45 ms"). Visible fairness matters more than millisecond accuracy.
- **Reaction moments start at an announced server time,** and a claim that arrives impossibly early counts as a false start.
- **Fair first-response stays a room option,** on by default for reaction games.

**Consequences:** Every race resolves within about 120 ms of the first claim. We need server-side round-trip tracking, which comes with clock sync (D-033).

## D-033 Clock sync and deadlines

**Status:** Accepted, 2026-09-26. Implements D-013, based on [research 05](research/05-timers-and-interrupts-result.md).

**Decision:**

- **Clock sync.**
  - On connect, the client sends 8–10 app-level pings about 100 ms apart. The server answers pings before anything else.
  - The client's offset is the median of the lowest-round-trip quarter of samples, using `performance.now()` rather than `Date.now()`.
  - It re-syncs every 15–30 seconds, when the page becomes visible, and after reconnecting. Samples with a round trip over twice the best are ignored.
  - The server keeps each client's round trip, for tie-breaks (D-032).
  - The pings double as the app-level heartbeat from D-026.
- **Countdowns.** The server sends absolute deadlines. Clients draw them every animation frame, blend corrections over about 300 ms, and never count back up without saying why.
- **Deadlines on the server.** An action is accepted if it arrives by the deadline plus a grace of min(150 ms, RTT/2 + 50 ms), with a capped amount of grace per round. Late actions are rejected with a clear message ("Too late by 0.3 s").

**Consequences:** Expected clock error in one room is about 2–20 ms, well below what anyone can see in a countdown.

## D-034 Turn timers are an optional game setting

**Status:** Accepted, 2026-09-26

**Context:** Research 05 found that casual players tolerate short, visible, forgiving timers, but hate waiting on someone stalling. People in the same room can just nudge each other.

**Decision:** Turn timers are a setting that each game may support, off by default. Admins switch them on in **Game options** (for example 60 seconds, with a visible rope in the last 15). The absence rules (D-026) still cover disconnected players either way.

**Consequences:** Rules modules declare whether they support a turn timer and what happens when it runs out, e.g. a default action (D-013, D-026).

## D-035 Persistence, stage 0

**Status:** Accepted, 2026-09-26. Refines D-014, based on [research 06](research/06-session-persistence-result.md).

**Context:** Research 06 recommends keeping rooms in memory with an append-only action log and snapshots. Its staged plan starts with one server and SQLite in WAL mode, then Postgres and room routing across a few servers, then a fleet. It lists what's expensive to change later: log schema versioning, a deterministic reducer, room-local ids, no personal data in logs, a storage interface, and sequence numbers.

**Decision:**

- **Now:**
  - JSON-lines files behind a small `MatchStore` interface;
  - every line has a schema version (`v`), and every action has its sequence number (`seq`);
  - seats only, never names or IPs.
- **Next,** when rooms need to survive restarts:
  - a SQLite (WAL) store behind the same interface;
  - snapshots at round boundaries;
  - rooms reloaded lazily when a player reconnects;
  - deploys that drain rooms rather than kill them.
- **Later:** stages 1 and 2 of research 06's plan, when the triggers it lists appear.

**Consequences:**

- A restart still ends live games until the SQLite stage.
- Logs can be deleted freely, because they contain no personal data.

## D-036 Game roadmap

**Status:** Accepted, 2026-09-26, in part. Carcass Eon comes next (your call). The card game order after it is still proposed.

**Context:** [Research 02](research/02-card-game-families-result.md) mapped card games into about fifteen families built from a few recurring primitives. It found that most variants of folk games change only two switches: the special-card table, and the draw and penalty rules. Its shortlist for casual groups of 2–8 with newcomers is Cheat, Crazy Eights/Switch, Spoons/Pig, Shithead, Pontoon, Go Fish, President and Knockout Whist.

**Decision:**

- **The order:**
  1. 21: banking (minimal version done).
  2. **Carcass Eon**: our take on Carcassonne-style tile laying (D-038).
  3. Then card games, still proposed: Shithead (beating: hidden table cards, out-of-turn burns), then Crazy Eights/Switch (matching), then Cheat (bluffing and challenges), then Spoons (simultaneous play and a reaction race).
- **House rules as options.** Each card game ships its special-card table and its draw and penalty rules as options with a sensible default, because that's where groups disagree.
- **Speed games need three explicit rules:** what counts as a valid claim, how ties are broken, and what a false claim costs. Research 02 found that without all three, arguments take over.

**Consequences:** The board-game side of the engine (geometry, placement, connected features) comes before the rest of the card families.

## D-037 Fixed-pace response windows

**Status:** Proposed

**Context:** Research 05 found that skipping response windows when nobody can respond leaks information (MTG Arena, Master Duel). The only approach that leaks nothing is a window that always runs at the same pace.

**Decision:** Blocking response windows (D-023) open at a few fixed points for every eligible player, whether or not they hold a response. They run at a fixed short pace, about 2.5 seconds with a visible timer, and close early only if everyone passes by hand. A prompt setting can come later: "always prompt" (the default), "smart", or "quick" for players who accept the tells.

**Consequences:** Response windows never give away a hand, at the cost of a couple of seconds each. This matters little until a game has blocking windows. Shithead's burns are non-blocking.

## D-038 Carcass Eon

**Status:** Accepted, 2026-09-26. The art approach is still to be decided after a trial.

**Context:** The next game is a board game (D-036): our own take on Carcassonne-style tile laying, named **Carcass Eon**. Game mechanics aren't protected, but names, art and rulebook text are (vision.md), so everything players see is ours. It's the first game where graphics matter.

**Decision:**

- **Tiles and rules.** The v1 tile set and rules are the classic base-game mechanics: roads, cities, monasteries, followers and majority scoring. Fields and farmers are an option for later. Everything is described in our own words and ids ([games/carcass-eon/DESIGN.md](games/carcass-eon/DESIGN.md)).
- **Tile geometry is data.** Each tile's edges and features are defined as data, and the game logic uses only that data. The pictures never decide what connects.
- **Art comes in two stages:**
  1. Procedural SVG tiles drawn from that data, which are correct by construction. We use these for development, and they stay as a fallback.
  2. A trial of AI-generated art through WaveSpeed (`WAVESPEED_API_KEY` in `.env`, never committed), with your feedback on a first set before we commit to an approach.

**Consequences:** The engine gains board geometry: an unbounded grid of sites, placement with rotation, and connected features (union-find). Per D-006, that stays in the game's code until a second board game needs it.

