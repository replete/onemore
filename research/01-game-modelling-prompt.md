# How games are modelled in software

I'm designing a general-purpose engine for implementing many digital card and board games from shared building blocks. It needs to cover classic card games, collectible and deck-building card games, and tile- and piece-based board games. Survey the prior work on representing games and their rules in software, so that I can learn from what already exists.

## Scope

Cover academic and practical work, including but not limited to the following.

- **Game description languages and general game playing:**
  - Stanford GDL, and GDL-II for games with imperfect information;
  - Ludii and its "ludemes", and the earlier Ludi;
  - Regular Boardgames (RBG);
  - Zillions of Games;
  - VGDL;
  - languages written specifically for card games, such as the card game description language by Font et al. and RECYCLE/CardStock.
- **Frameworks and engines for implementing games:**
  - boardgame.io;
  - Board Game Arena's developer framework (BGA Studio);
  - OpenSpiel;
  - the Tabletop Games framework (TAG);
  - RLCard;
  - the classic games in PettingZoo;
  - multiplayer frameworks such as Colyseus, as far as they model game state.
- **Digital tabletops that don't enforce rules:** Tabletop Simulator, Vassal, Tabletopia, playingcards.io and Cockatrice. How do they model components when there are no rules?
- **Rules engines for complex card games:**
  - Magic: The Gathering engines: Forge, XMage, and MTG Arena's rules engine where details are public;
  - Hearthstone simulators (Fireplace, SabberStone, MetaStone) and Hearthstone's own entity/tag model;
  - implementations of Dominion and other deck-builders.
- **Formal foundations:** extensive-form games and information sets, state machines, event sourcing applied to games, and anything else used to model turn structure and hidden information.
- Anything significant that isn't named here.

## Questions

Answer these for each notable system, then compare across systems.

1. **Components and state.** How are cards, decks, hands, boards, tiles, pieces and tokens represented? Is there a general model of components and the zones they sit in?
2. **Rules.** Are rules written as code, as declarative data, or in a dedicated language? What are the trade-offs in expressiveness, ease of authoring and performance? Where did declarative approaches hit their limits?
3. **Turn structure.** How are these modelled:
   - turns, phases and rounds;
   - simultaneous moves;
   - out-of-turn responses (interrupts, priority, a "stack" of pending effects)?
4. **Hidden information.** How is it represented, and how is each player's view worked out? Are there known leaks or pitfalls?
5. **Legal moves.** Are legal actions listed up front, checked when submitted, or both? How are large or parameterised action spaces handled, such as choosing any subset of cards, or placing a tile anywhere on a growing map?
6. **Randomness, replays and undo.** How are these handled:
   - seeded randomness and determinism;
   - game logs and replays;
   - undo?
7. **Effects and interactions.** In engines for complex card games, how are card effects, triggers, targeting and resolution order represented?
8. **Reuse.** How much is actually shared across games in practice? What did people try to generalise that didn't work out?
9. **Lessons.** What do developers and researchers report as pain points, limitations, or things they would do differently? Use post-mortems, issue trackers and forum discussions where they help.

## Output

- **Executive summary:** up to 10 bullets with the findings most useful to someone designing an engine like this.
- **Comparison table:** the main systems against questions 1–6.
- **Findings:** one section per question, with short excerpts (code or rule text) where they make things clearer.
- **Reading list:** the primary sources most worth reading in full, with one line each on why.
- **Sources:** cite them inline with links. Prefer papers, official documentation and source code over blog posts. Mark anything you inferred rather than found stated.
