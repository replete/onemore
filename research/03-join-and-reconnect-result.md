# Phone-as-Controller Multiplayer: How Products Handle Joining, Hosts, Audiences, Disconnects, and Mobile Browser Limits (September 2026)

The pattern that works is the one Jackbox and Kahoot converged on: a short code on the shared screen plus a QR code that pre-fills it, a first-joiner "VIP"/host role that the display can override, a separate audience tier past the player cap, and server-held seats that a phone can reclaim with a stored token — because mobile browsers will kill or freeze your WebSocket within seconds (iOS) to about a minute (Android Chrome 139+) of backgrounding, and nothing you do in a web page reliably prevents that.

## TL;DR

- **Design for the socket dying, not for keeping it alive.** iOS Safari has been reported to fire `onclose` immediately on screen lock or app switch, and Chrome on Android freezes background pages after 5 minutes (being cut to 1 minute from Chrome 139 in a staged rollout); hold each player's seat server-side for a grace period, reconnect on `visibilitychange`/`pageshow`/`resume`, and use the Screen Wake Lock API (Safari 16.4+, fixed for home-screen apps in iOS 18.4; Chrome 84+; Firefox 126+) to stop the lock from happening in the first place.
- **Short codes are fine if you add friction elsewhere.** Jackbox's 4-letter codes (about 457,000 combinations) were brute-forced by a public script until rate limiting arrived in January 2023, and Zoom's 9–11 digit IDs were guessable enough that Check Point Research could predict about 4% of randomly generated meeting IDs (Krebs on Security, April 2020); pair a small, confusable-free, profanity-filtered alphabet with rate limiting, lobby locking, host kick, and optional "must see the screen" verification like Kahoot's 2-Step Join.
- **Anonymous identity must survive a reload but not be trusted beyond the session.** Store a per-room reconnect token in localStorage and mirror it in a cookie; expect it to vanish in Safari Private Browsing (per-tab, ephemeral), in QR "Code Scanner" in-app views, and in social-app WebViews, and treat ITP's 7-day cap as irrelevant for single sessions but fatal for "remember me" features.

## Key Findings

1. **Joining converges on "code + name + go".** Jackbox asks for a 4-letter room code and a name at jackbox.tv, with a randomly assigned avatar (or a drawn one in Drawful 2). QR sign-in that pre-fills the code arrived with The Jackbox Party Starter (July 2022 update) and Party Pack 9. Kahoot adds a PIN, an optional player identifier, a nickname (or a generated one), and optional 2-Step Join. Netflix skips codes entirely: scan QR → native app → paired through the same Netflix account.
2. **Role assignment is mostly positional.** In Jackbox, the first joiner becomes VIP; players beyond the cap (typically 8, sometimes 10 or 16) become audience automatically. AirConsole exposes a "master controller" (by default the first device, with premium "hero" devices taking priority). Kahoot has no player-side host: the presenter's screen is the host.
3. **Host powers are small but decisive.** Jackbox VIP can start the game and (if enabled) censor players; moderators on mod.jackbox.tv can pre-screen content and, since Party Pack 9, kick players — including the VIP, which passes VIP status to another player. A "Start Game from Controller" toggle returns control to the display device's owner.
4. **Disconnect handling ranges from generous to punitive.** Jackbox holds a seat by cookie and pauses the whole game for five minutes if the *host* drops (Party Pack 9+). Kahoot offers "Resume as [nickname]" in classic mode, but team mode with personal devices forces a new nickname and a zeroed score. Streamers' top complaint about Jackbox was that idle or departed players made every timer run to zero.
5. **Abuse is real and recurring.** Kahoot bot-flooding scripts (e.g., a public repo joining 40 clients per PIN) prompted 2-Step Join, the nickname generator, locking, and player identifiers. Zoom-bombing in 2020 was enabled by guessable meeting IDs and brute-forceable 6-digit passcodes, fixed by default passwords, waiting rooms, and rate limiting.

## Comparison Table (Questions 1–5)

