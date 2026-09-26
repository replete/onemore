# Synced Timers, Reaction Races and Response Windows in Networked Card Games

> Result for [05 — Synced timers, reaction races and response windows](05-timers-and-interrupts-prompt.md). Produced by an external deep-research tool on 2026-09-26; content is unedited.

For a browser card game played in one room, the server should own all time: it sends absolute deadlines, which each device converts to its own time using an offset estimated from the lowest-round-trip ping samples. The server accepts actions against its own clock, with a small, capped grace period. Reactions are opened as explicit response windows that every player sees, with the same pacing whether or not anyone can respond, so a pause never gives away a hidden hand. Shipped games agree on the key points. Chess sites compensate for lag only up to a server-enforced cap. MTG Arena and Master Duel both leak information through when they prompt, and both give players ways to hide it. Hearthstone and Marvel Snap avoided the problem by designing out-of-turn responses away.

## TL;DR
- **Sync and deadlines:** Estimate the offset over WebSocket in the style of Cristian's algorithm, keeping the lowest-RTT samples. On one Wi-Fi network this gives an error of a few milliseconds to a few tens of milliseconds. Send absolute server deadlines, count down with `performance.now()`, and let the server's clock decide. Clients never decide whether something was on time.
- **Reaction races:** In one room, the round-trip gap between players is usually far smaller than human reaction time. So the fair and cheat-resistant choice is "first valid action received by the server wins", plus a short collection window (about 100–150 ms, my inference) to settle near-ties. Client timestamps can be forged. Shooter-style rewind is overkill for a card game.
- **Response windows:** Give every player the same response window at the same key moments, whether or not they hold a response. Keep windows short and reset them per action. Offer "always prompt" or "full control" toggles. A fixed-pace window is the only reliable way to avoid timing tells; MTG Arena and Master Duel show the other approaches leak.

## Summary
1. Cristian's algorithm estimates the offset as server time + RTT/2. Its error is bounded by ±½(RTT − best RTT), so taking the offset from the minimum-RTT samples is the standard filter.
2. On good Wi-Fi, NTP-style sync between phones and a server was accurate to a few milliseconds. It got as bad as about 100 ms farther from the access point. An asymmetric path adds an offset of a few milliseconds that no algorithm can detect.
3. Quartz clocks drift by tens of ppm; 1 ppm is 86.4 ms per day. That is irrelevant over a single game. Re-sync mainly to track changes in the route and to catch sleep or wake events.
4. Use `performance.now()` to measure elapsed time locally, since it is monotonic. `Date.now()` can jump when the system clock is adjusted. Chrome runs each background timer "no more than once per second". Since Chrome 88 it checks chained timers only "once per minute" when a page has been hidden for more than 5 minutes, the chain count is 5 or more, the page has been silent for 30 seconds and WebRTC is not in use (Chrome for Developers). Always recompute from absolute time; never count ticks.
5. Absolute deadlines are better than remaining durations. Each client converts the deadline with its offset, so latency doesn't make the countdown late. When a new snapshot arrives, move the display to it smoothly rather than jumping.
6. Chess.com forgives a fixed allowance plus a small bank per time control: 500 ms per move plus a 1000 ms bank in Rapid, down to 200 ms plus 100 ms in Bullet. Lichess uses a server-side quota whose refill rate depends on the time control. Both cap compensation so it can't be abused.
7. Client-reported timing can be exploited. A 2021 Lichess issue showed that spoofed websocket fields gave players extra time. The server must measure time itself.
8. MTG Arena skips response windows automatically, based on per-card rules. That creates visible "stutters" that tell you an opponent has a response. Full control (Ctrl or Ctrl+Shift) and stops let players bluff.
9. Master Duel has On, Auto and Off prompt settings. On Auto, the small pauses before your own activations can tip off an opponent, so experienced players switch settings deliberately.
10. Common timer designs are a per-turn limit with a visible "rope", a per-action rope plus earned extensions (MTG Arena), chess-style increments, and poker time banks. In Hearthstone, "each turn lasts a maximum of 75 seconds", and the rope appears "when around 20 seconds are remaining" (Hearthstone Wiki). Casual players like short, visible, forgiving timers. They dislike being kept waiting by opponents who deliberately run the clock down (roping).

