# Representing Games and Their Rules in Software: A Survey of Prior Art for a General Card and Board Game Engine

> Result for [01 — How games are modelled in software](01-game-modelling-prompt.md). Produced by an external deep-research tool; content is unedited except that inline citations have been reformatted as Markdown footnotes (see [Footnotes](#footnotes) and [Additional sources consulted](#additional-sources-consulted) at the end).

The main lesson from about twenty years of prior work is to share the *substrate*, not the rules. The systems that cover many games are Ludii, TAG, OpenSpiel, boardgame.io, BGA Studio and the Hearthstone and MTG engines. They share four things: a generic entity/zone/component model; an explicit turn and decision state machine; a single authoritative server state from which per-player views are derived; and a seeded, logged action stream. Game-specific rules and card effects are written in a host language or an embedded DSL over that substrate. Pure declarative languages (GDL, RBG, RECYCLE, Font et al.'s CGDL, ZRF) work well only inside a narrow game class and hit hard limits with hidden information, arithmetic, and "exception-based" card effects.

## TL;DR

- **Build a generic substrate and write rules as code or an embedded DSL.** The substrate is entities with typed properties, in ordered zones with per-player visibility. Rules and effects go in code or an embedded DSL, not a standalone declarative language. Ludii effectively makes Java its description language. MTG Arena uses C++ plus CLIPS. Hearthstone is "a bucket of entities" with integer tags. Every broad declarative language (GDL, RBG, RECYCLE, ZRF) documents firm limits on game class.
- **Model turn flow as an explicit state machine with a decision stack.** Model the turn as phases, turns and stages, plus a stack of pending decisions or effects that can hand control to any player. This covers simultaneous moves, reactions like Moat, and MTG-style priority. TAG's `IExtendedSequence` stack, BGA's `MULTIPLE_ACTIVE_PLAYER`/`PRIVATE` states and Hearthstone's nested `BLOCK_START`/`BLOCK_END` are working examples.
- **The server owns the truth.** Hidden information should be a server-side projection (`playerView`, `_copy(playerId)`, `StateView`, Hearthstone's dispatcher with `SHOW_ENTITY`). It should never be client-side hiding. Legal actions should be generated as decision prompts, with composite choices broken into sequential sub-decisions. Logging seed plus actions gives you replay and undo almost for free.

## Executive summary

1. **A uniform "container graph of sites" model covers boards, hands, decks and even growing maps.** Ludii represents every container (board, hand, deck) as a graph of sites. State is stored as per-location vectors `what, who, count, state, hidden, playable`. A growing map is "a large, invisible graph" pre-allocated, where sites become `playable` over time.
2. **Hearthstone's model is the most proven single data model for complex card games.** Every Game, Player and Card is an entity: a key→integer "tag" store. There are 500+ tags, and `ZONE` is just another tag. Discard, mill and bounce are simply zone transitions. SabberStone copied this, storing "almost all attributes and properties of Entity… as pairs of GameTag and int".
3. **Effects should be data flowing through a modifiable pipeline, not hard-coded interactions.** MTG Arena's GRE writes pending events and available actions to a "whiteboard". Card-specific CLIPS rules then add, erase or replace entries before the core engine executes them. Replacement effects and Yawgmoth's Will/Meddling Mage-style permission effects compose this way without special-case code.
4. **Fireplace's shift from procedural to declarative card definitions was driven by composability and introspection.** Its definitions look like `action = Hit(ENEMY | MINIONS, 4)`. The key insight was that event listeners can be written with the *same* action vocabulary, e.g. `Heal(FRIENDLY_MINIONS)`, and matched against broadcast actions.
5. **Hidden information fails at the network boundary.** Colyseus had a bug where nested fields under a `@view()`-gated parent were not encoded. Its older `@filter` "does not re-run automatically if its dependencies change". boardgame.io warns that moves touching secret state "often cannot run on the client". The safe pattern is to compute each player's view on the server from the authoritative state.
6. **Legal-move generation should be the engine's job, and the server should decide it.** Hearthstone's server sends "Options", including targets and sub-options, so "whether or not a card is playable… is entirely determined by the server". OpenSpiel, TAG and PettingZoo all expose an explicit legal-action list or mask.
7. **Combinatorial action spaces must be decomposed.** In Dou Dizhu there are 27,472 possible combinations, which RLCard abstracts to 309. TAG recommends treating "discard 3 of 6" (20 combinations) "as three distinct decisions". Dominion AIs such as Dominiate choose one card at a time in a loop.
8. **Declarative GGP languages trade reach for speed or clarity.** Ludii needs 24 tokens for Tic-Tac-Toe versus 381 in GDL, and 548 versus 4,392 for Chess. RBG is "currently the fastest among the abstract general game playing languages" but only covers deterministic perfect-information games. Zillions officially doesn't support "cards", hidden objects or arithmetic.
9. **Card-game DSLs report the same pattern.** RECYCLE's authors found "many of our earlier choices for the language proved to be ad-hoc and unable to generalize". Font et al.'s grammar fixes one 52-card French deck, and UNO's special-effect cards had to be excluded.
10. **Make determinism and a replayable log first-class from day one.** Examples are boardgame.io's `seed`, Ludii's `Trial` (the full state/action sequence), Hearthstone's Power.log/HSReplay packet stream, and a Fireplace fork's log of "accepted player decisions, the initial decks, a pre-start RNG snapshot". They give you replays, bug reproduction, spectator views and undo by replaying to step *n*−1.

## Comparison table (questions 1–6)

| System | 1. Components & zones | 2. Rules as | 3. Turn structure | 4. Hidden info | 5. Legal moves | 6. RNG / replay / undo |
|---|---|---|---|---|---|---|
| **Stanford GDL / GDL-II** | None built-in; boards and decks are hand-written as logic facts | Declarative logic programs (Datalog-like) | Every step is a joint move of all roles; turns are simulated by `noop` | GDL-II `sees` percepts; `random` role for chance | Enumerated via `legal` | Chance is a `random` player; no replay standard |
| **Ludii** | Containers (graphs of sites) + components; per-site `what/who/count/state/hidden/playable` | Ludeme DSL auto-generated from Java classes | `Alternating`, `Simultaneous`, `Realtime`; phases in rules | `hidden(s, loc, p)` per location per player | `Play: S → P(A)` enumerates action lists | `Trial` records the full sequence; nature is player p0 |
| **RBG** | Board graph + piece counters | Regular expressions over actions | Turn-based alternation only | Not supported | Enumerated by automaton | Deterministic only |
| **Zillions (ZRF)** | Board, pieces; one piece per position | Lisp-like data language; C++ DLL plug-ins | Turn-based | Not supported ("doesn't know anything about face-down (hidden) objects") | Generated by `add` in move macros | Random via hidden "random player" |
| **RECYCLE / CardStock** | Card locations, numeric tokens; locations "spatially independent" | Card-game DSL (recursive stages with cycles) | Nested stages with cycles | Location visibility | Enumerated for AI playtesting | Simulation transcripts |
| **Font et al. CGDL** | Fixed: one French deck, hands H, table T (face up), token locations | CFG production rules | Sequential stages, round-robin | Deck face down, table face up | Rule antecedents | n/a (research prototype) |
| **boardgame.io** | Free-form JSON `G` (you design it) | JS code (pure move functions) | `phases`, `turn.order`, `stages`, `activePlayers` | `playerView({G, ctx, playerID})`, `STRIP_SECRETS` | Checked on submit (moves validate themselves) | `seed` for PRNG; logs |
| **BGA Studio** | DB tables (e.g. card `location` column) | PHP code + declarative state machine | States: `ACTIVE_PLAYER`, `MULTIPLE_ACTIVE_PLAYER`, `PRIVATE`, `GAME` | `notifyPlayer` vs notify-all; `getAllDatas` per current player | State `args` + server-side checks | Server-side persistence; reload via `getAllDatas` |
| **OpenSpiel** | Game-specific C++ state | C++ code | Extensive-form; chance nodes; simultaneous nodes | Information states vs observations (string/tensor) | `legal_actions()` integer IDs | Explicit `chance_outcomes()`; history of actions |
| **TAG** | `Component`: Token, Die, Card, Counter, GraphBoard, GridBoard; `Deck` (ordered) and `Area` (map) | Java forward model + actions; optional rule graph | Phases, `TurnOrder` (incl. "reactive"), `IExtendedSequence` stack | `_copy(playerId)` makes a redacted observation | `_computeAvailableActions` list | Seeded; forward-model copies |
| **RLCard / PettingZoo classic** | Game-specific | Python code | AEC agent iteration | Per-agent observation | Integer IDs + `action_mask` | Env seeding |
| **Colyseus** | `Schema`, `MapSchema`, `ArraySchema` synced state | Your server code | Your code | `StateView` + `@view()` tags | Your code | Delta-encoded state sync |
| **Tabletop Simulator** | Physical objects: cards, decks, bags, tokens; zones (hand, hidden, randomize, scripting) | None (optional Lua) | None | Hand/hidden zones; `hideWhenFaceDown`; `setHiddenFrom` | None | Save files |
| **Vassal** | Game pieces = stack of *traits*; maps, zones, decks; properties | None (optional traits/expressions) | None | `Mask` (owner sees face) and `Invisible` traits | None | Logs and save files |
| **Hearthstone (official)** | Entities = tag stores; 7 zones via `ZONE` tag | Server code (closed) | Steps; server "Options" loop; nested blocks | Dispatcher withholds tags; `SHOW_ENTITY`/`HIDE_ENTITY` | Server sends Options with targets | Power.log packet stream → HSReplay XML |
| **Fireplace / SabberStone** | Mirror Hearthstone entities/tags | Python DSL (actions + selectors) / C# task DSL | Mirror HS | Simulators (full state) | Enumerated | Seeds (fork adds RNG snapshot logs) |
| **Forge / XMage / MTGA GRE** | Cards, zones, stack, layers | Forge: text scripts; XMage: Java per card; GRE: C++ + CLIPS | Full MTG priority and stack | XMage: server-enforced | GRE: whiteboard of available actions | (not verified) |

## Findings

### 1. Components and state

**Ludii has the most general published model.** A game is `⟨Players, Equipment, Rules⟩`. Equipment is `⟨Cᵗ, Cᵖ⟩`: containers ("boards, player's hands, etc."), each "a graph with vertices V and edges E", and components ("pieces, cards, tiles, dice, etc."). A location is `⟨container, vertex, level⟩`; the level allows stacking. A state holds six per-location vectors: "what, who, count, state, hidden, and playable". Ludii also picks a specialised storage representation automatically ("Uniform pieces per player… Piece count per site… Piece stacking… No fixed board (e.g. Dominoes)… Hidden information (e.g. Stratego, card games)"). It packs the result into a bitset (`ChunkSet`).[^1]

For tile games on a growing map, Ludii pre-allocates "a large, invisible graph" and makes locations `playable` over time. The complete Tic-Tac-Toe description shows the style:

```
(game "Tic-Tac-Toe"
  (players 2)
  (equipment { (board (square 3) (square)) (piece "Disc" P1) (piece "Cross" P2) })
  (rules (play (to Mover (empty))) (end (line 3) (result Mover Win))))
```

**TAG has the most practical OO component library for modern board games.** It includes Token, Die, Card, Counter, Graph board / Board node, and Grid board. There are two collection types: an **Area** ("groups components in a map structure… using their unique IDs") and a **Deck** ("an ordered collection (list) with specific interactions available (e.g. shuffle, draw)"). "Both areas and decks are considered components themselves." The authors "strongly recommend" modelling even counters as components "for general AI players to have an easy common access".[^2]

**Hearthstone takes the entity–tag approach.** "At any point in time, all it is is a bucket of entities. Each entity is a key-value store of properties… 'GameTags'." "A tag is always an integer value. There is no difference between a tag not having a value, or with its value equal to 0." The GameTag enum has "500+ members". The Game is entity 1 and the Players are 2 and 3; everything else is a Card, including heroes, hero powers and enchantments (buffs as entities). Zones are `PLAY, DECK, HAND, GRAVEYARD, REMOVEDFROMGAME, SETASIDE, SECRET`. That is seven zones, although the document says "six". "Discard" is "merely a transition from HAND to GRAVEYARD". `SETASIDE` is "a bit of a dump, really".[^3] Fireplace deviates by adding a separate DISCARD zone "which Hearthstone does not do".[^4]

**Framework "bring-your-own-state" systems.** boardgame.io requires `G` to be "a JSON-serializable object; in particular, it must not contain classes or functions".[^5] BGA games typically keep cards in a DB table with a `location` column and `player_id`, as in a developer's `UPDATE florenza_card SET location = 'hand', player_id = …`.[^6] Colyseus uses typed `Schema` classes with `MapSchema`/`ArraySchema`.[^7]

**Rule-less tabletops: how do they model components?** These tools model *physical* affordances only.
- **Tabletop Simulator** has objects (cards, decks, bags, chip stacks) that nest as containers. `getObjects()` returns contained items with `guid`, `index` ("represents the item's order in the container"), `name`, `description`, `gm_notes`, tags and Lua script state. Zones are hand zones, hidden zones, randomize zones and scripting zones; tags can filter which objects a zone affects.[^8][^9]
- **Vassal** builds each piece as an ordered stack of *traits* (decorators). Properties resolve up the piece → Zone → Map → module hierarchy, and expressions like `name == value` query them.[^10]
- *Not verified in this research:* Tabletopia, playingcards.io and Cockatrice internals. Treat any claims about them as unconfirmed.

*Inference:* a sound substrate combines several of these ideas: Ludii's container/site graph (spatial games, growing maps); TAG/Hearthstone's ordered zones with entity IDs (cards); and Vassal/TTS-style property bags for display-only attributes.

### 2. Rules: code, data, or dedicated language

**Logic languages (GDL).** The Ludii authors, as competitors to GDL (keep that bias in mind), criticise it on several points. Structures "such as the board or card deck, and arithmetic operators – must be defined explicitly from scratch for each game". Changing Tic-Tac-Toe from 3×3 to 4×4 "would require many lines of code to be added or modified". Logic resolution makes some games "unplayable due to computational costs (e.g., Chess)".[^1] Their token counts:

| Game | GDL | RBG | Ludii |
|---|---|---|---|
| Tic-Tac-Toe | 381 | 101 | 24 |
| Chess | 4,392 | 641 | 548 |
| Connect 4 | 751 | 155 | 29 |

**Regular languages (RBG)** encode rules as regular expressions. RBG is "universal for the class of all finite deterministic turn-based games with perfect information" and handles "amazons, arimaa, large chess variants, go".[^11] Its compiler is "currently the fastest among the abstract general game playing languages" and "competitive to… handcrafted game-specific implementations".[^12] But it cannot express hidden information or chance.

**Class-grammar DSL (Ludii).** Ludii "effectively makes its programming language (Java) the game description language. It can theoretically support any rule… that can be programmed in Java". The grammar is generated from constructors via reflection, and "extending LUDII revient simplement à ajouter de nouvelles classes" (extending Ludii simply means adding classes). *Inference:* this is the best-documented hybrid. Authors get a concise DSL, and the escape hatch is adding a ludeme class, not writing an ad-hoc script.

**Zillions ZRF** is "a data-oriented language with a syntax similar to Lisp".[^13] Moves are step sequences built with macros; `add` emits a candidate move:

```
(define slide-cannon ($1 (while empty? add $1) $1 (while empty? $1) (verify enemy?) add))
(piece (name man) (drops ((verify empty?) add)))
```

Reference source.[^14] Its official limits: no connection games, no "games that use a lot math", no multiple pieces per position, and no "cards". It "doesn't know anything about face-down (hidden) objects, hands, dealing, suits… games like Bridge are out of the question".[^15]

**Card-game languages.**
- **Font et al.'s CGDL** fixes its axioms: "one standard French deck… Cards in the deck are always placed face down", table "always face up". A game is `STAGES : RANKING : WINNING CONDITIONS`. Rules are "if antecedent then consequent" productions (types optional, `once`, `mandatory`, `com`). Example UNO rules: `show, same suit, T0 playit` / `draw next`. The authors "excluded cards with any special effect, e.g. changing the turn order or skipping players".[^16]
- **RECYCLE/CardStock** is restricted to "games which use only cards and numeric tokens and where all card locations are spatially independent". The authors report that "Many of our earlier choices for the language proved to be ad-hoc and unable to generalize to new situations".[^17] It now has 41 games[^18] and was used for the 21-game Valet testbed.[^19]

**Complex card games: embedded DSLs over code.**
- **Forge** uses a pipe-delimited key/value script per card: `A:SP$ DealDamage | Cost$ R | Tgt$ TgtCP | NumDmg$ 2`. Sub-abilities chain via `SVar`s, and triggers are `T:Mode$ ChangesZone | … | Execute$ TrigDraw`.[^20][^21] Keywords such as `K:Flying` are resolved by engine code.
- **Fireplace** uses Python classes named by card ID, with declarative actions and selectors. There is a fallback "to the procedural APIs from within card definitions".[^22]
- **SabberStone** uses composable tasks: `ComplexTask.Create(IncludeTask, FilterStackTask, CountTask, DrawNumberTask)`, with a shared memory stack.[^23]
- **MTG Arena's GRE** is "written in a combination of C++ and a language called CLIPS". The core "does not know what any of the thousands of individual Magic cards do".[^24]

**Where declarative hit its limits:** hidden information (RBG, ZRF), arithmetic and scoring (ZRF: "doesn't support math/arithmetic in rules files… Yahtzee wouldn't work"), special-effect cards (CGDL), non-card components (RECYCLE), and verbosity and performance (GDL).

### 3. Turn structure

- **GDL/GDL-II.** Every step is a joint move of all roles, so simultaneity is native. In Monty Hall, "the random player must decide where to place the car and, simultaneously, the candidate chooses a door".[^25]
- **Ludii** declares control flow `F ∈ {Alternating, Simultaneous, Realtime}` and uses a forced `pass` when no moves exist.
- **boardgame.io** has a three-level hierarchy:
  - **phases** each override moves and turn order, with `endIf` and `next`.
  - **turns** have `order` presets (`TurnOrder.DEFAULT`, `ONCE`, `CUSTOM_FROM`), `minMoves`/`maxMoves` and `onBegin`/`onEnd` hooks.
  - **stages** work "within a turn". Only players in a stage may move, which covers "the currentPlayer might play a card that requires every other player in the game to discard a card".[^26][^27] Events such as `endTurn({ next: '3' })` "are queued up".
- **BGA Studio** uses an explicit state machine (`states.inc.php` or state classes) with types `ACTIVE_PLAYER`, `MULTIPLE_ACTIVE_PLAYER` ("1..N players can be active and must play"), `PRIVATE` ("players can independently move to different private parallel states") and `GAME` ("a transitional state to do something automatic").[^28]
- **TAG** offers phases plus `TurnOrder` with a built-in "reactive" order "which adds the possibility of a player to act out of turn". It also has `IExtendedSequence`, a "mini-ForwardModel that takes temporary control of i) which player is currently making a decision… ii) what actions they have… iii) what happens after", kept on a `Stack<IExtendedSequence> actionsInProgress`.[^29] Dominion's Militia/Moat "circulates round the table before I continue with my turn".
- **Hearthstone** blocks state changes until the player picks an Option. Cause and effect nest as `BLOCK_START`/`BLOCK_END` of types `ATTACK, POWER, TRIGGER, DEATHS, PLAY…`. Example: Arcane Intellect draws Flame Leviathan, which triggers, damages Acolyte, and draws again, all inside the open PLAY block. `DEATHS` is "a special pass" that collects dead entities.[^3]
- **MTG GRE** "knows which player gets priority and when… how to move between the phases of a turn… the steps of casting a spell".[^24] *Inference:* Hearthstone has no player-to-player priority passing (only the active player acts, apart from Secrets), so its blocks are an effect-causality tree. MTG needs a true stack plus priority rounds.

### 4. Hidden information

- **Formal.** OpenSpiel separates the "ground/world state" from `information_state_string()`/`information_state_tensor(player)` (perfect-recall) and from observations, which are "a partial view of the information state" that may lack perfect recall.[^30][^31] GDL-II adds just two keywords, `random` and `sees`. Players "only gain knowledge… if explicitly permitted", e.g. `(<= (sees ?player ?card) (does random (deal_face_down ?player ?card)))`.[^32]
- **Projection functions.** boardgame.io uses `playerView: ({ G, ctx, playerID }) => …` or `PlayerView.STRIP_SECRETS`, and `playerID` "could also be null or undefined for spectators".[^33] TAG uses `_copy(int playerId)`: "includes only those components… which the player… can currently see". Components are copies, "as the player is not prohibited from modifying the state it receives". Ludii uses `hidden(s, loc, pᵢ)`.
- **Visibility as a delta stream.** In Hearthstone, a dispatcher "knows to hold back and/or change some packets for each player". `SHOW_ENTITY` reveals a card's ID and tags "without necessarily updating the actual game state". Some tags "are not sent down to the client at all… or should not know about them".[^3] On Colyseus: "Internally, all 'shared' properties… are serialized first, and then each StateView is serialized with its own set of properties".[^34]
- **Rule-less tabletops.** Vassal's `Mask` shows non-owners a generic back while "its existence remains visible to all players". The masking player becomes owner. Trait order matters: Mask "only hides traits that appear before it".[^35] TTS has hand and hidden zones, `hideWhenFaceDown` ("Cards/decks default to true") and `setHiddenFrom`.[^8] *Not verified:* whether TTS or Vassal clients receive hidden data over the wire. Because they are peer or host-replicated desktop apps, it is plausible, but this is an inference.
- **Known leaks and pitfalls.**
  - Colyseus 4.0.21 fixed nested Schemas under a `@view` field arriving with "every property… undefined".[^36]
  - Colyseus's legacy `@filter` "does not re-run automatically if its dependencies change" and "does not work for items inside arrays and maps".[^37]
  - boardgame.io warns that moves on secret state "often cannot run on the client".
  - Zillions' AI "will automatically use all information available to itself, including the cards in the deck and… hands of all other players" (per Wikipedia, secondary).[^38]
  - Deck *order* is itself secret. Card identity also leaks through stable entity IDs if an ID is revealed and later hidden again. Hearthstone's `HIDE_ENTITY` exists for this case. *Inference:* reassign or obfuscate IDs on shuffle.

### 5. Legal moves

- **Enumerated up front:** GDL `legal`; Ludii `Play: S → P(A)` (a list of `Action` objects, each of "one or more atomic actions"); OpenSpiel `legal_actions()`; TAG `_computeAvailableActions`; PettingZoo classic "communicate the legal moves… as part of the observation" via `action_mask`.[^39]
- **Checked on submit:** in boardgame.io, a move function inspects `G`/`ctx` and returns the `INVALID_MOVE` constant. boardgame.io's CHANGELOG records the switch: "undefined is no longer used to indicate invalid moves. Use the new INVALID_MOVE constant to accomplish this." BGA uses state `args` to tell the client what's possible, and the server re-validates.
- **Server-offered options** (the most robust for complex CCGs): Hearthstone "gives players a list of entity IDs which may be played, optionally with suboptions ('choose one' cards) and/or targets". MTG Arena assembles "AVAILABLE ACTIONS FOR PLAYER 1" on its whiteboard, then CLIPS rules add or erase entries.
- **Large or parameterised spaces:**
  - *Subset choice:* RLCard's Dou Dizhu has 27,472 possible combinations, abstracted to 309 by making "the kicker fuzzy".[^40] DouZero shows one hand can have 391 legal combinations and argues abstraction hurts play.[^41] TAG's "Move Group" advice is 6C3 = 20 options "might be more tractable… as three distinct decisions". Dominiate calls `chooseDiscard` repeatedly, appending `null` to allow stopping.[^42] Fisher's DominionAI uses `s.decision.SelectCards(source, min, max)` with `cardChoices`.[^43]
  - *Growing maps:* Ludii's pre-allocated invisible graph with `playable` flags. *Inference:* for Carcassonne-style tiles, generate the frontier cells × rotations lazily, as a two-step decision (tile position, then rotation).
  - *Move generation vs execution:* ZRF's `add` means the move "is not actually played on the board at that time and it may in fact never be played".

### 6. Randomness, replays and undo

- **Chance as a player:** GDL-II's `random`, Ludii's `p0` ("nature"), Zillions' "hidden, 'random player'", and OpenSpiel's chance nodes with `chance_outcomes()` returning (action, prob) pairs. The last is essential for search and CFR, because it exposes probabilities rather than hiding a PRNG call.
- **Seeded PRNG:** boardgame.io has `seed: 'random-string'` in the game config and passes `random` into hooks. TAG seeds each game; its forward-model `_copy()` should "use a new random seed". *Inference:* this is deliberate, so AI rollouts don't know the true future shuffle, a subtle but important anti-cheat detail for AI search.
- **Logs and replays:** Ludii's `Trial` is "a complete record of a game played from start to end". Hearthstone's Power.log is a flat packet stream (`CREATE_GAME`, `FULL_ENTITY`, `TAG_CHANGE`, `BLOCK_START`…), which HSReplay turns into XML. That is event sourcing in practice: HDT reconstructs state by folding tag changes.[^44] A Fireplace fork records "accepted player decisions, the initial decks, a pre-start RNG snapshot" and can "replay and verify a completed standard game with the same Python, Fireplace, and card-data versions".[^45] Note the version-pinning requirement.
- **Undo:** none of the sources examined documents a general undo design. *Inference:* with pure `next(state, action)` plus a seed, undo means replaying the log to step *n*−1. The practical rule is that undo is only safe up to the last point where hidden information was revealed or randomness consumed. Dominion Online's changelog (v2.2.11, 7 September 2026) shows such a limit in production: "In rated games, undo can no longer rewind past the start of your previous turn." (No URL was found for this changelog during this research; treat the quote as reported, not independently verified here.)

### 7. Effects and interactions (complex card games)

- **MTG Arena GRE: replacement and permission as whiteboard edits.** When Day of Judgment resolves, the GRE writes "Destroy Darksteel Colossus… Destroy Cityscape Leveler… Destroy Sanctuary Warden" and "takes a nap". CLIPS rules then edit the list: indestructible erases one line, unearth rewrites another to "Exile", and shield counters swap in "Remove a shield counter". "The GRE neither knows nor cares how many CLIPS rules came along and modified the contents." The same mechanism handles available actions: Yawgmoth's Will adds graveyard casts and Meddling Mage erases them. "There's no special case code to make sure Meddling Mage and Yawgmoth's Will work together."[^24]
- **XMage (secondhand).** An XMage-inspired Go engine describes XMage's "architectural bones" as "layered continuous effects, event-driven triggers, stack-based resolution". Continuous effects "re-apply from scratch every cycle in MTG layer order (copy → control → type → color → ability → P/T)".[^46] XMage itself claims support for "over 32,000 unique cards" with rules and hidden information "enforced server-side".[^47] *Not directly verified from XMage source in this session.*
- **Forge: triggers as declarative patterns.** `T:Mode$ Phase | Phase$ End of Turn | ValidPlayer$ You | TriggerZones$ Battlefield | Execute$ TrigBranch | CheckSVar$ X`, with `DB$ Branch` sub-abilities for conditionals.[^20] "Triggered-variables" such as `TriggeredCard` expose event data to scripts.[^48]
- **Fireplace: unify actions and events.** Selectors compose with `+` (and), `|` (or) and `-`, e.g. `RANDOM(FRIENDLY_CHARACTERS)`. Queued actions "broadcast" themselves and are matched against listeners written with the same vocabulary. Ordering was hard: the author "decided to limit the 'AFTER' events to Play and Summon" after discovering the Battlecry "happens during the summon", and was "getting slightly nauseous at the idea of refactoring more things".[^22] Card scripts have `action`, `combo` and `deathrattle` action triggers, plus event listeners and "attribute scripts" for dynamic tag values (e.g. Giants).[^49]
- **SabberStone: enchantments in layers.** Its "so called onion system… is using a layer approach to handle entity changing enchantments".[^50]
- **Dominion.** Dominiate cards are "singleton, immutable" objects with hooks (`playEffect`, `reactToAttack(state, player, attackEvent)`). "All attack effects are wrapped in the state.attackOpponents method, to give opponents a chance to play reaction cards", and effects are skipped if `attackEvent.blocked`.[^51] Fisher's DominionAI puts `struct AttackAnnotations { bool moatProcessed; }` on attack events on an event stack.

### 8. Reuse: what is actually shared

- **What gets shared:** decks and zones with shuffle/draw/move (TAG ships "shuffling decks… drawing components from one deck to another… placing tokens in grid boards"). Also turn-order presets, phase machinery, networking, persistence, projection and logging (boardgame.io, BGA, Colyseus), board geometry (Ludii's graphs, directions and tilings, changed "by modifying a single parameter"), and keyword mechanics inside one card game (Forge `K:Flying`, `K:Suspend`; Fireplace's default implementations for "all simple minions" from CardDefs XML).
- **What doesn't generalise:**
  - GDL's ambition led to rewriting boards from scratch per game.
  - RECYCLE's early choices were "ad-hoc and unable to generalize". The authors later "patched multiple holes in CardStock to allow for the processing of 14 different card games".
  - TAG's generic rule-graph forward model (`AbstractRuleBasedForwardModel`) is optional, and most TAG games implement `_next()` directly. *Inference* from the doc's framing; not counted.
  - Zillions needed C++ DLLs for anything outside its class.
  - The GRE's generality was marketed in WotC's 7 September 2017 feature "Everything You Need to Know About Magic: The Gathering Arena". There Jeffrey Steefel said the GRE "uses sophisticated machine learning that can read any card we can dream up for Magic". This is a *marketing claim* (no URL recovered for the 2017 feature in this research); the developer's own 2023 description is C++ + CLIPS rules written per card.
- *Inference:* the reuse ceiling is roughly "same substrate, same turn engine, and within a family (trick-taking, deck-builders, MTG-likes) shared effect vocabularies". Cross-family effect vocabularies have not been shown to work.

### 9. Lessons and pain points

- **Don't hold object references in actions.** TAG: "Actions should not hold any reference to other objects… Unique component IDs should be passed instead", called "the most common mistake". SabberStone refactored so tasks no longer hold "game-instance specific objects like IEntity Source", which allows singleton tasks and cheap cloning.[^52]
- **Split multi-step cards into sequences early.** TAG's Artisan example: "in hindsight have been preferable to split this into an Artisan action… and an ArtisanPhase". Throne Room on Throne Room needs careful stack routing.
- **Special cases leak through reaction wrappers.** Dominiate needed a third helper because Noble Brigand's "buyEffect should not be blockable by Moat". Its AI's imperfect-information state copying "isn't implemented yet". Fisher called Stash "a rather inelegant card I don't plan to implement".
- **Event ordering is the hardest part of CCG engines.** See Fireplace's before/after events saga. The Hearthstone wiki community spent long discussions on ordering, which the Fireplace author felt had been "blown out of proportions".
- **Interaction bugs dominate CCG maintenance.** WotC's Living Breakthrough story (same article) is a real-world example.[^24] Dominion Online's changelog (dominion.games) lists fixes such as v2.2.6: "Fixed Way of the Turtle erroring when failing to set cards aside, breaking the game." (No URL recovered for this changelog in this research.)
- **Architecture cost.** WotC: a function "determining whether a player can play a particular land" that knew about cards "would be a nightmare".[^24] That is the case for inverting control via rules or hooks.
- **Declarative language maintenance.** The main GDL repository "is only extended with a few games every year" (Ludii authors' claim).

## Recommendations (for your engine)

1. **Core state.** `Entity {id, defId, owner, controller, props: Map<Key, Value>}`. Keep `Zone {id, owner, ordered, visibility: Public|Owner|Hidden|Custom}` and a separate spatial `Board` graph (Ludii-style sites, with lazy `playable` for growing maps). Zone membership is a property, as in Hearthstone. Re-key entity IDs on hidden→hidden moves.
2. **Turn engine.** Use a hierarchical state machine (phase → turn → step), plus a **decision stack** of `PendingDecision {players, prompt, options, onResolve}`. It unifies simultaneous choices (BGA `MULTIPLE_ACTIVE_PLAYER`), reactions (TAG `IExtendedSequence`), and MTG-style priority and stack.
3. **Effects.** Use an embedded DSL of *actions + selectors* (Fireplace and SabberStone vocabularies). Run every event through a GRE-style *proposal → modifiers (replacement/prevention/permission) → execute → trigger collection* pipeline, and recompute continuous effects from scratch in layers.
4. **Views.** Write one pure `view(state, playerId|null)` on the server, and send diffs of views, never raw state. Test it with property tests like "no hidden prop of opponent's hand appears in the serialized view".
5. **Legal actions.** The server generates prompts with typed parameters: pick-entity, pick-N-of-M, pick-site. Subsets become sequential sub-decisions, and a submitted action is validated against the offered prompt.
6. **Determinism.** Seeded PRNG in state; the action log is the source of truth; chance steps are explicit (OpenSpiel-style) for AI. Version-pin card data in replays. Undo = replay to a checkpoint, and forbid it past reveals and RNG.
7. **Don't build a standalone declarative rules language first.** Start with code plus a small DSL and promote patterns into declarative data only once three or more games need them (*inference* from the RECYCLE and GDL experience).

## Caveats

- XMage internals, MTG Arena details beyond the 2023 WotC article, Tabletopia, playingcards.io, Cockatrice, VGDL and Dominion Online (Shuffle iT) were *not* examined from primary source in this session. Statements about them are secondhand or omitted.
- The Ludii-vs-GDL comparisons come from Ludii's authors, and the RBG speed claims come from RBG's authors. Each has an interest in its own system.
- Several recommendations are marked *inference*: design reasoning drawn from the sources, not claims made by them.

## Reading list

- **Piette et al., "Ludii – The Ludemic General Game System" (ECAI 2020)**: the cleanest formal state model (containers, sites, per-location vectors) and the class-grammar idea. https://ludii.games/publications/ECAI2020.pdf
- **HearthSim, "The Hearthstone Game State Protocol"**: the entity/tag/zone model, blocks, and the server-side visibility dispatcher, from a shipped AAA CCG. https://hearthsim.info/docs/gamestate-protocol/
- **Werner, "On Whiteboards, Naps, and Living Breakthrough" (WotC, 2023)**: the only first-party description of MTG Arena's rules architecture. https://magic.wizards.com/en/news/mtg-arena/on-whiteboards-naps-and-living-breakthrough
- **Gaina et al., "Design and Implementation of TAG"**: a component library, forward-model/observation split, and practical guidance for modern board games. https://arxiv.org/pdf/2009.12065 and the TAG wiki on actions and rules: https://tabletopgames.ai/wiki/games/creating/actions_and_rules.html
- **Lanctot et al., "OpenSpiel"**: rigorous definitions of information states, observations, perfect recall and chance nodes. https://arxiv.org/pdf/1908.09453
- **Thielscher, "A General Game Description Language for Incomplete Information Games" (AAAI 2010)**: the minimal `sees`/`random` formalism for hidden information. https://cdn.aaai.org/ojs/7647/7647-13-11177-1-2-20201228.pdf
- **Kowalski et al., "Regular Boardgames" and "Efficient Reasoning in RBG"**: how far a restricted formalism can go on performance. https://arxiv.org/abs/1706.02462, https://arxiv.org/abs/2006.08295
- **boardgame.io docs (phases, stages, secret state)**: a compact, well-designed turn API for a JS engine. https://github.com/boardgameio/boardgame.io/tree/main/docs/documentation
- **BGA Studio state machine docs**: a battle-tested declarative state machine behind a platform whose homepage (September 2026) advertises "1,378 games" and "8,980,000 games played each month". http://en.boardgamearena.com/doc/Your_game_state_machine:_states.inc.php
- **Fireplace "new events API" post**: first-hand account of moving card effects from procedural to declarative, and the event-ordering pain. https://hearthsim.info/blog/new-site-new-blog-new-events-api/
- **Font et al., "A Card Game Description Language" (2013)** and **Bell & Goadrich, "Automated Playtesting with RECYCLEd CardStock" (2016)**: card-game DSLs and their limits. http://julian.togelius.com/Font2013A.pdf, http://mark.goadrich.com/articles/issue-2-1-09-recycled.pdf
- **Zillions "Can Zillions Support This Game?" FAQ**: an honest vendor account of a declarative language's boundaries. https://www.zillionsofgames.com/supportedFAQ.html

## Footnotes

[^1]: Piette et al., "Ludii – The Ludemic General Game System", ECAI 2020. https://ludii.games/publications/ECAI2020.pdf
[^2]: Gaina et al., "Design and Implementation of TAG" (design doc). https://arxiv.org/pdf/2009.12065
[^3]: HearthSim, "The Hearthstone Game State Protocol". https://hearthsim.info/docs/gamestate-protocol/
[^4]: Fireplace wiki, "Hearthstone Simulation 101: Game State". https://github.com/jleclanche/fireplace/wiki/Hearthstone-Simulation-101:-Game-State
[^5]: boardgame.io documentation. https://boardgame.io/documentation/
[^6]: Board Game Arena developer forum. https://forum.boardgamearena.com/viewtopic.php?t=4618
[^7]: colyseus/schema (GitHub). https://github.com/colyseus/schema
[^8]: Tabletop Simulator API docs, `object.md`. https://github.com/Berserk-Games/Tabletop-Simulator-API/blob/master/docs/object.md
[^9]: Tabletop Simulator Knowledge Base, "Zone Tools". https://kb.tabletopsimulator.com/game-tools/zone-tools/
[^10]: VASSAL Reference Manual, "Properties". https://vassalengine.org/doc/3.6.19/ReferenceManual/Properties.html
[^11]: Kowalski et al., "Regular Boardgames", AAAI 2019. https://arxiv.org/abs/1706.02462
[^12]: Kowalski et al., "Efficient Reasoning in Regular Boardgames". https://arxiv.org/abs/2006.08295
[^13]: Zillions of Games, language reference. https://zillionsofgames.com/language/index.html
[^14]: ZRF language reference (Duke University course archive copy). https://courses.cs.duke.edu/spring06/cps108/Assignments/06_vooga/zrf.pdf
[^15]: Zillions of Games, "Can Zillions Support This Game?" FAQ. https://www.zillionsofgames.com/supportedFAQ.html
[^16]: Font et al., "A Card Game Description Language" (2013). http://julian.togelius.com/Font2013A.pdf
[^17]: Goadrich, RECYCLE/CardStock research page. http://mark.goadrich.com/research.html
[^18]: CardStock (GitHub repo). https://github.com/mgoadric/cardstock
[^19]: Valet testbed paper (arXiv). https://arxiv.org/abs/2603.03252
[^20]: Forge wiki, "Creating a Custom Set". https://github.com/Card-Forge/forge/wiki/Creating-a-custom-set
[^21]: mtgrares blog, "Card Scripting". http://mtgrares.blogspot.com/2012/01/card-scripting.html
[^22]: HearthSim blog, "New Site, New Blog, New Events API". https://hearthsim.info/blog/new-site-new-blog-new-events-api/
[^23]: SabberStone wiki, "Implement Cards". https://github.com/HearthSim/SabberStone/wiki/Implement-Cards
[^24]: Werner, "On Whiteboards, Naps, and Living Breakthrough", Wizards of the Coast, 2023. https://magic.wizards.com/en/news/mtg-arena/on-whiteboards-naps-and-living-breakthrough
[^25]: Schofield et al., HyperPlay paper, AAAI. https://ojs.aaai.org/index.php/AAAI/article/download/8335/8194
[^26]: boardgame.io docs, `stages.md`. https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/stages.md
[^27]: boardgame.io docs, Game API (`Game.md`). https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/api/Game.md
[^28]: Board Game Arena Studio docs, "Your game state machine: states.inc.php". http://en.boardgamearena.com/doc/Your_game_state_machine:_states.inc.php
[^29]: TAG wiki, "Actions and Rules". https://tabletopgames.ai/wiki/games/creating/actions_and_rules.html
[^30]: Lanctot et al., "OpenSpiel: A Framework for Reinforcement Learning in Games" (arXiv). https://arxiv.org/pdf/1908.09453
[^31]: OpenSpiel API reference (GitHub). https://github.com/google-deepmind/open_spiel/blob/master/docs/api_reference.md
[^32]: Thielscher, "A General Game Description Language for Incomplete Information Games", AAAI 2010. https://cdn.aaai.org/ojs/7647/7647-13-11177-1-2-20201228.pdf
[^33]: boardgame.io docs, `secret-state.md`. https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/secret-state.md
[^34]: Colyseus docs, "StateView". https://docs.colyseus.io/state/view
[^35]: VASSAL Reference Manual, "Mask". https://vassalengine.org/doc/latest/ReferenceManual/Mask.html
[^36]: colyseus/schema releases (GitHub). https://github.com/colyseus/schema/releases
[^37]: Colyseus 0.13.x docs, "Schema". https://0-13-x.docs.colyseus.io/state/schema/
[^38]: Wikipedia, "Zillions of Games" (secondary source, not independently verified in this research). https://en.wikipedia.org/wiki/Zillions_of_games
[^39]: PettingZoo docs, "Classic environments". https://pettingzoo.farama.org/environments/classic/
[^40]: Zha et al., "RLCard: A Toolkit for Reinforcement Learning in Card Games" (arXiv). https://arxiv.org/pdf/1910.04376
[^41]: "DouZero: Mastering DouDizhu with Self-Play Deep Reinforcement Learning" (arXiv). https://arxiv.org/pdf/2106.06135
[^42]: Dominiate docs, `gameState`. https://rspeer.github.io/dominiate/docs/gameState.html
[^43]: Fisher, DominionAI, `Event.h` (source code). https://graphics.stanford.edu/~mdfisher/Code/DominionAI/Event.h
[^44]: python-hsreplay wiki. https://github.com/HearthSim/python-hsreplay/wiki
[^45]: Fireplace fork (Hanqi-b/fireplace), README. https://github.com/Hanqi-b/fireplace
[^46]: mage-go (benprew fork), an XMage-inspired Go engine — description of XMage's architecture. https://github.com/benprew/mage-go
[^47]: XMage (magefree/mage, GitHub). https://github.com/magefree/mage
[^48]: Forge wiki, "Triggers". https://github.com/Card-Forge/forge/wiki/Triggers
[^49]: Fireplace wiki, "The Fireplace Card API". https://github.com/jleclanche/fireplace/wiki/1:-The-Fireplace-Card-API
[^50]: SabberStone (GitHub repo, HearthSim/SabberStone). https://github.com/HearthSim/SabberStone
[^51]: Dominiate docs, `cards`. https://rspeer.github.io/dominiate/docs/cards.html
[^52]: SabberStone wiki, "Changelog". https://github.com/HearthSim/SabberStone/wiki/Changelog

## Additional sources consulted

These appeared in the research tool's source list but weren't tied to a specific inline claim above (either a near-duplicate of a footnoted page, or background reading). Listed for completeness, not as support for any particular sentence.

- Board Game Arena docs, "State classes: State directory" — https://en.boardgamearena.com/doc/State_classes:_State_directory
- Colyseus 0.14.x docs, "Schema" — https://0-14-x.docs.colyseus.io/colyseus/state/schema/
- PettingZoo docs, "Leduc Hold'em" — https://pettingzoo.farama.org/environments/classic/leduc_holdem/
- OpenSpiel docs (Read the Docs), "Concepts" — https://openspiel.readthedocs.io/en/latest/concepts.html
- RLCard, list of games — https://rlcard.org/games.html
- Ludii, CNIA 2019 paper (French-language; likely source of the "extending Ludii = adding classes" quote in Findings §2, but not linked inline by the research tool) — https://ludii.games/publications/CNIA2019.pdf
- boardgame.io docs, `phases.md` — https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/phases.md
- boardgame.io docs, `turn-order.md` — https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/turn-order.md
- boardgame.io docs, `events.md` — https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/events.md
- OpenSpiel tutorial notebook (Colab) — https://colab.research.google.com/github/deepmind/open_spiel/blob/master/open_spiel/colabs/OpenSpielTutorial.ipynb
- Wikipedia, "Game Description Language" — https://en.wikipedia.org/wiki/Game_Description_Language
- Liner, review of the GDL-II paper (secondary) — https://liner.com/review/general-game-description-language-for-incomplete-information-games
- Scribd copy of the VASSAL Reference Manual — https://www.scribd.com/document/42728171/VASSAL-Reference-Manual
- Zha et al., RLCard, ICML/PMLR version — https://proceedings.mlr.press/v139/zha21a/zha21a.pdf
- Gitter, HearthSim/Hearthstone-Deck-Tracker channel (community discussion, possibly relevant to the event-ordering discussion in Findings §9, not confirmed) — https://gitter.im/HearthSim/Hearthstone-Deck-Tracker?at=5acbad6e1130fe3d36bbd1df
- mage-go (lephlaux, original repo) — https://github.com/lephlaux/mage-go
- SabberStone fork (fergunet/SabberStone) — https://github.com/fergunet/SabberStone
- HearthSim, list of simulators — https://hearthsim.info/simulators/
- Zillions of Games forum post (possibly related to the AI/hidden-information claim in Findings §4, not confirmed) — https://zillionsofgames.com/discus/messages/3/378.html