| Product | Q1 Joining (code, QR, roles, cap, late join) | Q2 Codes & abuse | Q3 Host control | Q4 Audience/spectators | Q5 Disconnects |
|---|---|---|---|---|---|
| **Jackbox (jackbox.tv)** | 4 letters, case-insensitive; QR pre-fills code (Party Starter/PP9+); name max 12 chars (Drawful 2); random or drawn avatar; typically 8 players (up to 10 in PP8, 16 in some games); late joiners become audience | Random letters with a profanity blocklist since 2014; brute-force room finder worked until rate limiting (Jan 2023); password, Twitch login, room-code hiding, player limits | First joiner = VIP (start, censor); "Start Game from Controller" returns control to display; moderators kick (PP9+); VIP reassigned if kicked | Same code; overflow joins audience; up to 10,000 audience members; votes influence scoring; can be disabled | Cookie-based rejoin (same browser); host drop pauses game 5 min (PP9+); kicked players mid-game stay visually but can't submit; no auto-skip for idle players (long-standing complaint) |
| **AirConsole** | Numeric code shown on screen (AirConsole marketing describes a seven-digit "link code"); QR also used; developer sets max players; "game is full" message beyond cap | Not documented publicly | Master controller API (`getMasterControllerDeviceId`); premium "hero" devices take master status | No formal audience role in SDK; games decide via `setActivePlayers` | Games handle `onConnect`/`onDisconnect`; Pong example resets active players when an active player leaves; persistent data keyed by device UID, unreliable on the screen |
| **Kahoot!** | Numeric PIN (secondary sources say 6–10 digits); QR and direct link; nickname or generator (3 spins, 800 combos in 2017); late join allowed unless locked; cap by plan: 10 free personal, 3 free business, up to 5,000 on Event Max | 2-Step Join (4-tile pattern, refreshes every 7–10 s); lock; kick; player identifier; bots actively countered | Presenter screen is host: start, lock, kick, settings, pacing | No separate spectator role; host screen is the shared view | Classic: "Resume as [nickname]" keeps score; Team (personal devices): must rejoin with new nickname, score reset |
| **Mentimeter** | 8-digit code at menti.com; persistent QR/link; anonymous by default | Code rotates after 2 days of inactivity; QR/link stay stable | Presenter controls pace (Presentation mode) or participants self-pace (Survey mode); can disable participation | Every participant is effectively audience | Stateless voting; rejoin via link |
| **Slido** | Event code or link/QR (not verified in this research) | Not verified | Host moderates Q&A (not verified) | Participants are audience | Not verified |
| **Netflix TV games** | QR only; requires Netflix app (Android) or Netflix Game Controller app (iOS); same Netflix account; each player needs a phone | Account-bound pairing avoids public codes | "N" button overlay on phone shows QR to add controllers, achievements, exit | None | Not documented publicly |
| **Google Meet** | 10-letter code `abc-mnop-xyz`, case-insensitive, hyphens optional | Codes expire ~365 days after last use and can be reused | Host/co-host roles (outside scope) | Companion mode / viewers | N/A |
| **Zoom** | 9–11 digit meeting ID plus passcode | ~4% of random IDs predictable (Check Point Research, summer 2019, per Krebs on Security); 6-digit passcode (1 million combinations) brute-forceable in minutes until Zoom improved rate limiting and relaunched the web client on 9 Apr 2020 | Waiting room, lock, remove | Webinar attendee role | N/A |
| **Among Us** | 6 capital letters (previously 4); Enter Code shows host, capacity, region before joining | Private/public toggle; Streamer Mode hides code | Host edits settings, picks map, toggles privacy, starts (needs 4+ players) | Not covered | Host migration behaviour not verified in this research |

## Findings by Question

### 1. Joining

**Code formats and lengths.** Jackbox uses four random letters per game, not case-sensitive. Among Us switched from 4-letter to 6-letter codes in its September 2020 update (Steam build 2020.9.9, per Gamer Tweak); DBLTAP reported the change was made "to accommodate the influx of just under 1.5 million new concurrent players" (both secondary sources, not InnerSloth). Kahoot uses a numeric PIN (secondary sources say 6–10 digits; Kahoot's own help pages don't state a length). Mentimeter uses 8 digits. Google Meet uses a 10-letter `abc-mnop-xyz` pattern, and Zoom uses 9–11 digits. The takeaway: letters-only codes stay short (4–6) because each character carries more entropy than a digit; digits-only codes need 8+ to reach similar space.

**QR codes.** QR is now standard, and it pre-fills the code rather than replacing it. Jackbox added "Lobby QR code" to The Jackbox Party Starter in a July 2022 update and made it standard in Party Pack 9, which "will automatically pull up Jackbox.tv and have that room code entered for you." Kahoot supports PIN, QR, or link, and notes 2-Step Join still applies after a QR scan. Mentimeter's QR is tied to the presentation and "remains unchanged, even if the 8-digit join code is updated." Netflix uses QR exclusively, but the scan leads into a native app, not a web page.

**Role selection.** No product studied asks the user to pick "player vs display vs audience" explicitly. Instead:
- The display is whichever device ran the game/started the session (Jackbox tells hosts they need a second device, because "You won't be able to enter answers on the same device running the game").
- Players are the first N joiners; the rest become audience (Jackbox).
- Moderators use a separate URL and password (mod.jackbox.tv).
- AirConsole distinguishes screen and controller by URL (`screen.html` vs `controller.html`).