## Findings

### 1. Clock synchronisation between browsers and a server

**How to estimate the offset.** Cristian's algorithm (Rutgers CS 417 notes) sets client time to server time plus half the round trip. Its maximum error is "± ½[(round-trip time) − (best-case round-trip time)]". NTP extends this with four timestamps (T1 to T4) and offset = ((T2 − T1) + (T3 − T4))/2, under the same assumption that delay is equal in both directions (arXiv 2604.12961). The UCSD CSE 124 notes describe NTP as keeping the lowest-delay sample among the last eight exchanges, and the Wikipedia article on Cristian's algorithm makes the same point: longer round trips "indicate interference that is generally asymmetrical", so you should choose among samples by RTT. The npm `timesync` library, which works over HTTP or WebSockets, uses a common game-style variant. It takes five or more samples, sorts them by latency, discards those more than about one standard deviation above the median, and averages the rest. Browsers don't expose WebSocket ping/pong frames to JavaScript (SpacetimeDB issue #5926), so you need application-level ping messages. Answer them before any other message handling, so that queueing on the server doesn't inflate the RTT.

**How accurate it can be.**
- *Theoretical bound:* the error is at most half the round-trip spread. On a LAN where the best RTT is about 5 ms and the typical RTT about 20 ms, the bound is around ±7–8 ms (my calculation).
- *Measured on Wi-Fi:* a 2025 arXiv study of networked smartphones (2501.04886) ran 10⁵ NTP requests from 3 phones. The error was "a few ms for an optimal Wi-Fi communication (direct line, less than 3 meter distance), but rises up to 100 ms for larger distances to the Wi-Fi access point". The phones' own wall clocks differed from each other by about 1 second, which is why you must never trust raw device time.
- *Latency tails:* an arXiv study of wireless multi-connectivity (1909.03875) measured Wi-Fi one-way uplink latency of about 5 ms for 90% of packets but about 80 ms to reach 99%. LTE was about 36 ms at the 90th percentile and 40 ms at the 99th. Wi-Fi is faster on average but has worse spikes, so filtering by minimum RTT matters most there.
- *Asymmetry:* Meinberg's knowledge base notes that an asymmetric connection "can cause a real time offset of a few milliseconds which the client software can't determine". NTP over the public internet usually holds to tens of milliseconds, and to under 1 ms on a LAN "under ideal conditions" (Wikipedia, Network Time Protocol). A browser adds event-loop jitter on top, so expect single-digit to low tens of milliseconds on home Wi-Fi and tens of milliseconds on mobile networks (my inference).

**How much clocks drift.** Drift is measured in ppm, and 1 ppm = 86.4 ms per day (Wikipedia, Clock drift). Common quartz crystals vary by ±20 ppm (US patent 8767901), and "real clocks have a frequency error of several PPM quite frequently", changing about 1 ppm per °C (the NTP FAQ, University of Delaware). Measured between two phones, drift was under 10 ms over 10 hours (arXiv 2501.04886). Within a browser, `performance.now()` can itself drift from `Date.now()` by "several ms per minute" (Chromium issue 41450546), partly because the monotonic clock is not slewed by NTP and can pause while the device sleeps. In practice, drift over a 30-minute game is negligible. Re-sync every 10–30 s and after `visibilitychange` so you track route changes and wake-from-sleep jumps (my recommendation).

**`performance.now()` vs `Date.now()`.** MDN says `Date.now()` follows the system clock and can be "tweaked a few milliseconds several times per hour", or changed by the user. `performance.now()` is monotonic, "never decreases and isn't subject to adjustments". Use `performance.now()` for all local elapsed-time maths, meaning the RTT and the countdown between server updates. Express the offset as `serverTime − performance.now()` at the moment the sample arrives. Wall-clock time is only useful for display or for logging across sessions.

