# Tasks/out

> What's next. Keep **Now** short. When something is done, move it to **Done** with the date. Link big items to their decision, architecture section or research.

## Now

- [ ] Review [vision.md](vision.md) and [architecture.md](architecture.md), and correct anything that's wrong.
- [ ] Accept, change or reject the proposed decisions D-004 to D-007 in [decisions.md](decisions.md). Accepted decisions already rely on them: D-012 and D-013 build on D-005, and D-013 builds on D-007.
- [ ] Run research 01–04 through deep research and save the results. See [research/](research/).
- [ ] Claude: write the rules of 21 and its variants, drawn from existing variants (D-015).

## Next

- [ ] Walking skeleton, built on minimal 21 (hit or stand against a server dealer, no betting) and proven end to end:
  - a screen creates a room with a Meet-style code and a QR code;
  - phones join as players, and other devices join as screens;
  - the creator is admin;
  - seat tokens let a phone reconnect after it sleeps;
  - the server pushes views over WebSocket.
- [ ] Engine contract v0 ([architecture §3.1](architecture.md#31-the-engine-contract)):
  - a seeded RNG (research 04);
  - the action log;
  - replay tests.
- [ ] A standard 52-card deck content pack, plus a generic renderer for cards and zones.
- [ ] Drag and drop on the phone, driven by legal actions ([architecture §3.5](architecture.md#35-legal-actions-and-the-ui)).
- [ ] 21 v1, with the chosen variants.
- [ ] Grace period and absence policies for 21 (D-010).

## Later

- [ ] Run research 05–06 when their decisions come up.
- [ ] Shithead, the second game: interrupts, response windows and synced timers (D-013).
- [ ] Spectator links (D-011) and admin screen commands (D-009).
- [ ] A tile-laying prototype (Carcassonne-like) to test boards, geometry and the shared screen.
- [ ] A collectible card prototype: a tiny set of about 20 cards, the effects vocabulary and the effect queue.
- [ ] Rooms that survive restarts (D-014, research 06).
- [ ] Interactive tablet mode.
- [ ] Remote play.
- [ ] Accounts and saved decks.
- [ ] Naming and art direction, plus an IP check on our "own takes".

## Done

- [x] 2026-09-26 Answered the first round of pending questions, recorded as D-008 to D-016.
- [x] 2026-09-26 Wrote research prompts 01–06 for external deep research.
- [x] 2026-09-26 Moved the git repo from `~/dev` into `~/dev/om`.
- [x] 2026-09-26 Wrote the first drafts of vision, architecture, decisions and tasks.