**Names and avatars.** Jackbox takes a free-text name (12 characters in Drawful 2) and shows it with a random avatar; Drawful 2 has players draw their own avatar. Kahoot's Friendly nickname generator gives up to three spins from 800 two-word combinations (as of 2017) to prevent offensive names. Jackbox's profanity filter (Party Pack 7+, Moderate or Strict) and Twitch login requirement address names and content.

**Late joining.** Kahoot allows late joins "as long as joining is still available" (i.e., not locked). Jackbox routes late arrivals to the audience once the game has started.

**Room size.**
- Jackbox: typically 8 players, up to 10 in Party Pack 8, some games up to 16; up to 10,000 audience.
- Kahoot: plan-dependent — 10 on free personal, 3 on free business ("test drive"), up to 5,000 on Event Max using "Classic (Large)" modes. A third-party 2026 analysis notes the free cap was once 50 and "There's no soft overflow."
- AirConsole: developer-defined; marketing claims it "can technically support over 3000 players" (a marketing figure, not a documented limit).

**Taps from scan to play.** The Jackbox wiki describes QR joining as removing the manual steps of typing the URL and code; the remaining steps are name entry and "Play." *Inferred:* a well-built flow is camera scan → tap banner → type name → tap join, i.e., roughly 3 taps plus name typing. Kahoot adds a nickname step and, if enabled, four pattern taps. Netflix's first-time flow requires an app install and a second scan.

### 2. Room codes

**Confusable characters.** The standard practice is to drop characters that look alike: O/0, I/l/1, S/5, Z/2, B/8. Crockford-style alphabets exclude I, L, O, and U "to avoid confusion and abuse." One open-source "friendly code" library goes further and uses only `3 6 7 C D F G H J K M N P R T W X`, removing vowels "to reduce the chance of generating actual words." A recent open-source party-game project (Couchcade) uses A–Z minus I/O for 4-letter codes.

**Speakability (inferred).** For reading aloud across a room, letters-only codes avoid "zero or O?" questions. Dropping letters that rhyme in English (B/D/E/G/P/T/V/Z) reduces errors further but shrinks the alphabet; this is a trade-off, and no product studied documents doing it.

**Offensive words.** Jackbox's 2014 blog post "Room [CENSORED] Codes" admits random 4-letter codes sometimes "form terrible, terrible words" and that it implemented a filter. Couchcade's approach — redraw in a loop until the code isn't on a small blocklist — is simple and testable.

**Collisions.** Not documented by any product studied. *Inferred:* with 26^4 ≈ 457,000 Jackbox-style codes, a server can keep a set of active codes and redraw on collision; the risk is exhaustion under load, which is one reason Among Us moved to 6 letters (about 309 million combinations).

**Guessability and abuse in practice.**
- **Jackbox:** a public Go script "hits the jackbox.tv API with different room codes and prints out open rooms"; its author noted on 2023-01-25 that "jackbox.tv has set up rate limiting."
- **Zoom:** Check Point Research generated random IDs and found a fast way to test validity; Krebs on Security (April 2020) reported that Check Point did this "last summer, and found they were able to predict approximately four percent of randomly generated Meeting IDs." Researcher Tom Anthony (VP Product at SearchPilot) showed that because meetings were "default protected by a 6 digit numeric password, meaning 1 million maximum passwords," an attacker could "attempt all 1 million passwords in a matter of minutes"; he reported it on 1 April 2020, and Zoom told BleepingComputer it "improved rate limiting… and relaunched the web client on April 9th."
- **Kahoot:** bot scripts join dozens of clients per PIN (one public repo defaults to 40). Kahoot's mitigations: 2-Step Join (tap four tiles matching a pattern on the host screen that changes every 7 seconds per the live-settings page, or "every ~10 seconds" per the newer 2-Step Join article — the two Kahoot pages disagree), nickname generator, lock, remove players, and player identifier (email or name verification, with an optional magic link). Kahoot says 2-Step Join blocks "most known bot services" but not all.
- **Jackbox:** streamers reported racist trolls joining once codes were visible. Jackbox responded with manual censoring, Twitch login, passwords, room-code hiding, player limits, a profanity filter, content moderation (Quiplash 3/Party Pack 7), and kicking (Party Pack 9).

### 3. Host control

**Powers.** Jackbox's VIP (first joiner) can start the game and, with Censoring on, skip drawings and censor players; "Censored players remain censored for the rest of the game." Moderators (separate view, password-protected) can reject content before it appears and kick players. Kahoot's host (presenter screen) starts, locks, removes players, toggles the nickname generator and 2-Step Join, and controls pacing. Among Us hosts edit settings, choose the map, switch public/private, and start the game.