**Background-tab throttling.** Chrome has run background timers no more than once per second since Chrome 11. Since Chrome 57, "a page is subjected to time budget limitations after 10 seconds in the background", and the budget regenerates "at a rate of 0.01 seconds per second". Pages playing audio, and pages with WebSockets or WebRTC, are exempt from the budget, but "the run-timers-once-a-second rule is still applied" (Chrome for Developers, "Background tabs in Chrome 57"). Chrome 88 (January 2021) added "intensive throttling". It applies only when a page has been "hidden for more than 5 minutes", the "chain count is 5 or greater", the page has been "silent for at least 30 seconds" and "WebRTC is not in use"; in that case "the browser will check timers in this group once per minute" (Chrome for Developers, "Heavy throttling of chained JS timers beginning in Chrome 88"). So a tab that has been hidden will have a stale display and may run callbacks late. Always recompute the display from the absolute deadline, re-sync when the tab becomes visible again, and never let the client's timer be the thing that causes a timeout.

### 2. The same countdown on every device

**Send absolute deadlines, not remaining durations.** If you send "12 s remaining", every client is late by its one-way latency, and each client is late by a different amount. If you send "deadline = server time T", each client computes `T − (performance.now() + offset)` and all displays agree to within the sync error. One developer describes moving to a server-chosen absolute `init_time` broadcast to all clients, because latency "isn't the same for everyone. One client might receive the message in 50ms, while another might get it 300ms later" (Medium, Flowersayo). A useful hybrid is to send both the deadline and the remaining time as seen by the server. If the offset estimate isn't ready yet, the client can fall back to the remaining time minus RTT/2 (my recommendation).

**Smoothing and correction.** Render from `requestAnimationFrame`, recomputing the time left every frame. When a new offset or deadline arrives, blend towards it over about 200–500 ms rather than jumping. Only snap when the error is larger than about 250 ms (my recommendation; this mirrors the reconciliation by blending that shooters use). Never let the displayed time go back up during a turn unless time really was added, such as an increment or lag credit, and say so on screen when it happens. Chess.com's help centre explains that jumping clocks confuse players: "possibly thinking there is something fishy going on".

**What shipped games do.**
- *Chess.com* runs each clock on your screen but adjusts both clocks when a move arrives, so "neither player is charged for the move's travel time". Your opponent's clock "will start counting down on your screen when the move hits our server", then adjusts when their move reaches you (Chess.com Help Center, "What is lag forgiveness?").
- *Lichess:* what a client shows is, in a forum user's words, "a simulation of your opponent's clock … correct as long as it is in sync with the true clock". The official /lag page says server processing latency "rarely exceeds 10ms".
- *Hearthstone:* according to the Hearthstone Wiki (Turn), "each turn lasts a maximum of 75 seconds", and "when around 20 seconds are remaining… a burning rope fuse will appear". To make up for animation time, it adds "slush" time at the start of the turn, which covers the gap between when the turn starts on the server and when it appears to start in the client. Players still see opponents act after the rope has visibly run out, because "your opponent is doing his plays much faster than you see him play the Cards" (HearthPwn forum). The server's clock is what counts; animations only lag behind it.

### 3. Deadlines on the server

**Actions near the deadline.** The server is the only judge. It timestamps each action when it arrives and compares that with its own deadline plus a grace period. Actions that arrive after that are rejected, and the client is told so explicitly (my recommendation). Hearthstone's view, as players summarise it, is that "the turn will always end at 75 seconds" (HearthPwn). The server wins even when a client's animations are still playing.

**Grace periods and lag compensation.** Chess.com publishes its rules. Each move is forgiven a fixed amount, and a bank that refills every two moves covers spikes:

| Time control | Forgiven per move | Bank (refills every 2 moves) |
|---|---|---|
| Rapid | 500 ms | 1000 ms |
| Blitz | 300 ms | 400 ms |
| Bullet | 200 ms | 100 ms |

