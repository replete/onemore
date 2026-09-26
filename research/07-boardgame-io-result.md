# boardgame.io evaluation

> Result for [07 Evaluate boardgame.io](07-boardgame-io-prompt.md). Written by Claude on 2026-09-26 from:
>
> - boardgame.io's source (`main` at `5e9a2c9`, 10 August 2026);
> - its docs;
> - its GitHub issues;
> - a live test of the published package (0.50.2).
>
> This isn't external deep research.

## Summary

- **Recommendation: don't build on boardgame.io. Borrow its ideas and build our own engine and room layer.** Its design is the closest to ours of anything research 01 found, but it falls short where we're strictest (hidden information) and it's missing what's specific to us (prompts, a decision stack, timers, roles).
- **It leaks hidden information to every client, including spectators with no credentials.** When a client connects, the server sends it the match's unfiltered starting state: the whole deck order, every player's hand, and the random seed with the generator's state. We confirmed this in a live test. It was reported in 2023 ([#1159](https://github.com/boardgameio/boardgame.io/issues/1159)), and the reporter closed the issue with a workaround. The code hasn't changed.
- **Its default seed is predictable.** The seed is the match creation time in milliseconds, and the public lobby API returns that time as `createdAt`. In our test they matched exactly. With the seed, every shuffle in the match can be predicted.
- **Its model differs from ours where it matters.** It doesn't send legal actions to clients, has no decision stack beyond one level of `revert`, and has no timers. The timers issue ([#92](https://github.com/boardgameio/boardgame.io/issues/92)) has been open since 2018. Rules also run on the client by default.
- **Maintenance is uncertain.**
  - The last release was 0.50.2, in November 2022, and it's still pre-1.0.
  - Commits fell from 675 in 2018 to 7 in 2023, 16 in 2024 and none in 2025.
  - In July and August 2026 there was a burst of maintenance: dependency updates, lint changes and small fixes. There's been no release since.
  - 67 issues are open.
- **It does several things well, and those are worth copying** (see the last section).

## Our design against boardgame.io

