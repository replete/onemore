# Colyseus evaluation

> Result for [08 Evaluate Colyseus](08-colyseus-prompt.md). Written by Claude on 2026-09-26 from:
>
> - Colyseus's source (`main` at `18d8c1ff`, 25 September 2026);
> - its docs (github.com/colyseus/docs);
> - a live test of `colyseus@0.18.8` with `@colyseus/sdk@0.18.4`.
>
> This isn't external deep research.

## Summary

- **Recommendation: use Colyseus for the room layer, with its state sync turned off.** It handles what we'd otherwise write ourselves:
  - rooms with our own codes;
  - joining;
  - holding a seat while a phone reconnects;
  - server-side timers;
  - rate limits;
  - graceful shutdown;
  - scaling across processes later.

  Our engine keeps computing each viewer's view, and we send it as a plain message.
- **Skip its state sync (`@colyseus/schema` and `StateView`).** It wants state held as schema classes that it diffs and filters itself. That conflicts with our pure engine and plain-data state (D-007), and it would put the job of hiding information in the framework's hands rather than ours. Research 01 found past leaks in Colyseus's view filtering: nested fields under `@view()` arrived undefined, and the old `@filter` didn't re-run when its dependencies changed.
- **It's healthy.** It's very actively maintained: 538 commits so far in 2026, with releases this month (core 0.18.17, `colyseus` 0.18.8). It has 15 open issues, 7,300 stars and an MIT licence.
- **The main risk is API churn.** It's still pre-1.0, and there were migration guides for 0.15, 0.16, 0.17 and 0.18. Its own docs warn that AI models tend to write outdated APIs, such as `colyseus.js` imports. We'll keep Colyseus behind a thin adapter in the server package, so the engine never depends on it.

## The live test

What we tested:

- A room with no state, whose room id was set to a Meet-style code in `onCreate`.
- Two clients joined, and each was sent a private "view" message.
- A server-side timer.
- The second client's connection was dropped without a consented leave. It then reconnected using its reconnection token.

Output:

```
sam joined room abc-def-ghi | state serializer: none
sam got view: {"you":"sam","hand":["7H","KS"]}
jo got view: {"you":"jo","hand":["2C","9D"]}
server: clock timer fired
server: onDrop jo
server: onReconnect jo
jo (after reconnect) got view: {"you":"jo","resumed":true}
```

Each client received only its own message. Without state, the room uses `NoneSerializer`, so nothing is synced automatically.

## Our design against Colyseus

| Our design | Colyseus | Fit |
|---|---|---|
| Meet-style room codes (D-011) | Set `this.roomId` in `onCreate`; clients join with `joinById`. Private rooms can be joined by id | Yes (tested) |
| A separate view per viewer, computed by our engine (§3.3) | Rooms without state (`NoneSerializer`); `client.send(type, payload)` to one client, MessagePack encoded | Yes (tested) |
| Disconnected vs left, and grace periods (D-010) | `onDrop` → `allowReconnection(client, seconds)`, or `"manual"` to hold a seat until we give it up. `onReconnect` and `onLeave` hooks. The SDK retries automatically, and `client.reconnect(token)` works after a page reload | Yes (tested) |
| Seat tokens (D-003) | The reconnection token held by the SDK. We store it in the browser and keep our own seat identity alongside it | Yes |
| Timers for pending decisions (D-013) | `this.clock.setTimeout` and `setInterval`. The expiry becomes our logged `timeout` action | Yes (tested) |
| Admin QR, shared screens, lobby approval (D-020) | `onAuth` (can be async) and join options carry an admin code or a request to join. Roles and approval are our own logic | Ours, supported by hooks |
| Validating client messages | `validate()` with Zod schemas per message type. Invalid input disconnects the client | Yes |
| Rate limiting | `maxMessagesPerSecond` per room | Yes |
| Testing fair first-response (D-022) | Built-in simulated latency (`COLYSEUS_LATENCY`, `applySimulatedLatency`) | Useful |
| Rooms that survive restarts (D-014) | Graceful shutdown locks, drains and disposes rooms. There's no built-in persistence or restore | Ours, from the action log |
| Scaling later | Redis presence and driver for running many processes, a matchmaker, a monitor, a load-test tool | Yes, when needed |

## Findings

- **Rooms and lifecycle.** A room is a class with `onCreate`, `onAuth`, `onJoin`, `onDrop`, `onReconnect`, `onLeave` and `onDispose`, plus a message map with optional Zod validation. It fits "one room = one game session" directly.
- **Reconnection** has two flows:
  - automatic retries from the SDK, with exponential backoff, for brief drops;
  - manual `client.reconnect(token)` after a reload or a long switch to another app.

  Both work only while the server holds the seat. `"manual"` mode holds it until our code releases it, which fits absence policies decided per game.
- **State sync** is the framework's headline feature, and we deliberately don't use it. The Colyseus docs describe how `StateView` works: the shared properties are serialised first, then each view's own properties. That's sound, but our guarantees about hidden information (opaque ids, and leak tests over every message) are simpler to hold if the engine produces each view and the room layer only delivers it.
- **Encoding.** Messages are MessagePack by default, and raw bytes are available (`sendBytes`) if we ever want our own compact format (research 06).
- **Client SDK.** `@colyseus/sdk` runs in the browser. We haven't measured its size on phones yet; check that during the walking skeleton.

## Decision

D-025: use Colyseus for the room layer, without its state sync, behind a thin adapter.

## Sources

- Colyseus source, `main` at `18d8c1ff` (2026-09-25): `packages/core/src/Room.ts` (`roomId`, `NoneSerializer`, `maxMessagesPerSecond`, `patchRate`), `packages/core/package.json`. https://github.com/colyseus/colyseus
- Colyseus docs: `room.mdx`, `room/reconnection.mdx`, `room/messages.mdx`, `room/timing-events.mdx`, `auth/room.mdx`, `server/graceful-shutdown.mdx`, `getting-started.mdx`, and the migration guides. https://github.com/colyseus/docs and https://docs.colyseus.io
- npm: `colyseus` 0.18.8 and `@colyseus/core` 0.18.17 (checked 2026-09-26).
- Repository metadata from the GitHub API (checked 2026-09-26): 7,326 stars, 15 open issues, MIT licence.
- Research 01 on Colyseus view-filtering issues: [01-game-modelling-result.md](01-game-modelling-result.md), §4.