(Chess.com Help Center, updated July 3, 2026.) "Chess.com doesn't forgive an unlimited amount of lag! If you have 1+second lag for multiple moves in a row, you will notice the lost time on your clock."

Lichess says its compensation covers "sustained lag and occasional lag spikes", with limits "based on time control and already-compensated lag" (lichess.org/lag). In a forum post, the Lichess developer Toadofsky quoted the code that sets the per-move quota gain from the estimated game length (initial time + 40 × increment). The gain is 20 centiseconds (200 ms) for games of 15 s or less, 35 cs up to 30 s, `i/4 + 30` cs in between, and 100 cs (1 s) at 180 s or more. The quota works like a token bucket. According to the subagent's reading of the scalachess `LagTracker` from memory (**unverified**), it starts at 3× the gain and is capped at 7× the gain, so a 1/4+0 game has about 600 ms to start and at most 1.4 s. Compensation beyond the quota is charged to the player's clock. The developer isaacly once wrote that the ultrabullet cap was reduced "to a 400ms per turn cap", which shows the constants have been tuned over time.

**Preventing abuse.** The Lichess case shows why the server has to measure time. In lila issue #10300 (December 2021), a user reported: "Say we mock the websocket and set d.s = 0, and d.l=500. This gives players significantly more time per game than their opponent … Time and lag compute needs to get moved to server side." According to the subagent (**unverified; I could not open the fix**), the response capped each player's quota gain by the lag the server measures itself on the socket plus about 50 ms for CPU, so a forged report can only drain a quota whose refill rate the server controls. Players still complain in both directions. Users in fast games say opponents who lag "finish with few seconds more" (lila #14444, closed as not planned), and one user alleges "selective lagging". These are anecdotes, not evidence of a systematic exploit. Lichess developers argue that tournament-only limits would distort ratings.

### 4. Reaction races

**First received wins.** The server orders actions by when they arrive. It is simple and impossible to spoof, but it favours players with lower latency. Across the internet that bias can be tens to hundreds of milliseconds, which is larger than the differences in human reaction time.

**Client timestamps.** Each client stamps its action with sync-corrected time, and the server picks the earliest. That is fair in theory but trivially forgeable. It is the same class of hole as Lichess #10300, where anything computed on the client "can be arbitrarily modified". It is safe only between trusted players, or if the server rejects timestamps that fall outside the window it could possibly have observed (arrival time minus RTT, minus tolerance).

**Rewind and lag compensation (shooters).** In the Source engine, the server rewinds other players to where the shooter saw them. "By default only players are rewound, and one second of location/animation history is kept" (Valve Developer Community, Lag Compensation). This is fair to the player acting but creates "peeker's advantage", and it can be exploited: a GameDev.net poster notes that a lag switch adding 100+ ms lets you "see players before they see me", and warns that hackers have been manipulating rewind-based systems "for 2 decades". Capping the rewind window, as Valve does with one second of history, limits the damage.

**Good enough in one room (inference).** On a shared Wi-Fi network, one-way latency is typically a few milliseconds but has tails up to about 80 ms (arXiv 1909.03875). Human reaction times are several hundred milliseconds, so differences between players are usually far larger than differences in network delay. Recommended rule: first valid action received wins. The server holds a short collection window, say 100–150 ms from the first valid claim, and breaks ties inside it with an RTT-adjusted estimate taken from the server's own RTT measurements, never from client timestamps. If the result is still within a few milliseconds, break it with a fixed rule such as turn order or seat order. Tell players the rule. Visibly tied results ("both hit within 20 ms") feel fairer than a hidden coin-flip.

### 5. Response windows in digital card games