**Passing on the role.** Jackbox reassigns VIP when the VIP is kicked: "another player will be given their designation and a slot will open up." AirConsole's master controller moves automatically — its Pong example notes "We lose master controller status if the current master is not hero but a hero joins the session." Neither product offers an explicit "transfer host" button in the sources found.

**When the host leaves.** In Jackbox the display device is the true host; since Party Pack 9, if it loses its server connection, "The game will essentially pause for five minutes and give the host time to reestablish a connection" without losing players or data. Kahoot's host is the presenter; if their session ends, the PIN stops working.

**TV to phone handoff.** Jackbox's default delegates "start" to the first phone (VIP). Its "Start Game from Controller" toggle does the reverse — keeping control on the device running the game "in case they aren't the first player to join." Netflix puts the system menu on the phone: pressing "N" on the controller "will bring up a controller overlay on the big screen, where you can access controllers (and a QR code), check your achievements, or exit the game."

**Phones controlling the display.** In AirConsole, phones send messages to the screen, and the screen assigns player numbers with `setActivePlayers`. Mentimeter inverts this: the presenter drives what phones show (Presentation mode) or lets them self-pace (Survey mode).

### 4. Audiences and spectators

- **Jackbox** uses the *same* room code; anyone who joins after the player slots fill (or after the game starts) becomes audience, and "can impact how scoring is determined and influence the winner." Hosts can turn Audience off, disable audience submissions, and moderators use a separate URL and password.
- **Mentimeter and Kahoot** treat everyone who joins as a participant; the shared screen is the only "view."
- **Google Meet** has a Companion mode and viewer roles distinct from full participants.
- *Inferred recommendation:* grant audience status by role on the server, not by a separate code. A single code keeps things simple, while a role flag lets you rate-limit, aggregate audience votes, and hide audience names from the display.

### 5. Disconnects

**Temporary drop vs leaving.** Jackbox relies on a cookie so that reopening jackbox.tv in the same browser reclaims the seat ("cookies will allow you to rejoin the game if you get disconnected"), and warns not to clear cookies mid-game "or you won't be able to rejoin." Kahoot offers a "Tap to rejoin game" → "Resume as [nickname]" flow that keeps the score. But Kahoot team mode on personal devices says "It's not possible to rejoin with the same nickname and accumulated points after leaving the game (e.g. closing the app or the tab; losing connectivity)." No product studied publishes a specific player grace period; Jackbox's only published number is the 5-minute host pause.

**Grace periods, pausing, skipping, bots.** Jackbox pauses for the host; for players, timers simply run out. In a Steam thread, a streamer complained that when a player leaves or idles, "the timer will always count down to 0," and asked for "the VIP to manually end the current timer early" and auto-skipping of idle players. Jackbox's own developer post (2015) explained the timer trade-off: "anymore would have been too long when you are forced to wait for someone who is unresponsive." Party Pack 9 kicking mid-game only works "above the minimum player count," and kicked players "remain in the game visually, but are disconnected and unable to rejoin." AirConsole's Pong resets active players when an active player leaves. In Helldivers 2, network host migration happens mid-mission but the lobby disbands if the host leaves on the ship, and failed migrations drop the squad (player reports).

**What players find fair vs frustrating.**
- Frustrating: waiting on absent players' timers, being unable to remove trolls, losing score on rejoin (Kahoot team mode), and one host's network killing the game (pre-PP9 Jackbox: "everyone disconnected… unable to reconnect").
- Fair (inferred from features added in response): the game continues without the absent player, and a returning player gets their seat and score back.

### 6. Mobile browser behaviour

**What happens to the WebSocket.**
- **iOS Safari:** Apple publishes no timing. A reporter on WebKit bug 247943 (November 2022) observed that "on iPhone when locked screen or minimized Safari… WebSocket onclose is fired immediately." Other reports say the close event sometimes never arrives: on iOS 15 a developer wrote that "after longer inactivity, the onerror and onclose events will not be received any more," and the graphql-ws project documented sockets that appeared open but ignored `.send()` after unlock. Safari 15.6.1–16.x (NSURLSession backend) failed to fire `onclose` on network loss; the reporter confirmed Safari 17.3 fixed it (February 2024). An Apple engineer's advice on WebKit bug 245350: "I would recommend handling disconnects in your JavaScript code, and reconnecting." Ably's guidance is not to rely on `onclose` but to use "failed-send detection and an application-level heartbeat timeout."
- **Android Chrome:** background pages are frozen after 5 minutes (shipped since around M68/M79). Google's Chrome 139 release notes say the change "Shortens the time to freezing background pages (and associated workers) from five minutes to one minute on Android"; Michael Thiessen's blink-dev PSA (11 August 2025) notes that "Android 15 has introduced a 1 minute background network restriction on apps," lists it as Finch feature "stop-in-background" with the rollout plan "Experiment users ramp up over time," and targets "only non-webview, non-desktop Android." From Chrome 88, timers in pages hidden more than 5 minutes are checked only "once per minute" under intensive throttling. Frozen pages run no JavaScript, so heartbeats stop and the server will time you out.
- **Desktop Chrome** also freezes CPU-heavy hidden tabs after five minutes under Energy Saver (Chrome 133+).

