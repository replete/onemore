# One More

Card and board games for people in the same room. A TV or tablet is the shared table, and phones join by QR code in the browser. The server holds the only real game state.

## Working docs: read these first

- [vision.md](vision.md): what and why.
- [architecture.md](architecture.md): how, including the game model.
- [decisions.md](decisions.md): the decision log. Append new entries and supersede old ones; never rewrite accepted entries.
- [tasks.md](tasks.md): what's next.
- [research/](research/): numbered prompt and result pairs (D-016).

Update the docs as part of the work, not afterwards. Docs use British English.

## Layout

- `engine/`: pure rules runtime, with no I/O and no dependency on Colyseus or Svelte. It contains decisions and prompts, the table (zones, visibility, opaque refs), ChaCha20 randomness, replay, and leak-test helpers (`@onemore/engine/testing`).
- `games/<name>/`: one rules module per game, e.g. `games/twenty-one`.
- `server/`: Colyseus room layer (`TableRoom`). State sync is off; the engine computes each viewer's view and the room sends it as a plain message. `src/protocol.ts` holds the message types shared with the client.
- `client/`: Svelte 5 + Vite. The shared screen and the phone are two layouts of one app.

## Commands

```sh
pnpm install
pnpm dev          # server on :2567, client on :5173 (also on your LAN IP)
pnpm test         # all tests (vitest)
pnpm typecheck    # every package, including svelte-check
```

## Rules for rules code

- Mutate only the draft you're given (`ctx.g`, `ctx.table`). Use `ctx.rng` for all randomness. Never read clocks or `Math.random`.
- Decision ids must be derived from state, so replays reproduce them.
- Never compute anything shown to a viewer from cards they can't see. Use `visibleDefs` and `viewZone`.
- Every game needs leak tests over every message a viewer receives: `secretsFor` + `findLeaks`, and `withHiddenShuffled` (which catches derived leaks such as totals). See `games/twenty-one/src/twenty-one.test.ts`.

## Gotchas

- Colyseus is 0.18: import from `colyseus` and `@colyseus/sdk`, not `colyseus.js`.
- TypeScript is pinned to 6.x because svelte-check doesn't support TypeScript 7 yet.
- The Screen Wake Lock API needs HTTPS, so it doesn't work on `http://<LAN IP>`.
