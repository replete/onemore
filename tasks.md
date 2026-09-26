# Tasks/out

> What's next. Keep **Now** short. When something is done, move it to **Done** with the date. Link big items to their decision, architecture section or research.

## Now

- [ ] Set up the repo: a pnpm workspace with `engine`, `games/twenty-one`, `server` and `client`, plus a `CLAUDE.md` pointing at the working docs (D-028).
- [ ] Engine contract v0 ([architecture §3.1](architecture.md#31-the-engine-contract)):
  - the pending-decision stack and the four prompt types (D-017, D-018, D-023);
  - randomness: ChaCha20 with a 256-bit seed (D-024);
  - the action log;
  - replay tests;
  - opaque ids for hidden components, and property tests that no message (views, the first sync, logs) leaks hidden information ([architecture §3.3](architecture.md#33-visibility)).
- [ ] Claude: write the rules of 21 and its variations, using research 02 (D-021).
- [ ] Run research 04 through deep research; it confirms or refines D-024.

## Next

- [ ] Walking skeleton, built on minimal 21 (hit or stand against a server dealer, no betting), on Colyseus rooms (D-025), and proven end to end:
  - a device creates a room with a code from the D-027 alphabet and a QR code;
  - the creator is admin, and can make their device the shared screen;
  - the admin QR code on the join screen hands admin to a phone;
  - phones join as players;
  - reconnecting after a phone sleeps, with the grace period and auto-stand (D-026);
  - the server pushes each viewer's view.
- [ ] Play it on a real TV and real phones on the same Wi-Fi.
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

- [x] 2026-09-26 Accepted D-004 to D-007, D-017 to D-019, D-023 and D-024. Reviewed research 03, which gave D-026 (absence and reconnection) and D-027 (the code alphabet). Chose Svelte (D-028).
- [x] 2026-09-26 Recorded answers to the pending questions as D-020 to D-025. Evaluated Colyseus (research 08).
- [x] 2026-09-26 Evaluated boardgame.io (research 07) and proposed D-019: build our own engine and room layer.
- [x] 2026-09-26 Reviewed research 01. Proposed D-017 and D-018, added research notes to D-004 to D-007, and revised architecture §3 and §4.
- [x] 2026-09-26 Answered the first round of pending questions, recorded as D-008 to D-016.
- [x] 2026-09-26 Wrote research prompts 01–06 for external deep research.
- [x] 2026-09-26 Moved the git repo from `~/dev` into `~/dev/om`.
- [x] 2026-09-26 Wrote the first drafts of vision, architecture, decisions and tasks.