**Reliable events.**
- `visibilitychange` (to `hidden`) is the last event you can count on across browsers; use it to send "I'm away" and flush state.
- `pagehide`/`pageshow` handle bfcache; `event.persisted` on `pageshow` tells you the page came back from the cache, and you must reconnect.
- `freeze`/`resume` are Chrome-only (since Chrome 68); `document.wasDiscarded` tells you the tab was discarded and reloaded.
- **bfcache:** Chrome 149 changed behaviour so that "Active WebSocket connections no longer prevent a page from entering the Back/Forward Cache" — the browser closes the socket instead. Safari already behaves similarly. An independent measurement on Chrome 150 builds still found `websocket` as a blocking reason, attributed to a staged Finch rollout; treat the change as rolling out, not universal.

**Keeping the screen awake.** The Screen Wake Lock API is supported in Chrome/Edge 84+, Firefox 126+, and Safari 16.4+ (iOS and macOS); web.dev declared it supported "in all browsers" in May 2024. On iOS, it was broken in home-screen web apps until iOS/iPadOS 18.4 ("Fixed Screen Wake Lock API for Home Screen Web Apps"). The lock is released automatically when the page is hidden, so re-request it on `visibilitychange`. Requests can be refused for low battery or power-save mode — wrap in try/catch. NoSleep.js (hidden looping video) is the fallback for older iOS, but shows a "No Sleep" media control on the lock screen.

**How quickly real apps reconnect.** Socket.IO's defaults are `pingInterval` 25,000 ms and `pingTimeout` 20,000 ms, so a dead connection is detected in up to 45 seconds unless the client reconnects proactively on `visibilitychange`. Jackbox holds the host for 5 minutes. *Inferred:* a phone-controller game should reconnect immediately on foreground (sub-second on a good network) rather than waiting for heartbeats to fail.

### 7. Identity without accounts

