# Synced timers, reaction races and response windows in networked games

Research how networked multiplayer games, especially browser-based and turn-based card games, keep countdown timers in sync across devices, decide who acted first in reaction-based moments, and handle windows where players can respond out of turn.

## Questions

1. **Clock synchronisation between browsers and a server.**
   - How is NTP-style offset estimation done over WebSockets (e.g. Cristian's algorithm, filtering by round-trip time)?
   - How accurate can it be on home Wi-Fi and on mobile networks?
   - How much do clocks drift?
   - When should `performance.now()` be used rather than `Date.now()`?
   - How are timers throttled in background tabs?
2. **The same countdown on every device.** Is it better to send absolute deadlines or remaining durations? How should displays be smoothed and corrected? What do shipped games do, including online chess clocks on sites such as Lichess and Chess.com?
3. **Deadlines on the server.**
   - How are actions handled when they arrive around the deadline?
   - How do grace periods and lag compensation work?
   - How do chess sites compensate for lag while preventing abuse?
4. **Reaction races.** How do real-time games decide who acted first? Compare first-received-wins, client timestamps, and lag compensation or rewind as used in shooters. What are the cheating risks? What's good enough when all the players are on the same local network?
5. **Response windows in digital card games.** How do these games handle responses out of turn:
   - MTG Arena: priority, auto-pass and stops;
   - Yu-Gi-Oh! Master Duel: chain prompts;
   - Legends of Runeterra;
   - Hearthstone, which chose to avoid instant-speed interaction;
   - Snap-style reaction games?

   How do they keep games moving when windows are rarely used?
6. **Information leaked by timing.** If a game pauses or prompts only when a player has a possible response, opponents learn something. How do digital card games deal with this? Examples include Master Duel's chain settings, fixed delays, options to always prompt, and MTG Arena's "full control" mode.
7. **Turn timers and time banks.** What are the common designs in digital card and board games? For example: per-turn timers, Hearthstone's rope, chess increments, and time banks in online poker. How do they feel to casual players?

## Output

- **Summary:** up to 10 bullets.
- **Findings:** one section per question.
- **Recommended design:** for a browser-based card game played by people in the same room, covering how to sync clocks, how to handle deadlines, how to decide reaction races, and how to run response windows.
- **Sources:** cite them inline with links, and mark anything inferred.