- **MTG Arena.** Magic lets opponents respond throughout a turn. Wizards found that in earlier digital versions (Magic Online and Duels of the Planeswalkers), waiting for players to respond or decline to respond slowed the game down. Arena's Game Rules Engine uses per-card rules "to determine when reactions to a played card needed to be allowed, using observations from Magic tournament play" (Wikipedia, citing developers). By default Arena passes priority automatically when you have nothing to play. Players can set stops on specific phases by clicking the phase bar. Holding Ctrl gives full control for the current step, and Ctrl+Shift keeps it on until you turn it off (MTG Arena Zone; Flipside Gaming).
- **Yu-Gi-Oh! Master Duel.** Activation confirmation has three states. *On* prompts at every legal point, including chaining your own cards. *Auto* only prompts when the game thinks a response is relevant. *Off* never prompts. Players typically map the modes to held mouse buttons: hold left for On, hold right for Off, and Auto when idle. Each prompt stops the game, hands the timer to the prompted player and makes the opponent wait (Out of Games; Steam discussions).
- **Legends of Runeterra.** Spell speed controls response windows. Slow spells pass priority and can be answered by fast or burst spells. Fast spells can be played in combat and answered. Burst and Focus spells resolve instantly and don't pass priority (Riot support; Wikipedia). The stack holds 9 fast or slow spells, with a 10th slot reserved for burst (LoL Wiki). This keeps windows limited to moments players can predict. In patch 3.6, Riot let the opponent end the round if you pass after playing only burst or focus spells, which shut off stalling loops.
- **Hearthstone.** It removed out-of-turn interaction on purpose. The wiki records that a "Combat Tricks" feature was cut early in development because removing it "actually made the game more fun, as well as further improving its speed". Secrets were changed in patch 1.0.0.4944 to trigger only on the opponent's turn. They are automatic and hidden, so no prompt is ever needed. In a GDC talk Ben Brode listed "no responses" among Hearthstone's innovations (mobilegamer.biz).
- **Marvel Snap.** It removes the problem entirely: both players take their turns at the same time. Cards are then revealed in the order played, "with the player who is currently leading revealing first" (Out of Games). Brode says simultaneous turns are "double the speed, but not half of the decisions", and that they grew out of wanting "really interesting mind games" (GamesBeat).

**Keeping play moving when windows are rarely used.** The patterns are:
1. Skip windows automatically when no legal response exists (MTG Arena, Master Duel on Auto).
2. Limit which card types can open a window (LoR's speeds, Hearthstone's automatic secrets).
3. Make turns simultaneous (Snap).
4. Give windows short timers of their own that reset per action (LoR resets to 8 s after a burst spell).

### 6. Information leaked by timing

