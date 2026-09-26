# Carcass Eon: design

> Working document for our take on Carcassonne-style tile laying (D-038, D-039). The mechanics follow the classic base game, including fields and farmers. The theme is medieval. The name, art and all text are ours.

## The game in one paragraph

Players take turns drawing a tile and adding it to a shared, growing map. Its edges must match its neighbours: roads meet roads, cities meet cities, fields meet fields. After placing a tile, you may put one of your followers on a road, city or monastery on that tile, as long as nobody already holds the feature it joins. When a road, city or monastery is completed, it scores for whoever has the most followers on it, and those followers come home. When the tiles run out, unfinished features score too. The highest score wins.

For 2–5 players, about 30–45 minutes. The shared screen shows the whole map growing. Each phone shows your tile, where it can go, and your followers.

## Rules (v1)

**Setup**
- The start tile goes in the middle of the table. The other 71 tiles are shuffled into a face-down bag, and the bag count is shown.
- Each player has 7 followers. Scores start at 0.
- Turn order is seat order.

**A turn**
1. **Draw.** Take the top tile from the bag. Everyone sees it.
2. **Place.** Add it to the map, touching at least one tile edge-to-edge, in a rotation where every touching edge matches. If the tile fits nowhere, it's shown to everyone, set aside, and you draw again.
3. **Follow (optional).** Put one follower from your supply on one feature of the tile you just placed: a road, a city, a monastery or, with Farmers on, a field. You can't if that feature already connects to one with a follower on it, whoever's it is. A follower in a field lies down as a *farmer* and stays until the end of the game.
4. **Score.** Every feature this tile completed scores now. Followers on scored features go back to their owners.

**Completed features**

| Feature | Complete when | Scores |
|---|---|---|
| Road | Both ends finish at a junction, a city or a monastery, or it forms a loop | 1 per tile |
| City | Its walls are closed: no open city edge | 2 per tile, +2 per banner |
| Monastery | All 8 surrounding squares have tiles | 9 (1 + 8) |

**Fields** are never completed during the game. Farmers stay put until the end (see below).

**Who scores:** the player or players with the most followers on the feature. Ties all score in full. Features can end up with several followers when two separately claimed features are joined by a later tile. That's the heart of the game's competition.

**End of game**
- When the last tile is placed, unfinished features score for their majority holders:
  - roads: 1 per tile;
  - cities: 1 per tile, +1 per banner;
  - monasteries: 1, +1 per surrounding tile.
- **Farmers** (option, on by default): each field scores **3 per completed city it touches**, for whoever has the most farmers in it. A city can score for several fields.
- Highest score wins. Ties are shared.

**Options**
- **Farmers:** on by default. Switch it off for a table of newcomers.

**Later options**
- Turn timer (D-034).
- A larger follower worth two.
- River tiles to start.

## Tile set (v1)

These are the classic base-game counts: 24 types, 72 tiles including the start tile. They're balanced and well tested, so we keep them for v1 and consider our own tweaks later (see open questions). Ids are ours.

| Id | Tile | Count |
|---|---|---|
| `monastery-road` | Monastery, road leaving one side | 2 |
| `monastery` | Monastery in fields | 4 |
| `city-4-banner` | City on all four sides, banner | 1 |
| `city-1-road-straight` | City on one side; straight road across (also the **start tile**) | 3 + 1 start |
| `city-1` | City on one side | 5 |
| `city-2-across-banner` | City joining two opposite sides, banner | 2 |
| `city-2-across` | City joining two opposite sides | 1 |
| `city-1-1-opposite` | Two separate cities on opposite sides | 3 |
| `city-1-1-adjacent` | Two separate cities on adjacent sides | 2 |
| `city-1-road-right` | City on one side; road curving right | 3 |
| `city-1-road-left` | City on one side; road curving left | 3 |
| `city-1-junction` | City on one side; three-way junction | 3 |
| `city-2-corner-banner` | City joining two adjacent sides, banner | 2 |
| `city-2-corner` | City joining two adjacent sides | 3 |
| `city-2-corner-road-banner` | City on two adjacent sides, banner; road curving across the other corner | 2 |
| `city-2-corner-road` | Same, no banner | 3 |
| `city-3-banner` | City on three sides, banner | 1 |
| `city-3` | City on three sides | 3 |
| `city-3-road-banner` | City on three sides, banner; road out the fourth | 2 |
| `city-3-road` | Same, no banner | 1 |
| `road-straight` | Straight road | 8 |
| `road-curve` | Curved road | 9 |
| `road-junction-3` | Three-way junction | 4 |
| `road-junction-4` | Four-way junction | 1 |

## How it maps onto the engine

