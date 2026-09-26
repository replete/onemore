# Tasks/out

> What's next. Keep **Now** short. When something is done, move it to **Done** with the date. Link big items to their decision, architecture section or research.

## Now

- [ ] You: play Carcass Eon and 21 on a real TV and real phones on the same Wi-Fi (`pnpm start`, then `http://<LAN IP>:5551`; see [README.md](README.md)). Note anything that feels wrong, as we did in the live sessions.
- [ ] HTTPS for LAN play, so the screen wake lock works and phones don't dim mid-game (mkcert or a tunnel).
- [ ] Late joiners: in 21, take a seat at the next round. In Carcass Eon, watch until the next game.
- [ ] Rate-limit room-code lookups per IP address (D-027, architecture §2).
- [ ] Carcass Eon: watch for mis-drops now that dropping places the tile. If they happen, add a short undo before the follower step (D-041).

## Next

- [ ] 21: write the full rules and variations (research 02), then 21 v1 with the variations as options (D-021). Animate dealing and drawing with events.
- [ ] Turn timers as an optional setting for games that support them: engine and room support, then per game (D-034, D-013, D-033).
- [ ] A standard 52-card deck content pack, a generic renderer for cards and zones, and drag and drop for card prompts (`pick`, `pickN`) ([architecture §3.5](architecture.md#35-prompts-and-the-ui)).
- [ ] Shithead, then Crazy Eights/Switch, Cheat and Spoons, with house rules as options (D-036). Shithead brings interrupts and response windows (D-013, D-023, D-037).
- [ ] Reliability leftovers:
  - [ ] mirror the reconnect token in an HttpOnly cookie (D-026);
  - [ ] jittered exponential backoff on reconnect (research 06);
  - [ ] server-measured round trips per client, needed for fair first-response (D-032).

## Last (you asked for art last)

- [ ] Carcass Eon art: a WaveSpeed trial comparing textures in procedural shapes with whole-tile illustrations, then your feedback (D-038). The key is in `.env` (git-ignored), and generation runs from a script only.

## Later

- [ ] Fair first-response (D-032): a 120 ms collection window, ranking by server-measured round trips, and margins shown. Prove it with simulated latency and real phones.
- [ ] Spectator links (D-011) and lobby approval (D-020).
- [ ] Rooms that survive restarts: a SQLite (WAL) store behind `MatchStore`, snapshots at round boundaries, rooms reloaded lazily when someone reconnects, and drain-based deploys (D-035).
- [ ] "Verify this game": publish SHA-256 of the seed at the start and reveal the seed at the end (D-031).
- [ ] A collectible card prototype: a tiny set of about 20 cards, the effects vocabulary and the effect queue.
- [ ] Interactive tablet mode (D-009).
- [ ] Remote play.
- [ ] Accounts and saved decks (D-003).
- [ ] Naming and art direction, plus an IP check on our "own takes".

## Done

- [x] 2026-09-26 Carcass Eon: drop to place. Only the stack's top tile wiggles, the tile slides into a hand beside the stack, and dropping places it with no confirm button (D-041). Browser tooling moved into the repo: `pnpm live` (a visible, scripted session you can watch and steer) and `pnpm e2e` (headless checks of 21 and a full Carcass Eon game).
- [x] 2026-09-26 Carcass Eon: drawing from a visible stack, dragging the tile onto the map, and placement hints as an option (D-040). Watched in a live browser session.
- [x] 2026-09-26 Reliability: clock sync and a heartbeat, "Are you Sam? Rejoin" with admin approval, and a single-process production mode (`pnpm start`), tested in Chrome.
- [x] 2026-09-26 Game events reach clients, filtered per viewer (`eventsFor`, `visibleTo`), and are covered by the leak tests. Carcass Eon announces scoring and supports screen layouts (Whole map, Follow the action). A full 71-tile game was played in Chrome.
- [x] 2026-09-26 Carcass Eon is playable: a game picker and options in the lobby (phone and shared screen), a board with pan and zoom, placement and follower spots. Built on tile data for all 24 types, map logic (union-find), procedural SVG art with a contact sheet, and the rules module, all with tests.
- [x] 2026-09-26 Carcass Eon scope decided (D-039): medieval theme, classic tiles, 2–5 players, Farmers on by default. Design in [games/carcass-eon/DESIGN.md](games/carcass-eon/DESIGN.md) (D-038). Turn timers made an optional game setting (D-034). `.env` added to `.gitignore`.
- [x] 2026-09-26 Reviewed research 02, 04, 05 and 06, recorded as D-031 to D-036:
  - randomness: per-stream HMAC keys, per-round shuffles, a version in the header, golden and uniformity tests, and a scan for clocks and `Math.random` in rules code;
  - match logs: versioned lines, sequence numbers, no names, and a `MatchStore` interface.
- [x] 2026-09-26 Moved the default ports to 5550 (web) and 5551 (game server) (D-030). Dropped the profanity filter for names (D-029).
- [x] 2026-09-26 Walking skeleton, tested end to end in a real browser (a TV and two phones): the engine, minimal 21, the room server on Colyseus, and the Svelte client (D-028).
- [x] 2026-09-26 Accepted D-004 to D-007, D-017 to D-019, D-023 and D-024. Reviewed research 03, which gave D-026 (absence and reconnection) and D-027 (the code alphabet). Chose Svelte (D-028).
- [x] 2026-09-26 Recorded answers to the pending questions as D-020 to D-025. Evaluated Colyseus (research 08) and boardgame.io (research 07).
- [x] 2026-09-26 Reviewed research 01. Proposed D-017 and D-018, and revised architecture §3 and §4.
- [x] 2026-09-26 Answered the first round of pending questions (D-008 to D-016). Wrote research prompts 01–06 for external deep research.
- [x] 2026-09-26 Moved the git repo from `~/dev` into `~/dev/om`. Wrote the first drafts of vision, architecture, decisions and tasks.
