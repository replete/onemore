# Tasks/out

> What's next. Keep **Now** short. When something is done, move it to **Done** with the date. Link big items to their decision, architecture section or research.

## Now

- [ ] You: play it on a real TV and real phones on the same Wi-Fi (see [README.md](README.md)). Note anything that feels wrong.
- [ ] Claude: write the rules of 21 and its variations, using research 02 (D-021).
- [ ] Run research 04 through deep research; it confirms or refines D-024.

## Next

Gaps left in the walking skeleton:

- [ ] Lost tokens: "Are you Sam? Rejoin", approved by an admin (D-026).
- [ ] Mirror the reconnect token in an HttpOnly cookie (D-026).
- [ ] App-level heartbeat on the client, so connections that have quietly died are caught (D-026).
- [ ] Rate-limit code lookups per IP address, and add a profanity filter for names (D-027, architecture §2).
- [ ] HTTPS for LAN play, so the screen wake lock works (mkcert or a tunnel).
- [ ] Late joiners: take a seat at the next round rather than only when the game starts.
- [ ] The server serves the built client, so one process runs everything.

Then:

- [ ] Events and animation: deal, draw and flip, with events redacted per viewer (architecture §3.1).
- [ ] A standard 52-card deck content pack, plus a generic renderer for cards and zones.
- [ ] Drag and drop on the phone, driven by prompts ([architecture §3.5](architecture.md#35-prompts-and-the-ui)).
- [ ] 21 v1: the base game plus its variations as options (D-021).
- [ ] Choose the card games that come after 21 and Shithead (research 02).

## Later

- [ ] Run research 05–06 when their decisions come up.
- [ ] Shithead, the second game: interrupts, response windows and synced timers (D-013).
- [ ] Spectator links (D-011), screen layouts per game, turning any client into a screen, and lobby approval (D-020).
- [ ] Fair first-response (D-022): prototype it and prove it with simulated latency and real phones.
- [ ] A tile-laying prototype (Carcassonne-like) to test boards, geometry and the shared screen.
- [ ] A collectible card prototype: a tiny set of about 20 cards, the effects vocabulary and the effect queue.
- [ ] Rooms that survive restarts (D-014, research 06).
- [ ] Interactive tablet mode.
- [ ] Remote play.
- [ ] Accounts and saved decks.
- [ ] Naming and art direction, plus an IP check on our "own takes".

## Done

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