**Tile definitions are data.** Each tile type lists its four edges and its features. Each edge is split into three *slots*, clockwise, giving 12 slots per tile:
- a city edge fills all three slots;
- a road edge puts the road in the middle slot, with a field on either side;
- a field edge fills all three with field.

A feature is `{ kind: 'city' | 'road' | 'field' | 'monastery', slots, banner? }`. Everything else is derived from this: matching, joining, completion, scoring and even the procedural drawing. Rotation just shifts slots by three per quarter turn.

Example, `city-1-road-straight` (city north, road east–west):

```
city   N0 N1 N2                 (the whole north edge)
road   E1 W1                    (middle slots of east and west)
field  E0 W2                    (the strip between city and road)
field  E2 S0 S1 S2 W0           (everything below the road)
```

**The map.**
- Placed tiles live in the game state as `board["x,y"] = { tile, rotation }`. The map grows in any direction.
- A tile's slot on side *s* connects to the mirrored slot of its neighbour's opposite side: slot 0 meets slot 2, and 1 meets 1.
- Per D-006, board geometry stays in this game's code until a second board game needs it.

**Features across tiles.**
- Connected features are merged with union-find, recomputed from the board each time. 72 tiles is tiny, and recomputing keeps the logic pure and replayable.
- A road or city is complete when none of its slots faces an empty square.
- A monastery is complete when all 8 surrounding squares have tiles.

**Decisions** (D-017, D-018):
1. **Place:** a `place` prompt listing every legal position and rotation as a site (`"x,y,r"`). The phone groups the sites by square and offers the valid rotations for each.
2. **Follow:** a `choose` prompt with one option per free feature on the placed tile, plus "No follower".

The tile the player can't place is set aside automatically; it doesn't need a decision. The default answers used for absence (D-026) are the first legal placement and no follower.

Which fields touch which cities is derived from the slots: a field touches a city on a tile where one of its slots is next to one of the city's slots, around the tile's edge.

**Hidden information.**
- Only the bag order is hidden. The bag is a `count` zone shuffled from stream `shuffle/bag` (D-031).
- The current tile, the map, followers and scores are all public.
- Leak tests still run on every message: the next tiles must never be inferable.

**Components.** Tiles and followers are components, with real ids hidden behind refs as usual. A placed tile's position and rotation live in the game state. Followers sit in each player's supply zone or on the board.

## Screens

**Shared screen**
- The map, drawn in SVG, scaled to fit and panned smoothly as it grows. The last placed tile is highlighted.
- Scores, followers left, the bag count, the current tile and whose turn it is.
- Screen layouts (D-020): **Whole map**, or **Follow the action** (zoomed around the last placement).

**Phone, on your turn**
1. Your tile, large, with a rotate button.
2. The map, zoomable, with legal squares for the current rotation shown as ghosts. Tap one to preview.
3. Confirm.
4. Then choose a follower spot: the tile shows tappable hotspots on its free features, plus "No follower".

**Phone, otherwise:** the map (zoomable), scores, and your followers.

## Art plan

1. **Procedural tiles first.** SVG drawn from each tile's feature data, correct by construction:
   - fields as a base colour;
   - cities as walled shapes from their edges inwards;
   - roads as paths from edge midpoints to the centre or junction;
   - banners and monasteries as icons.

   This is what we develop and test with, and it stays as a fallback.
2. **Then an AI art trial with WaveSpeed**, for your feedback. There are two approaches, and I'd try both on a few tile types:
   - **Textures in procedural shapes.** Generate a small set of seamless textures (grass, road, city roofs and walls, a monastery) and fill the procedural shapes with them. Edges always line up, and style stays consistent.
   - **Whole-tile illustrations.** Generate one picture per tile type, prompted with its layout, and rotate it in the game. The result is richer, but roads and city walls may not meet exactly at the edges, and the style can drift between tiles.

   My recommendation is textures first, with a side-by-side trial of whole tiles on 3–4 types. You pick. The API key stays in `.env`, which git ignores; generation runs from a script, never from the server or the client.

## Decided (D-039)

- **Theme:** medieval, for the first iteration.
- **Tiles:** the classic distribution.
- **Players:** 2–5.
- **Farmers:** in v1, as an option that's on by default.

## Build plan

Status: steps 1–4 are done. Next are the WaveSpeed art trial and playing it on the TV.

1. Tile data for all 24 types, with a procedural SVG renderer and a contact sheet to check every tile and rotation by eye.
2. Unit tests:
   - edge matching and legal placements;
   - feature joining;
   - completion and scoring, on scripted maps with known answers;
   - rotation invariants.
3. The rules module, with random full games, leak tests and replay, like 21.
4. The board component: SVG with pan and zoom, on the shared screen and the phone, plus the placement and follower interactions.
5. The WaveSpeed art trial, then your feedback.
6. Play it on the TV.
