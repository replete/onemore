# Tasks/out

> What's next. Keep **Now** short. When something is done, move it to **Done** with the date. Link big items to their decision, architecture section or research.

## Now

- [ ] You: play 21 on a real TV and real phones on the same Wi-Fi (see [README.md](README.md)). Note anything that feels wrong.
- [ ] Carcass Eon, following the build plan in [DESIGN.md](games/carcass-eon/DESIGN.md#build-plan):
  - [x] tile data for all 24 types, a procedural SVG renderer and a contact sheet (`pnpm --filter @onemore/carcass-eon sheet`);
  - [x] unit tests for matching, joining, completion and scoring;
  - [x] the rules module, with random games, leak tests and replay;
  - [ ] the server picks the game: a game choice in the lobby, and seat limits per game;
  - [ ] the board component (pan and zoom) and the placement and follower interactions;
  - [ ] the WaveSpeed art trial, then your feedback (D-038).

## Next

Gaps left in the walking skeleton:

- [ ] Lost tokens: "Are you Sam? Rejoin", approved by an admin (D-026).
- [ ] Mirror the reconnect token in an HttpOnly cookie (D-026).
- [ ] Clock sync over app-level pings, which also serve as the heartbeat for connections that have quietly died. The server tracks each client's round trip. Countdowns are drawn from absolute deadlines (D-026, D-033).
- [ ] Jittered exponential backoff on reconnect, so a server restart doesn't cause a reconnection storm (research 06).
- [ ] Rate-limit code lookups per IP address (D-027, architecture §2).
- [ ] HTTPS for LAN play, so the screen wake lock works (mkcert or a tunnel).
- [ ] Late joiners: take a seat at the next round rather than only when the game starts.
- [ ] The server serves the built client, so one process runs everything.

Then:

- [ ] Events and animation: deal, draw and flip, with events redacted per viewer (architecture §3.1).
- [ ] A standard 52-card deck content pack, plus a generic renderer for cards and zones.
- [ ] Drag and drop on the phone, driven by prompts ([architecture §3.5](architecture.md#35-prompts-and-the-ui)).
- [ ] 21: write the full rules and variations (research 02), then 21 v1 with the variations as options (D-021).
- [ ] Turn timers as an optional game setting (D-034).
- [ ] Shithead, then Crazy Eights/Switch, Cheat and Spoons, with house rules as options (D-036).

## Later

- [ ] Run research 05–06 when their decisions come up.
- [ ] Shithead, the second game: interrupts, response windows and synced timers (D-013).
- [ ] Spectator links (D-011), screen layouts per game, turning any client into a screen, and lobby approval (D-020).
- [ ] Fair first-response (D-032): a 120 ms collection window, ranking by server-measured round trips, and margins shown. Prove it with simulated latency and real phones.
- [ ] A collectible card prototype: a tiny set of about 20 cards, the effects vocabulary and the effect queue.
- [ ] Rooms that survive restarts: a SQLite (WAL) store behind `MatchStore`, snapshots at round boundaries, rooms reloaded lazily when someone reconnects, and drain-based deploys (D-035).
- [ ] "Verify this game": publish SHA-256 of the seed at the start and reveal the seed at the end (D-031).
- [ ] Interactive tablet mode.
- [ ] Remote play.
- [ ] Accounts and saved decks.
- [ ] Naming and art direction, plus an IP check on our "own takes".

## Done

- [x] 2026-09-26 Carcass Eon scope decided (D-039): medieval theme, classic tiles, 2–5 players, Farmers on by default.
- [x] 2026-09-26 Carcass Eon design (D-038): rules, tile set, engine mapping, screens and art plan. Turn timers made an optional game setting (D-034). `.env` added to `.gitignore`.
- [x] 2026-09-26 Reviewed research 02, 04, 05 and 06, recorded as D-031 to D-036:
  - randomness: per-stream HMAC keys, per-round shuffles, a version in the header, golden and uniformity tests, and a scan for clocks and `Math.random` in rules code;
  - match logs: versioned lines, sequence numbers, no names, and a `MatchStore` interface.
- [x] 2026-09-26 Moved the default ports to 5550 (web) and 5551 (game server) (D-030). Dropped the profanity filter for names (D-029).
- [x] 2026-09-26 Walking skeleton, tested end to end in a real browser (a TV and two phones):
  - repo: a pnpm workspace with `engine`, `games/twenty-one`, `server` and `client`, plus `CLAUDE.md` (D-028);
  - engine v0: pending decisions with typed prompts, ChaCha20 randomness, zones with per-viewer visibility and opaque refs, replay, and leak tests that also catch derived leaks;
  - minimal 21: server dealer, hit or stand, deal again. 200 random games are tested with leak checks after every move;
  - room server on Colyseus: Meet-style codes, creator and admin-code admins, shared screens, per-seat views, a 60-second grace period and then auto-stand, seats held all game, admin handover, and cleanup of empty rooms;
  - Svelte client: home, join, lobby with join and admin QR codes, the shared-screen table and the phone hand, and reconnecting when the page is visible again.
- [x] 2026-09-26 Accepted D-004 to D-007, D-017 to D-019, D-023 and D-024. Reviewed research 03, which gave D-026 (absence and reconnection) and D-027 (the code alphabet). Chose Svelte (D-028).
- [x] 2026-09-26 Recorded answers to the pending questions as D-020 to D-025. Evaluated Colyseus (research 08).
- [x] 2026-09-26 Evaluated boardgame.io (research 07) and proposed D-019: build our own engine and room layer.
- [x] 2026-09-26 Reviewed research 01. Proposed D-017 and D-018, added research notes to D-004 to D-007, and revised architecture §3 and §4.
- [x] 2026-09-26 Answered the first round of pending questions, recorded as D-008 to D-016.
- [x] 2026-09-26 Wrote research prompts 01–06 for external deep research.
- [x] 2026-09-26 Moved the git repo from `~/dev` into `~/dev/om`.
- [x] 2026-09-26 Wrote the first drafts of vision, architecture, decisions and tasks.