Skipping windows automatically leaks information. MTG Arena Zone writes that if the opponent has a response "there will be a noticeable stutter compared to the smoothness that Arena passes if the opponent has nothing", and that pauses when you cast spells can reveal counterspells. Players counter it by using full control "to bluff having an instant spell" (Beginner's guide to MTGA). The Master Duel guide at Out of Games gives a concrete case. Holding Maxx "C" on Auto during your own turn "tip[s] off your opponent, who keeps noticing how your activations have tiny breaks between activation and resolution", because you have to cancel every prompt. Switching to Off for that turn hides it. The opposite risk also exists: with Auto on, experienced players deliberately toggle On to create fake pauses.

So there are three ways to handle it:
1. **Opt-in bluffing tools** (Arena's full control, Master Duel's On mode). The tell remains for anyone who doesn't use them, and the burden falls on experts.
2. **Always prompt, or fixed delays.** Pause for the same time whether or not a response exists. This is the only approach that leaks nothing, but it costs time every time.
3. **Remove the reactive layer** (Hearthstone, Snap).

For a small in-person game, option 2, applied only at a few meaningful moments, is the best trade-off (my inference).

### 7. Turn timers and time banks

- **Per-turn timer with a rope (Hearthstone).** According to the Hearthstone Wiki, "each turn lasts a maximum of 75 seconds" (90 in alpha), and the rope appears "when around 20 seconds are remaining". An AFK player's next turn starts with a faster fuse, "giving them around 7 seconds to play", and the first two turns have been shorter since patch 10.2. Players see roping as bad manners. It "falls under bad manners rather than cheating" and isn't penalised (Out of Games).
- **Per-action rope plus earned extensions (MTG Arena).** A 30-second rope appears when you take too long on a single action. MTG Arena Zone's "Playing a Match" guide says "playing three turns without the rope adds one time extension", and "if you have none, it will force you to pass priority"; a best-of-three match also has "a total of 30 minutes for the whole match". An Arena developer post from 2019 on devtrackers.gg explains: "You start with 0 timeouts… If the rope expires you'll consume your timeouts for an additional 30s until you run out of them… If you don't act for about 2 min, the game concedes for you when your current turn ends." Players complain that it is gamed and inconsistent. Treat those forum claims as anecdotal.
- **Round timer with anti-stall rules (LoR).** Roping for 3 turns in a row concedes the game automatically. The timer resets to 8 s when a burst spell is played (LoL Wiki).
- **Chess increments.** Fischer increments add time after each move, and Bronstein delays add back up to the time used, never more than the increment. Chess.com and Lichess build their lag allowances on top of these.
- **Poker time banks.** On GGPoker the normal time to act is 10 s preflop and 15 s per later street. Time Bank Cards add time. When the free ones run out, a Paid Time Bank Card costs 1 big blind for 30 s, which is "shared equally among the players at the table" (GGPoker; poker.pro). Other sites are more traditional. On PokerStars, according to a forum description, you start with 30 s and gain 10 s per 50 hands. Winning Poker Network's time bank depends on stakes and refills by 1 s per 10 hands. GGPoker frames its system as a way to stop stalling and real-time-assistance tools; critics see it as charging for thinking time.

**How they feel to casual players (inference from player discussion).** Casual players tolerate short, visible, forgiving timers. They hate waiting on a deliberate staller, and they hate losing because of animation time they didn't cause. Small banks that are earned or refilled work better than hard cut-offs. A large pool of time for the whole game invites griefing.

## Recommended design: a browser card game played in the same room

**Architecture.** Use one authoritative server: a small Node or Deno process on a laptop or in the cloud, connected over WebSocket. Clients never decide whether something was on time or who won a race.

**1. Clock sync**
- When a player connects, send 8–10 app-level pings about 100 ms apart. Each reply carries the server's receive and send times, and the client records `performance.now()` for T1 and T4.
- Compute the offset from the samples in the lowest RTT quartile, taking the median offset of those. Re-sync every 15–30 s, on `visibilitychange` becoming visible, and after any reconnect. Smooth offset updates with an exponential moving average, and ignore samples whose RTT is more than twice the best.
- Keep each client's RTT on the server too, measured from its own pings, for use in tie-breaks.
- Expected error in one room is about 2–20 ms. That is far below anything a human can perceive in a card-game countdown.

**2. Deadlines**
- Broadcast `{deadlineServerMs, durationMs, seq}`. Clients render `deadline − (performance.now() + offset)` in `requestAnimationFrame`, blend offset corrections over 300 ms, and never let the display count back up without saying why.
- On the server, `accept if arrival ≤ deadline + grace`, with grace = min(150 ms, the player's RTT/2 + 50 ms). Cap how much grace a player can use across the game (for example 1 s per round, refilled each round), borrowing the idea of Chess.com's bank. Reject late actions explicitly ("Too late by 0.3 s").
- Turn timers: a generous per-turn limit (such as 60 s) with a visible rope in the last 15 s. Add a small time bank that refills (for example +5 s earned per quick turn, up to 30 s). Freeze the timer during animations the server knows about, which is like Hearthstone's slush. Drop timers entirely in a "casual" mode, because people in the same room can simply nudge each other.
- Background tabs: the server enforces time regardless, and the client redraws on becoming visible again. Use a Screen Wake Lock on phones so screens don't dim mid-game.

**3. Reaction races (such as "first to slap" or "snap" moments)**
- The server announces a "go" at an absolute server time T. Clients reveal the stimulus at T using their offset, so everyone sees it within about 10–20 ms of each other. Any claim that arrives before T plus minimum RTT/2 counts as a false start.
- The first valid claim opens a collection window of about 120 ms. When it closes, rank claims by `arrival − RTT_i/2`, using the server's own RTT measurements. Ignore client timestamps, or use them only as a sanity check. Break exact ties by seat order.
- Show the result with the margins ("Alex by 45 ms"). In one room, visible fairness matters more than accuracy to the millisecond.

**4. Response windows**
- Define a small, fixed set of window points, such as "after a card is played" and "before combat damage". Open every window for every eligible player, whether or not they hold a response, and give each the same short pace, such as 2.5 s with a visible pie timer. Close a window as soon as everyone has passed.
- Let the players who act first say they won't respond ("no response this round"). That's fine, because it gives away no more than their visible choice.
- Offer three settings, like Master Duel: "always prompt" (fixed-pace windows, no tells), "smart" (skips windows only when a player has no response and the skip isn't observable, for example when all players have empty hands), and "quick" for players who accept the tells.
- Resolve responses in the order the server received them, stack style. Once everyone has passed, resolve automatically.
- Consider Snap-style simultaneous commits for the high-tension moments. Everyone locks in hidden choices, then all are revealed together. This removes both timing races and timing tells.

## Caveats
- Forum claims (Chess.com, Lichess, Hearthstone, Arena, Steam) are anecdotal. I've used them only to describe how players feel, not how the systems work.
- The per-time-control Lichess quota formula comes from a developer quoting code in a forum post. The 3×/7× bucket limits and the #10300 fix mechanism come from a subagent's recollection of the source and are **unverified**.
- The accuracy numbers come from specific studies (3 phones; one wireless testbed). Your network may differ.
- Browser throttling rules change between versions. The Chrome figures come from Chrome for Developers posts about Chrome 57 and 88.
- The numbers in the Recommended design section (collection windows, grace periods, blend times) are my engineering judgement, not published standards. Test them with real players.

Sources:
1. Rutgers University — https://people.cs.rutgers.edu/~pxk/classes/417/notes/clocks.html
2. arxiv — https://arxiv.org/pdf/2501.04886
3. Meinberg Global — https://kb.meinbergglobal.com/kb/time_sync/time_synchronization_accuracy_with_ntp
4. Wikipedia — https://en.wikipedia.org/wiki/Clock_drift
5. lichess — https://lichess.org/forum/lichess-feedback/stop-promoting-laggers--lag-cheaters-to-fast-game-controls
6. chess — https://support.chess.com/en/articles/8615369-what-is-lag-forgiveness-why-did-the-clocks-suddenly-change
7. github — https://github.com/lichess-org/lila/issues/10300
8. MTG Arena Zone — https://mtgazone.com/arena-hot-keys-and-interface-guide-simplify-your-game-with-these-easy-tricks/
9. Wikipedia — https://en.wikipedia.org/wiki/Magic:_The_Gathering_Arena
10. Flipside Gaming — https://flipsidegaming.com/blogs/magic-blog/mtg-arena-hot-keys-and-using-the-interface
11. Out of Games — https://outof.games/realms/yugioh/guides/225-activation-confirmation-toggle-function-how-to-make-the-most-of-master-duels-prompts/
12. arxiv — https://arxiv.org/pdf/2604.12961
13. UCSD — https://cseweb.ucsd.edu/classes/sp18/cse124-a/post/schedule/14-Time.pdf
14. Wikipedia — https://en.wikipedia.org/wiki/Cristian's_algorithm
15. GitHub — https://github.com/enmasseio/timesync
16. npm — https://www.npmjs.com/package/timesync
17. GitHub — https://github.com/clockworklabs/SpacetimeDB/issues/5926
18. arxiv — https://arxiv.org/pdf/1909.03875
19. Wikipedia — https://en.wikipedia.org/wiki/Network_Time_Protocol
20. uspto — https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8767901
21. Ilya Safro — https://www.eecis.udel.edu/~ntp/ntpfaq/NTP-s-sw-clocks.htm
22. Chromium — https://issues.chromium.org/issues/41450546
23. MDN Web Docs — https://developer.mozilla.org/en-US/docs/Web/API/Performance/now
24. MDN Web Docs — https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/High_precision_timing
25. Medium — https://medium.com/@flowersayo/syncing-countdown-timers-across-multiple-clients-a-subtle-but-critical-challenge-384ba5fbef9a
26. Lichess — https://lichess.org/forum/lichess-feedback/can-anybody-explain-what-the-lag-compensation-is-doing
27. lichess — https://lichess.org/lag
28. HearthPwn — https://www.hearthpwn.com/forums/hearthstone-general/general-discussion/231822-fix-the-rope-timer-to-be-accurate
29. HearthPwn — https://www.hearthpwn.com/forums/hearthstone-general/general-discussion/219409-why-are-people-allowd-to-play-past-the-timer
30. lichess — https://lichess.org/forum/lichess-feedback/the-problem-that-never-dies
31. github — https://github.com/lichess-org/lila/issues/14444
32. Lichess — https://lichess.org/forum/lichess-feedback/reduction-of-lag-compensation-limit
33. lichess — https://lichess.org/forum/general-chess-discussion/prevent-lag-compensation-at-ultra-and-hyper-bullet-games?page=3
34. Valve Developer Community — https://developer.valvesoftware.com/wiki/Lag_Compensation?uselang=en
35. GameDev.net — https://gamedev.net/forums/topic/713681-lag-compensation/
36. steamcommunity — https://steamcommunity.com/app/2141910/discussions/0/6579276631058759450/?l=german
37. Redirect — https://min.news/en/game/c16b90fed43e8831f3997308a76b2692.html
38. steamcommunity — https://steamcommunity.com/app/1449850/discussions/0/3187989767046451791
39. steamcommunity — https://steamcommunity.com/app/1449850/discussions/0/5595187488977629948
40. Wikipedia — https://en.wikipedia.org/wiki/Legends_of_Runeterra
41. Legends of Runeterra — https://support-legendsofruneterra.riotgames.com/hc/en-us/articles/360036067293-Types-of-Spell-Cards-and-How-They-Work
42. Fandom — https://leagueoflegends.fandom.com/wiki/Spell_(Legends_of_Runeterra)
43. Substack — https://riwan.substack.com/p/lor-reflections-220510
44. New Hearthstone Wiki — https://hearthstone.wiki.gg/wiki/Secret
45. Blakeir — https://blakeir.com/second-dinners-ben-brode-reveals-marvel-snaps-recipe-for-success-literally
46. TheGamer — https://www.thegamer.com/marvel-snap-second-dinner-ben-brode-reveal/
47. Out of Games — https://outof.games/realms/marvel-snap/guides/255-how-to-play-marvel-snap/
48. VentureBeat — https://venturebeat.com/pc-gaming/ben-brode-bets-super-speed-will-make-marvel-snap-stand-out/
49. Fandom — https://leagueoflegends.fandom.com/wiki/Round_Timer_(Legends_of_Runeterra)
50. Google Sites — https://sites.google.com/view/beginners-guide-to-mtga/hotkeys-and-using-the-interface
51. Out of Games — https://outof.games/realms/hearthstone/guides/553-hearthstone-why-do-people-rope-explained/
52. steamcommunity — https://steamcommunity.com/app/2141910/discussions/0/5943120984226358192
53. steamcommunity — https://steamcommunity.com/app/2141910/discussions/0/4365746543858777955
54. apple — https://apps.apple.com/app/id1208199658
55. PokerPro — https://www.poker.pro/poker-news/ggpoker-implements-new-controversial-feature-paid-time-bank-card/
56. GGPoker — https://ggpoker.com/blog/time-bank-cards/
57. GGPoker — https://ggpoker.com/poker-games/time-bank-card/
58. Twoplustwo — https://forumserver.twoplustwo.com/28/discussion-poker-sites/what-rule-pokerstars-time-bank-543317/
59. Winningpokernetwork — https://www.winningpokernetwork.com/time-bank/
