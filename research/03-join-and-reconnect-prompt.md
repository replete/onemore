# Joining, host control and reconnection in phone-as-controller games

Research how multiplayer games and apps that pair a shared screen (TV, laptop or tablet) with players' phones handle joining, roles, host control and dropped connections. Also research how mobile browsers behave when a page with a live connection goes into the background.

## Scope

- **Products:**
  - Jackbox Games (jackbox.tv);
  - AirConsole;
  - Kahoot!, and audience apps such as Mentimeter and Slido;
  - console party games with phone companion apps, and Netflix's phone-controller games;
  - join codes in Google Meet and Zoom;
  - room-code games such as Among Us;
  - browser-based party games.
- **Mobile web platform behaviour** on iOS Safari and Android Chrome.

## Questions

1. **Joining.** How does each product handle:
   - code formats and lengths;
   - use of QR codes;
   - how a device picks its role: player, display, or audience/spectator;
   - names and avatars;
   - joining late;
   - how many can join a room;
   - how many taps it takes to get from scanning to playing?
2. **Room codes.** What makes codes easy to read aloud and type on a phone? Cover:
   - alphabets that avoid characters that are easily confused;
   - filtering offensive words;
   - handling collisions;
   - how guessable codes are;
   - abuse seen in practice (Zoom-bombing, bots flooding Kahoot games) and the mitigations used.
3. **Host control.**
   - What powers do hosts have (Jackbox's VIP, the Kahoot host)?
   - How is the host role passed on, and what happens when the host leaves?
   - How does a display device that's bad at input, such as a TV, hand control to a phone?
   - How do phones control what the shared screen shows?
4. **Audiences and spectators.** How is view-only access granted (a separate code, a link, or a role) and how is it limited?
5. **Disconnects.**
   - How do games tell a temporary drop from someone leaving?
   - How do they use grace periods, pausing, skipping turns, bots or AI takeover, and host migration?
   - What do players find fair, and what do they find frustrating? Look for player feedback and designers' commentary.
6. **Mobile browser behaviour.**
   - What happens to WebSocket connections when iOS Safari or Android Chrome goes into the background, the screen locks, or the user switches apps? How quickly does it happen?
   - Which events can be relied on: Page Visibility, `pagehide`, freeze/resume, the back/forward cache?
   - Can the screen be kept awake, and which browsers support the Screen Wake Lock API?
   - How quickly do real apps reconnect?
7. **Identity without accounts.** How do anonymous sessions survive a reload? Compare localStorage, cookies and tokens in the URL. Cover:
   - iOS storage eviction, including Intelligent Tracking Prevention's 7-day cap;
   - private browsing;
   - QR scanners that open links in an in-app browser with separate storage.

## Output

- **Summary:** up to 10 bullets, including recommended practices.
- **Comparison table:** the products studied, against questions 1–5.
- **Findings:** one section per question.
- **Browser support:** current details for questions 6–7, with dates, since these change often.
- **Sources:** cite them inline with links, and mark anything inferred.
