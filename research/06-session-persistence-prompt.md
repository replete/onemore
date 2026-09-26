# Persistence for session-based multiplayer game servers

Research how real-time, session-based multiplayer game servers persist game state so that rooms survive restarts and deploys, and how that changes as the number of concurrent rooms grows. These servers typically hold many small, short-lived game rooms in memory.

## Questions

1. **Patterns.**
   - How is in-memory state combined with an append-only log of events or actions?
   - How are periodic snapshots used?
   - How does event sourcing apply to games?
   - How do turn-based online games store live games? Consider Board Game Arena, Lichess, online poker, boardgame.io's storage adapters and Colyseus.
2. **Storage options for this workload.** Compare:
   - SQLite in WAL mode;
   - Postgres;
   - Redis, with AOF or RDB persistence;
   - embedded key-value stores such as LMDB and RocksDB;
   - actor systems with built-in persistence, such as Orleans, Akka Persistence and Cloudflare Durable Objects.

   Compare them on durability, write latency per action and operational cost.
3. **Restarts and deploys.**
   - How are servers drained, and how are live sessions handed to a new process?
   - How can reconnection storms be avoided?
   - How is state rebuilt by replaying logs, how long do replays take, and how often should snapshots be taken?
4. **Compact representation at scale.**
   - How much memory does each room use?
   - Binary or JSON encodings?
   - Delta encoding?
   - Small integer ids for game components?

   Which of these choices are hard to change later?
5. **Retention and privacy.** How long are game logs kept, and what personal data do they contain, such as display names? How is that data deleted, and what does GDPR require?

## Output

- **Summary:** up to 10 bullets.
- **Findings:** one section per question.
- **Staged plan:** from a single server with a few hundred rooms up to many servers with tens of thousands of rooms. Give the signal to move to each stage, and the decisions that are expensive to change later.
- **Sources:** cite them inline with links, and mark anything inferred.
