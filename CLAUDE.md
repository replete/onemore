# One More

Card and board games for people in the same room. A TV or tablet is the shared table, and phones join by QR code in the browser. The server holds the only real game state.

## Resuming work

1. Read [tasks.md](tasks.md). **Now** is where we are, and **Done** is the recent history.
2. Skim the latest entries in [decisions.md](decisions.md), from D-038 onwards for Carcass Eon, and its **Pending questions**.
3. Run `pnpm install`, `pnpm test` and `pnpm typecheck`. All should pass.
4. To see the current state, run `pnpm dev`, then `pnpm live`, and watch.

**Where things stand (2026-09-26):**

- **Two games are playable end to end:**
  - a minimal 21: server dealer, hit or stand;
  - Carcass Eon, our medieval take on Carcassonne: the classic 72 tiles, followers and farmers. Drawing is from a visible stack, the tile is dragged from your hand onto the map, placement hints are optional, scoring is announced, and the TV has two layouts.
- **Rooms:**
  - Meet-style codes and QR joining;
  - admins, and shared screens;
  - a game picker with options;
  - reconnection with a 60-second grace period and auto-play, clock sync with a heartbeat, and "Are you Sam?" rejoin with admin approval.
- **Art is last:** Carcass Eon still uses procedural SVG tiles, and a WaveSpeed trial comes at the end (D-038).

## How we work

- The user drives product decisions. Each one gets a D-entry in `decisions.md`. Proposals are marked **Proposed** until the user agrees.
- Update the docs as part of the work, not afterwards. Docs use British English.
- Research goes in `research/` as numbered prompt and result pairs (D-016). Prompts are for an external deep-research tool: broad, standalone, and light on project detail.
- Before calling a feature done, check it in a real browser: `pnpm e2e` headless, or `pnpm live` so the user can watch and give feedback. The user likes to steer from live sessions.
- Commit when a piece of work is done and tested. Don't push unless asked.

## Working docs

- [vision.md](vision.md): what and why.
- [architecture.md](architecture.md): how, including the game model.
- [decisions.md](decisions.md): the decision log. Append new entries and supersede old ones; never rewrite accepted entries.
- [tasks.md](tasks.md): what's next.
- [research/](research/): numbered prompt and result pairs.
- [games/carcass-eon/DESIGN.md](games/carcass-eon/DESIGN.md): Carcass Eon's rules, tile model, screens and art plan.

## Layout

- `engine/`: pure rules runtime, with no I/O and no dependency on Colyseus or Svelte. It contains:
  - decisions and typed prompts;
  - the table (zones, visibility, opaque refs);
  - ChaCha20 randomness;
  - replay;
  - events filtered per viewer (`eventsFor`);
  - leak-test helpers (`@onemore/engine/testing`).
- `games/<name>/`: one rules module per game, plus its lobby `meta` (name, player range, options, screen layouts):
  - `games/twenty-one`;
  - `games/carcass-eon`: the tile data in `tiles.ts`, map logic in `map.ts`, rules in `game.ts`, and procedural art in `art.ts`.
- `server/`: the Colyseus room layer (`TableRoom`):
  - state sync is off; the engine computes each viewer's view, and the room sends it as a plain message;
  - `src/protocol.ts` holds the message types shared with the client;
  - `src/games.ts` is the game registry;
  - in production it also serves the built client.
- `client/`: Svelte 5 + Vite. The shared screen and the phone are two layouts of one app. Game screens live in `src/games/`.
- `tools/browser/`: `live.mjs` (visible, scripted session) and `e2e.mjs` (headless checks), both driving your installed Chrome.

## Commands

```sh
pnpm install
pnpm dev          # game server on :5551, web client on :5550 (also on your LAN IP)
pnpm start        # production: build the client, serve everything from :5551
pnpm test         # all unit and integration tests (vitest)
pnpm typecheck    # every package, including svelte-check
pnpm e2e          # headless browser checks (needs pnpm dev running)
pnpm live         # visible session: a TV and two phones play Carcass Eon (needs pnpm dev running)
pnpm --filter @onemore/carcass-eon sheet   # contact sheet of every tile and rotation
```

`pnpm live` options, as environment variables:

- `GAME` (default Carcass Eon);
- `PLAYERS` (default Sam,Jo);
- `TURNS` (default 10).

After the scripted turns it keeps the windows open and reads commands appended to the file it prints (`$TMPDIR/onemore-live-commands.txt`):

- `turns N`;
- `drop NAME` and `back NAME`;
- `rejoin NAME`;
- `layout follow|whole`;
- `quit`.

## Rules for rules code

- Mutate only the draft you're given (`ctx.g`, `ctx.table`). Use `ctx.rng` for all randomness. Never read clocks or `Math.random`; `engine/src/determinism.test.ts` enforces this.
- Scope shuffles per round (`table.shuffle('deck', `r${round}`)`), so one round's draws can't shift another's (D-031).
- If you change the RNG, key derivation or shuffle, bump `RNG_VERSION`: the golden test in `engine/src/rng.golden.test.ts` will fail until you do.
- Bump a game's `version` when its state shape or behaviour changes, because old logs won't replay.
- Decision ids must be derived from state, so replays reproduce them.
- Never compute anything shown to a viewer from cards they can't see. Use `visibleDefs` and `viewZone`.
- Events are public unless they list `visibleTo` seats.
- Every game needs leak tests over every message a viewer receives, events included: `secretsFor` + `findLeaks`, and `withHiddenShuffled` (which catches derived leaks such as totals). See `games/twenty-one/src/twenty-one.test.ts`.

## Gotchas

- Match logs (`server/src/matchLog.ts`) record seats only. Never put names or IPs in them (D-035).
- Colyseus is 0.18: import from `colyseus` and `@colyseus/sdk`, not `colyseus.js`.
- TypeScript is pinned to 6.x because svelte-check doesn't support TypeScript 7 yet.
- The Screen Wake Lock API needs HTTPS, so it doesn't work on `http://<LAN IP>` yet (see tasks).
- Draggable things built from `<img>` need `draggable="false"` and `-webkit-user-drag: none`, or the browser's native image drag cancels our pointer events.
- `pnpm dev` restarts the server on changes (`tsx watch`), and Vite hot-reloads the client. Reloading drops live rooms, because rooms are in memory (D-014).
- `.env` holds `WAVESPEED_API_KEY` for the art trial. It's git-ignored; never commit it or send it to the client.