| Our design | boardgame.io | Fit |
|---|---|---|
| Server is authoritative (D-002) | The server validates every move. Clients also run moves optimistically unless a move is marked `client: false` | Partial |
| Views are computed per viewer on the server, and nothing secret is ever sent (§3.3) | `playerView` filters the live state and the patches, but the starting state is sent unfiltered whenever a client syncs | **No: leaks** |
| Seeds are secret and unpredictable (§2) | The seed and generator state are sent to clients inside the starting state. The default seed is the public `createdAt` timestamp | **No** |
| Opaque ids for hidden cards (§3.3) | Not addressed; left to each game | Our job either way |
| Server sends legal actions as typed prompts (D-005, D-018) | Moves are checked when submitted (`INVALID_MOVE`). `ai.enumerate` lists moves, but only for bots | No. Prompts could be computed inside `playerView` |
| Stack of pending decisions (D-017) | Phases, then turns, then stages. `setActivePlayers` can restore the previous setup once (`revert`) or chain to a `next` | Partial |
| `each` and `any` decisions | `ActivePlayers.ALL_ONCE` and `OTHERS_ONCE`, plus `ignoreStaleStateID` for simultaneous moves | Partial |
| Timers, with `timeout` actions in the log (D-013) | None ([#92](https://github.com/boardgameio/boardgame.io/issues/92), open since 2018) | No |
| Seed and action log, exact replays (D-007) | Seeded Alea PRNG, a game log, and time travel in the debug panel | Yes |
| Events for animation, redacted per viewer (§3.1) | A move's arguments are hidden from other players only if the move sets `redact`. There's no model of events for animation | Partial |
| `rev` and rejecting stale actions (§1) | `_stateID`; stale moves are rejected | Yes |
| Players, screens, spectators and admins (D-009) | Players have credentials. Anyone with a match id can spectate. There's no admin or screen role | No |
| Spectating off by default, with a separate link (D-011) | Spectating can't be turned off without patching the server | No |
| Meet-style room codes (D-011) | Match ids can be customised through the server's `uuid` option | Yes |
| Reconnecting with a seat token (D-003) | Player credentials, plus socket.io's automatic reconnection | Yes |
| Absence policies (D-010) | Connection status is tracked in the match metadata, but there are no policies | Partial |
| Persistence (D-014) | Storage adapters: in-memory and flat file built in; Postgres, MongoDB, Firebase and Azure from the community | Yes |
| TypeScript (D-008) | Written in TypeScript | Yes |

## Findings

### Hidden information

We ran a live test of `boardgame.io@0.50.2`:

- a card game that shuffles and deals five cards to each player in `setup`;
- secret state hidden with `playerView: PlayerView.STRIP_SECRETS`;
- a socket.io client connected as a spectator (no `playerID`, no credentials).

The spectator received:

```
state.G keys: [ 'players' ] | players visible: []          ← the live view is filtered correctly
initialState.G.secret.deck (first 8): [ '9S', '5C', '9H', 'QS', '5D', '7S', 'JS', '7D' ]
initialState.G.players: {"0":{"hand":["4C","JD","6S","AC","4H"]},"1":{"hand":["6C","2H","QC","JH","AH"]}}
initialState.plugins.random: {"data":{"seed":"muig5tf6","prngstate":{"c":1776175,"s0":0.80456…,"s1":0.90596…,"s2":0.66763…}}}
public lobby metadata createdAt: 1790430616626 → base36 tail: muig5tf6
```

The cause is in `src/master/filter-player-view.ts`. The `sync` case applies the player view to `state` and redacts `log`, but it spreads `...syncInfo`, which passes `initialState` through untouched.

The workaround proposed in #1159 doesn't help. It suggests starting with an unshuffled deck and dealing in a later phase, but the seed and generator state are in the starting state too, so every later shuffle can still be computed.

The default seed comes from `Random.seed()`, which returns `Date.now().toString(36).slice(-10)` (`src/plugins/random/random.ts`). The match metadata records `createdAt: Date.now()` at the same moment, and `GET /games/:name/:matchID` returns that metadata to anyone. So even with the starting state fixed, the seed can be recovered from public data, unless every game sets its own seed. A game can't do that per match in the normal way, because `seed` is a property of the game definition, which all matches share.

Two related findings:

- **Unknown match ids create matches.** If a client syncs to a match id that doesn't exist, the server creates a match on demand (`src/master/master.ts`, "create one on demand"). Anyone can create matches by connecting.
- **Spectators need no credentials.** Credentials are only checked when a sync includes a `playerID`, so anyone who knows a match id can watch it.

All of these could be fixed in a fork with small patches. But they show that strict guarantees about hidden information weren't the framework's focus, and for us they're the core requirement.

### The game model

- **Moves run on the client too.** By default, the client runs each move locally on its own redacted state, then the server's result replaces it. Moves that need secret state must be marked `client: false` (docs: "Secret State"). That means rules code has to be written to cope with redacted state, or it has to opt out.
- **No legal actions are sent to clients.** Moves validate themselves when submitted. To use our prompts, we'd compute them inside `playerView` and send them as part of `G`. `activePlayers` would then have to mirror the top of our decision stack, giving us two sources of truth for who is allowed to act.
- **Flow.** Phases (`endIf`, `next`), turn order presets, and stages with `activePlayers`, `minMoves` and `maxMoves`. `setActivePlayers({ revert: true })` gives one level of nesting ("everyone else discards, then carry on"). There's no general stack for chained responses.
- **Timers.** There are none. We'd have to run them outside the framework and inject a system move when one expires. There's no built-in route for that.

### Server and rooms

- **Stack:** Koa and socket.io, with a REST lobby API for creating, listing, joining and leaving matches, plus credentials per player.
- **Match ids:** the server's `uuid` option makes Meet-style codes easy.
- **Storage:** there's a clean adapter interface with both sync and async variants.
- **Missing:** screen or admin roles, and absence policies.

## Options

1. **Adopt it as it is.** No, because of the hidden-information leaks above.
2. **Fork it and patch it.** We'd need to:
   - fix the sync filtering, the seeding, spectator access and match creation;
   - add timers;
   - build prompts and the decision stack on top.

   We'd then own a fork of a framework whose model we'd mostly be working around. The parts it does well (flow presets, the room server, storage) are the smaller parts of what we need.
3. **Build our own and borrow its design (recommended).** Our engine contract is small, and a room layer for small, turn-based rooms is a modest amount of work.

## Worth copying

- The vocabulary of phases, turns and stages, the turn order presets, and `ActivePlayers.OTHERS_ONCE`-style presets for common patterns.
- `playerView({ G, ctx, playerID })` as the single projection function. (Apply it to *every* message, including the first sync.)
- `_stateID` to reject stale moves, and `ignoreStaleStateID` for moves that are allowed to be simultaneous.
- The `redact` flag on moves, so other players' log entries hide the move's arguments.
- `G` must be JSON-serialisable; `INVALID_MOVE`; `undoable` per move.
- The storage adapter interface (sync and async, fetching state, metadata, log and starting state).
- Custom match ids through the `uuid` option.

## Sources

- boardgame.io source, `main` at `5e9a2c9` (2026-08-10): `src/master/filter-player-view.ts`, `src/master/master.ts`, `src/plugins/plugin-random.ts`, `src/plugins/random/random.ts`, `src/server/util.ts`, `src/server/api.ts`. https://github.com/boardgameio/boardgame.io
- boardgame.io docs: `secret-state.md`, `stages.md`, `events.md`, `storage.md`, `undo.md`. https://github.com/boardgameio/boardgame.io/tree/main/docs/documentation
- Issue #1159, "Client is sent a complete copy of initialState" (opened 2023-07-09, closed by its reporter 2023-07-14). https://github.com/boardgameio/boardgame.io/issues/1159
- Issue #92, "Timer" (opened 2018-01-26, still open). https://github.com/boardgameio/boardgame.io/issues/92
- npm: `boardgame.io` latest is 0.50.2 (checked 2026-09-26).
- Repository metadata from the GitHub API (checked 2026-09-26): 12,442 stars, 67 open issues, not archived, MIT licence.