**Mechanisms compared.**
- **localStorage:** survives reloads and tab restarts in normal browsing; per-origin; wiped by ITP after 7 days of Safari use without interaction; ephemeral per-tab in Private Browsing.
- **Cookies:** Jackbox's documented mechanism ("cookies will allow you to rejoin"). Server-set HttpOnly cookies are not subject to ITP's script-writable 7-day cap (per Adobe's explanation of ITP), unlike JavaScript-set cookies.
- **URL tokens:** survive storage isolation (the link carries identity) but leak through screenshots, sharing, and browser history. *Inferred:* use short-lived, single-room tokens only.

**iOS eviction.** Since iOS 13.4/Safari 13.1, ITP deletes "all of a website's script-writable storage after seven days of Safari use without user interaction on the site" — IndexedDB, localStorage, media keys, sessionStorage, service worker registrations. "Seven days of browser use" is not seven calendar days. Home-screen web apps are exempt: "The first-party domain of home screen web applications is exempt from ITP's 7-day cap on all script-writeable storage." For a single evening's game session this cap doesn't matter; for persistent profiles, it does.

**Private browsing.** Since Safari 11 (WebKit changeset, April 2017), "LocalStorage in private browsing is now effectively SessionStorage. It's ephemeral, per-tab." WebKit's 2024 "Private Browsing 2.0" post confirms nothing persists after the tab closes. A reload keeps it; closing the tab or opening a new one loses it. Jackbox historically told players to "Disable private browsing if you get a blank white screen."

**QR scanners and in-app browsers.** The iOS Camera app opens QR links in the default browser (shared storage), but the Control Center Code Scanner opens a popup web view; an Apple forum report on iOS 13 said "the webview used in the QR Coder reader does not have session cookies etc from Safari" and "The local storage is discarded between QR code readings." Since iOS 11, SFSafariViewController storage is per-app, not shared with Safari. Instagram and Facebook render links in their own WKWebView; localStorage set there "is not transferred to the Safari tab." *Implication:* a player who scans with the Code Scanner, gets dropped, and rescans lands with no token — your reconnect flow must also allow "reclaim seat by name" with host confirmation.

## Browser Support (as of September 2026)

| Capability | iOS Safari | Android Chrome | Notes / dates |
|---|---|---|---|
| WebSocket in background | Suspended quickly; `onclose` reported immediate on lock (2022 bug report), but unreliable on some versions; Safari 17.3 fixed `onclose` on network loss (Feb 2024) | Page frozen after 5 min; 1 min from Chrome 139 (announced 11 Aug 2025, staged) | Apple publishes no timing; all iOS timings are developer reports |
| Timer throttling when hidden | JS suspended when backgrounded | Chrome 88+: once per minute after 5 min hidden | Heartbeats stop in both |
| `visibilitychange` | Yes | Yes | Most reliable cross-browser signal |
| `pagehide`/`pageshow` + bfcache with open WebSocket | Safari closes socket and caches page | Chrome 149 closes socket on bfcache entry (staged; Chrome 150 measurements still blocked) | Always reconnect on `pageshow` with `persisted` |
| `freeze`/`resume` | No | Yes (Chrome 68+) | Chrome-only |
| Screen Wake Lock | Safari 16.4+; home-screen apps fixed in 18.4 | Chrome 84+ | Firefox 126+; released when hidden |
| ITP 7-day script-storage cap | Yes (since iOS 13.4); home-screen apps exempt | N/A | Counts days of browser use |
| Private Browsing localStorage | Ephemeral, per-tab (since Safari 11) | Incognito: session-only | Don't rely on it |
| QR → in-app view storage | Camera app → default browser; Code Scanner → isolated web view | Varies by scanner app | Social apps use isolated WebViews |

## Recommendations

1. **Codes:** 4 letters for local play, 5–6 if you support public streaming; alphabet of A–Z without I, O (and optionally L, U); redraw on blocklist hit and on collision; case-insensitive input with `autocapitalize="characters"`; keep codes short-lived and per-session.
2. **QR:** encode `https://yourgame/ROOM` so the code is pre-filled; show the typed code under the QR. Tell players to use the Camera app, not Code Scanner (*inferred*, based on the storage-isolation behaviour above).
3. **Abuse:** rate-limit code lookups per IP (Jackbox did so after brute-forcing); add a host "lock room" button, kick, a profanity filter on names, and an optional "tap the pattern on the TV" verification for streamed games.
4. **Roles:** display creates the room; first phone becomes VIP; display can override with a "host from TV" setting; players beyond the cap become audience by server role, not a separate code; VIP passes to the longest-connected player when the VIP leaves or is kicked.
5. **Seats:** issue a per-room reconnect token on join; store it in localStorage and an HttpOnly cookie; hold the seat for a grace period (*inferred:* 60–120 s during a round, longer in the lobby); let the host or VIP skip a missing player's turn or end the timer early — the most requested fix in Jackbox player feedback.
6. **Host drop:** pause the game and keep state server-side, like Jackbox's 5-minute host pause, rather than destroying the room.
7. **Reconnect:** reconnect immediately on `visibilitychange` → visible, `pageshow` with `persisted`, `resume`, and `online`; use an app-level heartbeat (e.g., 10–25 s) and treat a missed pong or failed send as dead; don't wait for `onclose`.
8. **Wake lock:** request it on first tap after joining, re-request on visibility change, and fall back to a "keep your screen on" hint.
9. **Fallback identity:** when no token is present, offer "Are you [name]? Rejoin" backed by host approval, to cover private tabs and in-app browsers.

## Caveats

- Slido's code format, limits, and host controls were not verified in this research; the table row is marked accordingly.
- Kahoot PIN length (6–10 digits) comes from secondary sources, not Kahoot's help center. Kahoot's two help pages disagree on the 2-Step Join refresh interval (7 vs ~10 seconds).
- AirConsole's "seven-digit link code" and "3000 players" come from AirConsole marketing pages, not developer documentation.
- iOS background timings come from bug reports and forums, not Apple; they vary by iOS version and have changed with Safari's WebSocket backend. Chrome's 1-minute freeze and bfcache WebSocket change are staged rollouts, so behaviour differs by user.
- Among Us host migration and Netflix reconnect behaviour were not verified. Several third-party Jackbox and Kahoot explainer pages found during research appear to be SEO content on unrelated domains; claims here rely on Jackbox's own blog and Steam posts, Kahoot's help center, and vendor documentation wherever possible.

## Sources

1. St-aug — https://explore.st-aug.edu/exp/jackbox-tv-join-explained-how-a-simple-code-unlocks-a-world-of-party-games
2. Jackbox Games — https://support.jackboxgames.com/hc/en-us/articles/15794759479959-How-do-I-join-a-game
3. steamcommunity — https://steamcommunity.com/app/442070/discussions/0/358415206096198643
4. Fandom — https://jackboxgames.fandom.com/wiki/The_Jackbox_Party_Starter
5. Kahoot! Help & Resource Center — https://support.kahoot.com/hc/en-us/articles/360039890713-Kahoot-join-How-to-join-a-Kahoot-game
6. Kahoot! Help & Resource Center — https://support.kahoot.com/hc/en-us/articles/35342050693789-How-to-use-the-2-step-Join-option-to-secure-your-game
7. Freedom251 — https://freedom251.com/how-to-add-kahoot-bots/
8. Netflix — https://help.netflix.com/en/node/602905750076006
9. Helpshift — https://games-netflix.helpshift.com/hc/faq/1452-how-can-i-connect-my-ios-phone-or-tablet-to-use-as-a-game-controller/
10. Wikipedia — https://en.wikipedia.org/wiki/The_Jackbox_Party_Pack
11. steamcommunity — https://steamcommunity.com/app/442070/discussions/0/358415206096190417
12. GitHub — https://github.com/AirConsole/games-pong/blob/master/controller.html
13. Hexeum — https://hexeum.net/guides/how-to-stream-jackbox-party-games-on-twitch/
14. Jackbox Games — https://www.jackboxgames.com/blog/the-ability-to-kick-players-and-other-new-features-coming-to-party-pack-9
15. Fandom — https://jackboxgames.fandom.com/wiki/The_Jackbox_Party_Pack_9
16. Jackbox Games — https://www.jackboxgames.com/blog/how-to-play-party-pack-nine-remotely
17. Kahoot! Help & Resource Center — https://support.kahoot.com/hc/en-us/articles/360039422694-How-to-host-a-live-kahoot
18. Kahoot! Help & Resource Center — https://support.kahoot.com/hc/en-us/articles/4408679135891-Team-experience-How-to-play-kahoot-in-groups
19. Steam Community — https://steamcommunity.com/app/774461/discussions/0/1734342161849025137/
20. GitHub — https://github.com/jxkef/kahoot-spammer
21. Krebs on Security — https://krebsonsecurity.com/2020/04/war-dialing-tool-exposes-zooms-password-problems/
22. The Hacker News — https://thehackernews.com/2020/07/zoom-meeting-password-hacking.html
23. Jackbox Games — https://www.jackboxgames.com/blog/room-censored-codes
24. Columbus — https://smart.columbus.gov/columbus-news/jackbox-tv-room-codes-your-guide-to-joining-the-party-1764797795
25. Friendemic — https://social.friendemic.com/soc/jackbox-tv-join-explained-how-a-simple-code-unlocks-a-world-of-party-games
26. The Windows Club — https://www.thewindowsclub.com/how-to-join-a-kahoot-game
27. Mentimeter — https://help.mentimeter.com/en/articles/6385721-how-to-run-a-survey-with-mentimeter-survey-mode
28. Mentimeter — https://help.mentimeter.com/en/articles/422271-share-the-qr-code
29. Google — https://developers.google.com/workspace/meet/api/guides/overview
30. Krisp — https://krisp.ai/blog/meeting-id/
31. Jackbox Games — https://www.jackboxgames.com/blog/how-to-keep-your-stream-safe-while-playing-jackbox-games
32. GitHub — https://github.com/dennisnguyen1992/matchgame
33. Wordpress — https://laurentchervet.wordpress.com/category/coding/airconsole/
34. Kahoot! — https://kahoot.com/blog/2017/11/09/generate-funny-nicknames-players-live-kahoots/
35. Vintage is the New Old — https://www.vintageisthenewold.com/faq/how-do-i-join-jackbox-party-pack
36. Trivia Anywhere — https://www.triviaanywhere.com/blog/kahoot-free-player-limit
37. Kahoot! Help & Resource Center — https://support.kahoot.com/hc/en-us/articles/11166126591891-Guide-for-one-time-events
38. Kahoot! Wiki — https://kahoot.fandom.com/wiki/How_many_ppl_play_on_kahoot
39. AirConsole — https://www.airconsole.com/games/32-player-games
40. Helpshift — https://games-netflix.helpshift.com/hc/en/42-boggle-party/faq/1274-how-can-i-connect-my-android-phone-or-tablet-to-use-as-a-game-controller/
41. Gajus — https://gajus.com/blog/avoiding-visually-ambiguous-characters-in-ids
42. Hacker News — https://news.ycombinator.com/item?id=13116664
43. github — https://github.com/swanson/friendly_code
44. GitHub — https://github.com/dipsaus9/Couchcade/pull/91
45. GitHub — https://github.com/nelsonfigueroa/jackboxtv-room-finder
46. Kahoot! Help & Resource Center — https://support.kahoot.com/hc/en-us/articles/115016055107-Live-game-settings
47. Kahoot! Help & Resource Center — https://support.kahoot.com/hc/en-us/community/posts/360029558133-Kahoot-Hacks-must-stop
48. Siliconera — https://www.siliconera.com/jackbox-party-pack-9-adds-moderation-features-qr-login/
49. Jackbox Games — https://www.jackboxgames.com/blog/combating-hateful-speech-and-harassment-in-jackbox-games
50. steamcommunity — https://steamcommunity.com/app/1005300/discussions/0/1608274347724220571
51. Among Us Wiki — https://among-us.fandom.com/wiki/Lobby
52. Digital Citizen — https://www.digitalcitizen.life/what-is-the-kahoot-game-pin/
53. Helpshift — https://games-netflix.helpshift.com/hc/en/40-underwatermelon-fruit-merge/faq/1382-how-do-i-use-the-netflix-game-controller/
54. Airconsole — https://developers.airconsole.com/pong-example
55. Airconsole — https://developers.airconsole.com/construct
56. Mentimeter — https://help.mentimeter.com/en/articles/6385721-how-to-conduct-a-survey-with-mentimeter
57. Jackbox Games — https://support.jackboxgames.com/hc/en-us/articles/15794785923223-I-m-having-trouble-connecting-my-device-to-the-game
58. steamcommunity — https://steamcommunity.com/app/442070/discussions/0/358415206096205835
59. steamcommunity — https://steamcommunity.com/app/331670/discussions/0/611698195168609949
60. steamcommunity — https://steamcommunity.com/app/553850/discussions/0/4357872738332356100
61. Steam Community — https://steamcommunity.com/app/331670/discussions/0/620700960874729054/
62. webkit — https://bugs.webkit.org/show_bug.cgi?id=247943
63. apple — https://developer.apple.com/forums/thread/696310
64. GitHub — https://github.com/enisdenjo/graphql-ws/discussions/290
65. webkit — https://bugs.webkit.org/show_bug.cgi?id=245350
66. Ably — https://ably.com/blog/websocket-reconnection-timeouts-ai-agents
67. GitHub — https://github.com/RingsNetwork/rings/issues/779
68. Chrome Developers — https://developer.chrome.com/blog/timer-throttling-in-chrome-88
69. Chrome Developers — https://developer.chrome.com/blog/freezing-on-energy-saver
70. Google Groups — https://groups.google.com/a/chromium.org/g/blink-dev/c/Xu1C7WhoGm4
71. Chrome Developers — https://developer.chrome.com/docs/web-platform/page-lifecycle-api
72. Chrome Developers — https://developer.chrome.com/blog/new-in-chrome-149
73. Google Groups — https://groups.google.com/a/chromium.org/g/blink-dev/c/52nlr8z3Png
74. Jangwook — https://jangwook.net/en/blog/en/websocket-bfcache-eligibility-remeasure/
75. web.dev — https://web.dev/blog/screen-wake-lock-supported-in-all-browsers
76. Testmuai — https://www.testmuai.com/learning-hub/wake-lock-api-browser-support/
77. WebKit — https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
78. Progressier — https://progressier.com/pwa-capabilities/screen-wake-lock
79. What PWA Can Do — https://whatpwacando.today/wake-lock/
80. MDN Web Docs — https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
81. Socket.IO — https://socket.io/docs/v4/server-options/
82. GoNintendo — https://gonintendo.com/contents/8398-the-jackbox-party-pack-9-adds-moderation-features-qr-code-sign-in-more
83. Simo Ahava — https://www.simoahava.com/privacy/first-party-cookies-webkit-revisited/
84. adobe — https://experienceleaguecommunities.adobe.com/t5/adobe-experience-platform/fpid-cookie-policy-of-7-days/m-p/600858/highlight/true
85. GitHub — https://github.com/nearprotocol/near-wallet/issues/479
86. WebKit — https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
87. WebKit — https://webkit.org/tracking-prevention/
88. WebKit — https://trac.webkit.org/changeset/215315/webkit
89. webkit — https://webkit.org/blog/15697/private-browsing-2-0/
90. steamcommunity — https://steamcommunity.com/app/351510/discussions/0/594820656473094659
91. Apple Community — https://discussions.apple.com/thread/254857901
92. apple — https://developer.apple.com/forums/thread/122043
93. microsoft — https://learn.microsoft.com/ar-sa/previous-versions/xamarin/ios/platform/introduction-to-ios11/web
94. apple — https://developer.apple.com/forums/thread/765680
95. Felix Krause — https://krausefx.com/blog/ios-privacy-instagram-and-facebook-can-track-anything-you-do-on-any-website-in-their-in-app-browser
