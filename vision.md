# One More: Vision

> Living document: what we're building and why. Update it when the idea changes, and log the reason in [decisions.md](decisions.md).

## The pitch

Everyone already knows the games: cards, board games, the classics. What stops people playing is the hassle of finding the box, shuffling, dealing, setting up and keeping score.

With One More, someone puts it on the TV, everyone scans the QR code with their phone, and you're playing. It's casual and quick to start, so it's always easy to go "one more" round.

## The experience

- **The table.** A shared screen (TV, tablet or laptop) shows what's on the table: the board, the discard pile, scores, whose turn it is. It never shows anything secret.
- **Your hand.** Each player's phone is their private view, with their hand and their choices. They join in a plain web browser by scanning the QR code or typing a room code like `kfp-nwt-hdz`. No app, no install, no account.
- **Any device can be a screen.** An admin can turn their own device, or anyone else's, into a shared screen.
- **Someone runs the room.** Whoever starts the game is its admin and can make others admins too. Admins choose the game and options, control the screens, and decide what happens when someone drops out.
- **The server runs the game.** It holds the real state, shuffles, deals, enforces the rules, and tells each device only what that device is allowed to see.
- **Same room first.** Remote play comes later. The architecture shouldn't care where players are sitting. If an admin allows it, anyone with a spectator link can watch from anywhere.

Playing should feel physical. You drag a card up to play it, or onto a target, and you can see where it's allowed to go. The phone only offers moves the rules allow.

## What we're building

There are two things here, and the second is the real product:

1. **The games.** Our own takes on classic and well-loved games.
2. **The platform for making them.** A shared engine that builds everything games have in common once: decks, hands, piles, boards, tiles, pieces, turns, dealing, scoring and hidden information. A new game is then mostly its rules and its content.

### Three families of games

| Family | Inspired by | What it stresses |
|---|---|---|
| Classic card games | Poker variants, Blackjack, Shithead, Crazy Eights, Hearts | Standard decks and variants, hidden hands, tricks, turn order |
| Collectible / deck-building card games | Hearthstone | Custom card sets, deck building, card effects that interact |
| Board games | Carcassonne-style tile laying, classic piece-on-board games | Shared board, placement rules, geometry, scoring |

Each family reuses the layers below it and adds its own. A deck of cards is content. Blackjack is rules over that content. A Hearthstone-like set is new content plus an effects system.

## Principles

- **The server is the source of truth.** Clients display things and ask to do things. They never decide what happened. ([D-002](decisions.md#d-002-server-authoritative-game-state))
- **Nobody sees what they shouldn't.** Secrets never reach a screen that isn't entitled to them. They aren't hidden in the UI; they're never sent.
- **The UI knows components, not rules.** The client draws cards, zones and boards generically and asks the server which moves are legal. ([D-005](decisions.md#d-005-clients-are-rules-agnostic-server-sends-legal-actions))
- **Build games first, then generalise.** Shared machinery is extracted from real games that need it, not from guesses. ([D-006](decisions.md#d-006-build-concrete-games-before-generalising))
- **Joining takes no effort.** Scan, enter a name, play. Phones lock and connections drop all the time, so rejoining has to be seamless.
- **Every game can be replayed.** A seed plus the action log reproduces any game exactly, for debugging, tests and bug reports, and later for undo, replays and bots. ([D-007](decisions.md#d-007-deterministic-engine-seed--action-log))
- **Our own takes.** We borrow mechanics from existing games and use our own names, art and text.

## Not now

- Accounts, profiles and federation ([D-003](decisions.md#d-003-no-accounts-to-start)).
- Remote play and matchmaking: we design for it but don't build it yet.
- A general-purpose game description language ([D-004](decisions.md#d-004-rules-as-code-content-as-data)).
- Native apps.

## Maybe later

- Other people building card sets, decks and house-rule variants.
- Remote players joining a same-room game.
- An interactive tablet mode: a screen in the middle of the table that players can also touch.
- Bots to fill empty seats or replace players who leave.

## Prior art

Parts of this already exist, but nobody seems to combine them. Each is worth studying for what to copy and what to avoid.

- **Jackbox Games, AirConsole.** TV plus phones in the browser, joined with a room code. They prove people will do this, but for party games rather than card or board games.
- **Board Game Arena.** Hundreds of licensed board and card games online. Each game is a server-side state machine that lists the allowed actions in each state. It's the closest to us on rules and the opposite on experience: remote-first, one screen per player.
- **boardgame.io.** An open-source TypeScript framework for turn-based games, with setup, moves, phases, server authority, `playerView` for stripping secret state, and seeded randomness. It's very close to the engine contract we want, so read it first.
- **Ludii.** An academic "general game system" that describes more than 1,000 traditional games in a language of "ludemes". It shows how far a data-driven rules language can go, and how much one costs to build.
- **Stanford GDL, RECYCLE/CardStock.** Game and card-game description languages from game-AI research.
- **OpenSpiel (DeepMind).** A games-research framework. Its split between `legal_actions`, `apply_action` and per-player information state is a useful reference.
- **Tabletop Games framework (TAG).** An academic Java framework with a component library for modern board games (decks, areas, boards, tokens) and a stack for decisions made out of turn.
- **Tabletop Simulator.** A physics sandbox that enforces no rules at all: the opposite extreme from us.
- **Forge / XMage** (Magic: The Gathering rules engines) and **Hearthstone's entity/tag model.** These show how far card-effect engines have to go once the card pool gets large.

The full survey is in [research 01](research/01-game-modelling-result.md).

What sets One More apart is same-room play on a shared screen, instant joining, a casual feel, and one engine that covers both card and board games.

## A note on "our own takes"

Game mechanics generally can't be protected by copyright. Names, artwork, rulebook text and overall look and feel can be, and names like Carcassonne and Hearthstone are trademarks. We make our own names, art and text. Get a proper check before anything goes public.

## Open questions

These are tracked in [decisions.md → Pending questions](decisions.md#pending-questions).
