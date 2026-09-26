# Tasks

> What's next. Keep **Now** short. When something is done, move it to **Done** with the date. Link big items to their decision or architecture section.

## Now

- [ ] Review [vision.md](vision.md) and [architecture.md](architecture.md), and correct anything that's wrong.
- [ ] Accept, change or reject the proposed decisions D-004 to D-008 in [decisions.md](decisions.md).

## Next

- [ ] Study the prior art, time-boxed: boardgame.io (engine contract, `playerView`), BGA Studio (state machines), Jackbox (join flow, reconnection). Write the takeaways into architecture.md.
- [ ] Walking skeleton, proven end to end with a trivial game (e.g. "highest card wins"):
  - the table screen creates a room;
  - phones join by QR code or room code;
  - seat tokens let a phone reconnect after it sleeps;
  - the server pushes views over WebSocket.
- [ ] Engine contract v0 ([architecture §3.1](architecture.md#31-the-engine-contract)), with a seeded RNG, the action log and a replay test.
- [ ] A standard 52-card deck content pack, plus a generic renderer for cards and zones.
- [ ] Drag and drop on the phone, driven by legal actions ([architecture §3.5](architecture.md#35-legal-actions-and-the-ui)).
- [ ] First real game: Shithead, unless we pick another (see pending questions).

## Later

- [ ] A second classic card game (e.g. Crazy Eights or Blackjack), to find out what's actually shared.
- [ ] A tile-laying prototype (Carcassonne-like) to test boards, geometry and the table screen.
- [ ] A collectible card prototype: a tiny set of about 20 cards, the effects vocabulary and the effect queue.
- [ ] Remote play.
- [ ] Accounts and saved decks.
- [ ] Naming and art direction, plus an IP check on our "own takes".

## Done

- [x] 2026-09-26 Moved the git repo from `~/dev` into `~/dev/om`.
- [x] 2026-09-26 Wrote the first drafts of vision, architecture, decisions and tasks.
