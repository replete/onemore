# Research

Background research for our decisions (D-016). Each topic is a numbered pair of files:

- `NN-<slug>-prompt.md`: a prompt for an external deep-research tool.
- `NN-<slug>-result.md`: the report the tool returns, saved as-is.

The prompts are broad and stand alone. They say as little as possible about One More, so the research spends its effort on the topic rather than on our design. Anything we can work out ourselves, such as the rules of 21, doesn't get a prompt. Numbers follow the order in which topics were opened. Some topics, such as evaluating a specific library, are quicker for Claude to check directly against source, docs and tests. Those still get a numbered prompt and result, and the result says how it was produced.

## Workflow

1. Paste the prompt into the deep-research tool as it is.
2. Save the report, unedited, as the matching `-result.md` file.
3. Review it, record what it changes in [decisions.md](../decisions.md), [architecture.md](../architecture.md) or [tasks.md](../tasks.md), and link back to the result.

## Index

| # | Topic | Informs | Status |
|---|---|---|---|
| 01 | [How games are modelled in software](01-game-modelling-prompt.md) ([result](01-game-modelling-result.md)) | Engine contract (architecture §3), D-004, D-005, D-007, D-012 | Done (2026-09-26) |
| 02 | [Card game families and building blocks](02-card-game-families-prompt.md) ([result](02-card-game-families-result.md)) | Classic card game library, which games to build, 21 variants | Done (2026-09-26) |
| 03 | [Joining, host control and reconnection](03-join-and-reconnect-prompt.md) ([result](03-join-and-reconnect-result.md)) | D-009, D-010, D-011, D-020, D-026, D-027 | Done (2026-09-26) |
| 04 | [Randomness, shuffling and fairness](04-shuffling-and-fairness-prompt.md) | D-007, D-024 | Prompt written |
| 05 | [Synced timers, reaction races and response windows](05-timers-and-interrupts-prompt.md) | D-013, D-022, D-023 | Prompt written |
| 06 | [Persistence for session-based game servers](06-session-persistence-prompt.md) | D-014 | Prompt written |
| 07 | [Evaluate boardgame.io](07-boardgame-io-prompt.md) ([result](07-boardgame-io-result.md)) | D-019 | Done by Claude (2026-09-26) |
| 08 | [Evaluate Colyseus](08-colyseus-prompt.md) ([result](08-colyseus-result.md)) | D-025 | Done by Claude (2026-09-26) |

When a result arrives, change its status to "Done" and add the date.
