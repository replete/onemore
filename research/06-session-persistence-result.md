# Persisting Session-Based Multiplayer Game Rooms: Patterns, Storage, Deploys, Encoding and Retention

The most robust pattern for keeping many small, short-lived game rooms alive across restarts and deploys is to keep authoritative room state in memory, append every accepted command/event to a durable per-room log (or write a compact snapshot on every meaningful state change), and rebuild on restart from "latest snapshot + log tail" — while treating deploys as *drains* (stop new rooms, let old ones finish or hand off) rather than as restarts that must resurrect every room.

## TL;DR

- Keep rooms in memory, persist an append-only per-room action log plus periodic snapshots, and make the log (not memory) the source of truth; frameworks like Colyseus do not do this for you in production — its state-restore feature (devMode) is explicitly "not optimized for a large amount of rooms" and meant for local development only.
- For a single node handling a few hundred rooms, SQLite in WAL mode (synchronous=FULL for true durability) or Postgres is sufficient; at tens of thousands of rooms, move to a sharded fleet with either a shared durable log (Postgres/Redis AOF) or per-room actors with built-in storage (Durable Objects, Orleans, Akka Persistence), and use drain-based deploys (Agones-style "don't delete Allocated servers") plus jittered client reconnects.
- The decisions that are expensive to change later are: the event/command schema and its versioning, the room-ID and entity-ID scheme, the wire/storage encoding, determinism of the reducer (needed for replay), and where personal data lives relative to the immutable log (keep it out of events so erasure is possible).

## Summary

- **Memory + log + snapshot is the standard shape.** boardgame.io's storage API literally persists `state`, `log`, `metadata` and `initialState` per match and appends a `deltalog` on every `setState`; Akka Persistence recovers actors from the latest snapshot plus the events after it.
- **Lichess batches writes.** Live games are held by in-process round actors; progress is buffered ("dirty progress") and flushed to MongoDB on a delay unless a significant event (e.g., game end) forces an immediate flush — a deliberate trade of a small loss window for lower DB load.
- **Board Game Arena uses the relational DB as the live game state.** Each game table gets its own MySQL schema created at table start from `dbmodel.sql`, so there is effectively no in-memory state to lose between requests.
- **Colyseus rooms are ephemeral by default.** Its docs say to use a database (Postgres, MongoDB, Redis) to save game state; graceful shutdown locks rooms, calls `onBeforeShutdown`, and waits for rooms to dispose.
- **Durability knobs matter more than the engine.** Redis AOF `everysec` can lose ~1 s (Redis Software docs: 1–2 s); Postgres `synchronous_commit=off` risks up to 3× `wal_writer_delay` (default 200 ms, i.e., up to ~600 ms); SQLite WAL with `synchronous=NORMAL` survives app crashes but may roll back recent commits on power loss.
- **Durable Objects give per-room durable storage with low latency.** Writes hit a local SQLite; per Cloudflare's blog, each commit is forwarded to five follower machines, each in a different data center, and confirmed once at least three respond; the output gate withholds responses until writes are confirmed.
- **Deploys should drain, not kill.** Agones never deletes Allocated game servers during fleet rolling updates (default maxSurge/maxUnavailable 25%) and can label left-behind servers so they can shut down gracefully.
- **Reconnect storms are solved client-side with exponential backoff + jitter and server-side with connection rate limiting**, plus sequence-number-based resync so reconnecting clients fetch only missed events.
- **Binary delta encoding wins on bandwidth, not always on CPU.** Colyseus's own benchmark shows its schema encoder at ~1.32M ops/s vs protobuf's ~2.11M ops/s for primitive types; a peer-reviewed benchmark found schema-driven binary formats up to 3.5× smaller than JSON, but pointer-based formats (FlatBuffers, Cap'n Proto) can be *larger* than JSON for small documents.
- **Retention in practice is 1 year for IPs and years-to-indefinite for game records.** BGA keeps connection data (incl. IP) 1 year, other IPs 30 days, chat 3 months, and games affecting other players 10 years before anonymisation; Lichess keeps IP/connection data 1 year and keeps usernames on game records for statistics, anonymising rather than deleting on erasure.

## Findings

### 1. Patterns

**In-memory state + append-only log.** The canonical shape is: each room is a single-writer object (actor, class instance, or Durable Object) holding the authoritative state in memory; every client *command* is validated against current state, and if accepted produces one or more *events* that are (a) appended durably and (b) applied to the in-memory state via a pure reducer. boardgame.io formalises this: its `StorageAPI` exposes `createMatch`, `setState(matchID, state, deltalog?)`, `setMetadata`, `fetch(matchID, {state, log, metadata, initialState})`, `wipe` and `listMatches`, so every adapter stores the current state *and* the accumulated action log *and* the initial state (which allows full replay). Its changelog shows the project deliberately "move[d] log out of game state" and "separate[d] metadata and state in storage API", and its state carries a `_stateID` for optimistic version tracking. The official @boardgame.io/storage-cache decorator (default cacheSize 1000) wraps any async adapter with LRU caches for metadata, state and initialState, which is exactly the "memory in front of durable store" pattern — though its README warns it "is not appropriate for situations where you may have multiple processes or server instances."

**Periodic snapshots + log-tail replay.** Akka Persistence documents the mechanics most precisely: an event-sourced actor can snapshot "every N events" (docs example: `numberOfEvents = 100`, `keepNSnapshots = 2`, so older snapshots below `seqNr − 2×100` are deleted automatically) or when a predicate holds (e.g., on `BookingCompleted`). On recovery it loads the latest snapshot and replays only the events after it. While a snapshot is being written, incoming commands are stashed, so the state can be mutable. There is also a `snapshot-is-optional` setting that falls back to full replay if a snapshot fails to deserialise — but the docs warn not to use it if old events have been deleted. Akka.NET's config shows `snapshot-after = 1000` as an example interval. Akka's documentation also makes the key point for games: long event logs mean long recovery, and "sometimes, the right approach may be to split out into a set of shorter lived actors" — which is exactly what a game room is.

**Event sourcing for games specifically.**
- *Command vs event modelling:* commands are player intents ("play card 17"), events are validated facts ("card 17 moved from hand P2 to trick", "RNG seeded with X"). Randomness must be recorded as an event (or derived from a seed stored in the log) or replay will diverge. BGA's framework, for example, provides dedicated random helpers "recommended for randomness (dice rolls, etc)". *(Seed-in-log recommendation is inferred from general event-sourcing practice.)*
- *Replay for reconstruction:* with a deterministic reducer and stored `initialState`, any match can be rebuilt from the log — which is why boardgame.io persists `initialState` separately.
- *Spectators and replays:* the same log drives spectator views and post-game replays. Lichess exports ongoing games through its APIs with a move delay (hiding the last moves, typically 3) to prevent cheating, and its changelog notes that "ongoing games will now be given for all game exporting APIs with a small move delay". Lichess's WebSocket protocol uses a version parameter (`v`) so a reconnecting client can request only the events it has missed.

**How turn-based platforms store live games.**

| Platform | Live state location | Persistence approach | Restart behaviour |
|---|---|---|---|
| **Lichess** (Scala 3, Pekko, MongoDB, Redis) | In-process round actors (`lila.round`, "manages live game sessions, move handling, clocks, and player connections using actors") | Game document in MongoDB with compact binary encodings (Huffman-coded moves for standard chess, compressed clock history). Progress is buffered as "dirty progress" and flushed on a scheduled delay unless an important event forces an immediate flush. The README says MongoDB stores "more than 12 billion games". WebSockets are handled by a separate server (lila-ws) that talks to lila over Redis. | Lichess announces restarts ("Lichess will restart in 10 minutes"). Games resume after the restart, but forum reports show last-in-flight moves can be lost and clocks can mis-resolve, leading to losses on time. |
| **Board Game Arena** (PHP + MySQL) | The database itself | Each game table gets a MySQL database created at game start from the game's `dbmodel.sql`. "You can't change the database schema during the game"; post-release schema changes require implementing `upgradeTableDb()`. Components like `Deck` store cards as rows (`type`, `type_arg`, `location`, `location_arg`). | Request/response over a DB-backed state machine, so a PHP process restart loses nothing but in-flight requests. |
| **boardgame.io** | Server master in memory | Pluggable `StorageAPI` (built-in in-memory and FlatFile; community Postgres, Firestore and others). MongoDB and Firebase were removed from core into separate packages. Full `state` + `log` + `initialState` per match. | Any node can reload a match from storage. |
| **Colyseus** | Room instance in memory, synced to clients with `@colyseus/schema` | None built-in for production. The FAQ says "Rooms are ephemeral by default. To persist data: Use a database (Postgres, MongoDB, Redis)". `devMode` caches rooms, state and seat reservations across restarts but must not be used in production. GitHub issue #341 confirms "when the backend is deployed (restarted), all room state is lost". | Graceful shutdown (below). Maintainers recommend persisting the relevant state to a DB and reloading it when the room is recreated, noting you "will not be able to easily restart game loops". |
| **Online poker** | *No primary engineering source found in this research.* | *(Inferred)* Real-money poker typically logs every hand action server-side as a hand history for dispute resolution, regulatory audit and anti-collusion analysis, with live table state held in memory on table servers. | *(Inferred)* Operators usually avoid mid-hand migration and instead cancel/refund or complete in-flight hands on failure. Treat this row as unverified. |

### 2. Storage options for this workload

The workload: many small documents/logs (kilobytes), high write frequency per room (one write per action), low read frequency (only on recovery/spectate), short lifetime (minutes to hours), and then either deletion or archival.

| Option | Durability guarantee (per ack) | Write latency per action | Operational cost/complexity |
|---|---|---|---|
| **SQLite, WAL mode** | `synchronous=FULL`: an extra sync of the WAL file happens after each transaction commit, so commits are durable. `synchronous=NORMAL`: "WAL mode does lose durability. A transaction committed in WAL mode with synchronous=NORMAL might roll back following a power loss or system crash", but transactions are durable across *application* crashes. Andrew Ayer warns that "the most popular Go driver for SQLite sets it to NORMAL when in WAL mode, which does not provide durability," and that "on macOS, fsync is nerfed." | NORMAL: no fsync on commit (only at checkpoint), typically microseconds. FULL: one fsync per commit, typically sub-millisecond to low-ms on NVMe. Batching many rooms' events into one transaction cuts N fsyncs to 1. Default auto-checkpoint at ~1000 WAL pages makes an occasional commit slower. | Lowest: a single file, no server. Single writer per database, so serialise writes through one queue. Tied to one node; replication needs add-ons. |
| **Postgres** | `synchronous_commit=on` (default): the ack waits for local WAL flush, with optional sync standby levels (`remote_write`, `on`, `remote_apply`). `off`: the risk window is at most 3× `wal_writer_delay` (default 200 ms), with no corruption risk. It can be set **per transaction**, so you can mix "lossy" move events with "safe" game-end events. | Low-ms with `on` (network RTT + fsync, amortised by group commit via `commit_delay`). Sub-ms with `off`. | Moderate: a server, backups, connection pooling. Shared by the whole fleet, so it gives you queries, retention jobs (`DELETE … WHERE ended_at < …`) and analytics for free. |
| **Redis AOF / RDB** | AOF `always`: fsync before reply, "very very slow, very safe", with group commit. `everysec` (default and recommended): may lose ~1 s (Redis Software docs: "between 1 and 2 seconds"). `no`: the OS flushes (≈30 s on Linux). RDB alone: loses everything since the last snapshot (default save points up to 1 hour). | Sub-ms for `everysec` (in-memory + background fsync). One third-party benchmark measured ~100k ops/s `everysec` vs ~2–5k ops/s `always` *(secondary source; hardware-dependent)*. | Moderate: fork/copy-on-write memory headroom, AOF rewrite tuning, and memory is the capacity limit. Streams/lists map naturally to per-room logs with TTLs for expiry. |
| **LMDB** | Full sync by default (durable on commit). `MDB_NOSYNC` keeps ACI but loses D: "a system crash may undo the final transactions" if the filesystem preserves write order. With `MDB_WRITEMAP` it can corrupt. | Excellent reads (memory-mapped, single-level store). Writes are good but copy-on-write adds overhead; one writer at a time. | Embedded, zero-ops, but node-local. The map size must be configured. |
| **RocksDB** | `WriteOptions.sync=true`: WAL fsynced before return, with group commit (max 1 MB group). Default async WAL: survives a process crash, not an OS crash. `manual_wal_flush` and disabling the WAL trade more durability for speed. | Very fast writes (LSM memtable + sequential WAL). Sync mode costs one fsync per group; `recycle_log_file_num` can avoid metadata I/O. | Embedded but many tuning knobs (compaction, write amplification). Node-local. |
| **Orleans grain persistence** | Whatever the provider gives (Azure Table/Blob/Cosmos, DynamoDB, ADO.NET/SQL, etc.). **State is not persisted automatically**: the grain must call `WriteStateAsync()`, and ETag conflicts raise `InconsistentStateException`. | One provider round-trip per explicit write (typically ms to tens of ms for cloud stores). Full-state overwrite, not append. | Framework handles placement, activation and reactivation on another silo. You still run a cluster plus a storage backend. |
| **Akka / Pekko Persistence** | Event journal plugin (e.g., JDBC/Postgres, Cassandra, R2DBC); an event is persisted before the handler updates state. | One journal append per event (batched by plugins); snapshot writes are async. | Rich (sharding, passivation, snapshots, projections for replays and analytics) but the most complex to run and to version (event serializers). |
| **Cloudflare Durable Objects (SQLite-backed)** | Per Cloudflare's blog, each commit is forwarded to five follower machines, each in a different data center, and confirmed once at least three respond. Per Cloudflare's blog, SRS batches changes to object storage "over a period of up to 10 seconds, or up to 16 MB worth, whichever happens first." The **output gate** holds any outgoing response/WebSocket message until writes are confirmed, so no client ever sees an unconfirmed write. Point-in-time recovery covers 30 days. | The application sees synchronous, in-thread SQLite writes (microseconds). Externally visible latency adds replication confirmation, reported as "typically 2–10 milliseconds" *(secondary source)*. | Lowest ops (managed, one object per room, hibernatable WebSockets). Costs are vendor lock-in, per-request/duration pricing, and a per-object storage cap (Cloudflare's Limits page lists "Storage per Durable Object: 10 GB" for SQLite-backed objects). |

*Assessment (inferred):* For turn-based rooms (≤ a few actions per second), any of these is fast enough; the deciding factors are durability semantics and operational fit. For real-time rooms (10–60 ticks/s), do **not** persist every tick — persist inputs/commands or snapshot every N seconds, and accept a bounded loss window.

### 3. Restarts and deploys

**Draining and handoff.**
- *Colyseus graceful shutdown:* on SIGTERM/SIGINT it calls `gameServer.onBeforeShutdown()`, stops selecting this process for new rooms, locks all rooms, calls each room's `onBeforeShutdown()` (default: disconnect everyone, which runs `onLeave` with `consented=true`, then `onDispose`), and exits only after all rooms are disposed. The docs' example broadcasts "Server is shutting down" and disconnects after 5 minutes. `onDispose` is described as "a great place to persist player's data". Colyseus Cloud added an opt-in mode, announced in its November 2024 product update, to "deploy new versions of your application without disconnecting your players"; it was "not enabled by default as we're still gathering feedback," and customers had to ask for it to be enabled.
- *Agones (Kubernetes):* fleet `RollingUpdate` (defaults `maxSurge: 25%`, `maxUnavailable: 25%`) replaces Ready servers but "Allocated GameServers are not deleted until they are specifically shutdown through the game servers SDK". `allocationOverflow` can label/annotate left-behind Allocated servers so the process can react (e.g., finish the match, then exit). For voluntary disruption, the pod must handle SIGTERM. The default grace period is 30 s. Cluster Autoscaler allows only 10 min of graceful termination, while GKE upgrades allow ~1 h. The `SDKGracefulTermination` feature (stable in 1.33.0) keeps the SDK sidecar alive during `terminationGracePeriodSeconds` until `SDK.Shutdown()`. Blue/green: run a v2 Fleet, point allocation at it, and scale v1 down as its matches end.
- *Lichess:* announces restarts ~5–10 minutes ahead in a banner and relies on persisted game state plus client resync. User reports show the residual cost — moves in flight at the moment of restart and clock accounting can be lost.

*Recommended handoff for short rooms (inferred):* (1) mark the node "draining" in the matchmaker/room registry; (2) create no new rooms there; (3) let rooms finish naturally up to a deadline sized to your P95 room lifetime; (4) at the deadline, flush a final snapshot, publish `room → new node` in the registry, and send clients a "reconnect to X" message with their seat token; (5) the new node lazily loads snapshot + tail on first reconnect. Blue/green is simpler than live migration when rooms are shorter than your deploy window.

**Avoiding reconnection storms.** When a node restarts, every client disconnects at once, and fixed-interval retries synchronise into waves that "can keep a server down longer than the original failure" (websocket.org). Mitigations:
- Client: exponential backoff with **full jitter**, e.g., start ~0.5–1 s, multiply ×2, cap ~30 s. Reset after a stable connection. Distinguish permanent errors (bad token) from transient ones.
- Server: connection admission rate limiting (TLS + upgrade + auth are the expensive part — "connection churn, not connection count"), priority for clients with active seats, and returning "retry-after" hints.
- Planned deploys: send the reconnect instruction with a per-client randomised delay, or stagger node restarts so only 1/N of rooms move at once.
- Protocol: sequence/version numbers (as in Lichess's `v` parameter) so a reconnect costs one "events since v" query, not a full state reload.

**Rebuilding by replay: timings and snapshot frequency.** No engineering post found in this research publishes replay-time measurements for game rooms, so the following is *inferred arithmetic*: a room's replay cost ≈ (events since snapshot) × (per-event apply cost) + snapshot load. A pure reducer applying a turn-based move typically costs microseconds, so even a 500-move game replays in well under 10 ms of CPU. The dominant cost at fleet scale is I/O: loading N rooms × (snapshot + tail). With Akka-style "snapshot every 100 events", worst-case replay per room is 100 events. For real-time rooms at 20 inputs/s, snapshotting every ~5–10 s bounds the tail to 100–200 inputs. Practical rules: snapshot on phase/turn boundaries, at game end, and every N events (N ≈ 100–1000, matching the Akka examples). Delete log segments older than the retained snapshots only after the snapshot write is confirmed. Load rooms lazily on first reconnect rather than eagerly at boot, so recovery time scales with *active* reconnects.

### 4. Compact representation at scale

**Memory per room.** Colyseus's FAQ gives the only first-party figures found: "a typical connection uses ~2-5KB, but this grows with your state size", and "a small cloud server (1 vCPU, 1GB RAM) can typically handle 1,000-2,000 concurrent connections for simple games". A secondary architecture write-up claims Lichess's Rust lila-ws handles 100K+ connections in ~2 GB (≈20 KB/connection) versus ~20 GB in the old Scala implementation *(unverified secondary source)*. *(Inferred)* A turn-based card/board room typically holds 1–50 KB of game state plus per-connection buffers, so 10,000 rooms fit in well under 1 GB; the constraint is usually CPU for encoding/broadcast and file descriptors (Linux default ~1024, raise with `ulimit -n`), not RAM.

**Binary encodings vs JSON.**
- *Size:* a benchmark of JSON-compatible binary formats (arXiv 2201.03051) found schema-driven sequential formats achieve up to a 3.5× size reduction over JSON on a small document, while pointer-based formats (Cap'n Proto 24 B, FlatBuffers 20 B) were *larger* than JSON (14 B) for that input. FlatBuffers' zero-copy advantage matters for large, read-heavy buffers, not tiny patches.
- *CPU:* Colyseus's published benchmark (Apple M1) for primitive types: encode — schema 1.32M ops/s, msgpack 1.34M, JSON 1.55M, protobuf 2.11M; decode — schema 0.81M, msgpack 1.75M, JSON 1.71M, protobuf 4.40M. Colyseus schema's real advantage is *incremental* delta encoding (only changed fields travel), not raw per-message speed.
- *Evolvability:* protobuf has explicit field numbers and well-defined compatibility rules; Colyseus schema limits each structure to 64 fields and requires same-typed collection items; JSON is self-describing and easiest to debug and migrate. *(Inferred)* For **storage** of logs/snapshots, versioned protobuf or msgpack with an explicit schema version per record is the safest long-term choice; for the wire, delta-encoded binary.

**Delta encoding / state diffing.** Colyseus tracks changes per field and broadcasts patches at `patchRate` (default 50 ms), with a simulation interval defaulting to 16.6 ms (60 fps). Calling `setState()` repeatedly is discouraged because "the binary patch algorithm is reset at every call". `StateView`/`@view()` filters per-client fields (hidden hands). For storage, the equivalent is event-log + snapshot: events *are* deltas. Periodic full snapshots bound replay and protect against diff-chain corruption.

**Small integer IDs.** Colyseus schema's own encoding references fields by index (up to 64 per structure) rather than name, and Lichess stores clocks and moves in custom compact binary formats because it stores billions of games. BGA's docs warn that `AUTO_INCREMENT` should be thought of as uniqueness only, not strictly increasing by one. *(Inferred rationale)* Per-room integer entity IDs (card 0–51, seat 0–7, piece 0–31) encode in 1 byte versus 16 bytes for a UUID or tens of bytes for a string. They make diffs and logs dramatically smaller, allow array-indexed state, and are deterministic across replays. Use globally unique IDs (UUID/ULID/Snowflake) only for rooms, accounts and log streams, and map them to small room-local IDs inside the room.

**Hard-to-change-later decisions (inferred from the above).**
1. **Event schema and versioning.** Stored logs must be replayable forever (or for the retention window), so every event needs a type and version and an upcasting strategy. Akka's docs note that snapshot formats can change incompatibly, forcing full-replay recovery.
2. **Reducer determinism** (seeded RNG in the log, no wall-clock reads in apply). Retrofitting it invalidates all existing logs.
3. **ID scheme** (room-local small ints vs global IDs). It is baked into every event and every client.
4. **Storage encoding.** Migrating billions of stored records is expensive, as Lichess's multiple binary formats (older format for variants, Huffman for standard) illustrate.
5. **Room-to-node routing model** (sticky single-writer per room). Actor systems and DOs assume it.
6. **PII placement.** Putting display names or IPs inside immutable events makes erasure hard (see §5).
Cheaper to change: the storage engine behind a clean `StorageAPI`-style interface (boardgame.io proves adapters are swappable), snapshot frequency, patch rates, and backoff constants.

### 5. Retention and privacy

**Real retention periods.**

| Data | Lichess (privacy policy, last updated March 16, 2022) | Board Game Arena (legal page) |
|---|---|---|
| IP / connection data | "kept for one year following their collection, then for the applicable limitation period" | Connection data (time, place, username, IP) 1 year from last connection. "Other IP addresses are kept for a period of 30 days" |
| Account data | Duration of contract, then limitation period ("in principle 5 years") | Until deletion, then archived 5 years from last connection |
| Game records | Username + game metadata kept for statistics: "Time required to keep statistics" (no fixed number) | Games affecting other users "will not be deleted"; kept 10 years from last connection, then anonymised |
| Chat | Contract duration, then limitation period | 3 months from sending; private messages until deleted |

**What personal data game logs contain.** Account IDs/usernames and display names (on every move/event if naively modelled), IP addresses and device/browser data (connection logs; BGA uses IPs to flag two players at one table sharing an IP), chat content, timing data (per-move clocks, which are behavioural), and ratings/results. Under CJEU *Breyer* (C-582/14), a dynamic IP address "constitutes personal data" for a website operator that "has the legal means which enable it to identify the data subject" with the ISP's additional data.

**Deletion and anonymisation in practice.** Lichess states that on erasure "we may choose, instead of deleting the data, to proceed with their complete and irreversible anonymization", keeping it "in a format that no longer allows you to be identified (for example: for statistical purposes)". It cites limits to erasure for "freedom of expression and information; legal obligation; statistical purposes; establishment, exercise or defense of legal claims". BGA anonymises shared-game records after 10 years because deleting them would corrupt other players' histories. For event-sourced systems, two patterns exist: **crypto-shredding** (encrypt PII per user and delete the key — Verraes: "This effectively makes all copies and backups of the sensitive data unusable") and **forgettable payloads** (store PII in a separate mutable store and reference it from events). Whether crypto-shredding satisfies GDPR erasure is disputed; a practitioner update on Verraes's post reports legal advice that "encrypted personal data is still personal data", and no regulator ruling was found. *(Recommendation, inferred:)* use forgettable payloads — events carry only room-local seat numbers and an opaque account ID, and names live in a mutable profile table.

**What GDPR requires.**
- *Data minimisation (Art. 5(1)(c)):* data must be "adequate, relevant and limited to what is necessary". Don't put IPs or display names into game events at all.
- *Storage limitation (Art. 5(1)(e)):* data may be kept "in a form which permits identification of data subjects for no longer than is necessary", with longer storage allowed for statistical purposes under Art. 89(1) safeguards. This is the basis Lichess cites.
- *Right to erasure (Art. 17):* erasure "without undue delay" where, among other grounds, data are "no longer necessary" or consent is withdrawn. Exceptions include freedom of expression, legal obligations, Art. 89 statistics/archiving where erasure would "seriously impair" the purpose, and "establishment, exercise or defence of legal claims". Where data were made public, the controller must take reasonable steps to inform other controllers (relevant because Lichess notes public games are aggregated by "chess game database editing services").
- *Legal basis:* both platforms use legitimate interest (Art. 6(1)(f)) for security/IP logs and contract (6(1)(b)) for account and game data. *Breyer* also accepted a website's legitimate interest in storing IPs for cyber-defence.

## Staged plan

**Stage 0 — Single process, few hundred concurrent rooms.**
- Architecture: one server process; rooms in memory; each accepted action appended to a per-room log in **SQLite WAL** (`synchronous=FULL`, or NORMAL if you accept power-loss rollback) on local NVMe; snapshot on turn/phase boundaries and at game end; writes serialised through one writer queue, batching concurrent rooms into one transaction per few ms. Rooms are loaded lazily on reconnect. Clients use jittered backoff and `since=seq` resync from day one.
- Deploys: announce, stop new rooms, wait for rooms to end or up to N minutes, flush, restart (Lichess-style), accepting brief downtime.
- **Get right now (expensive later):** versioned event schema; deterministic reducer with a logged RNG seed; room-local small-int entity IDs; opaque account IDs in events (no names/IPs); a `StorageAPI`-style interface (`createRoom/append/snapshot/load/wipe/list`) so the engine is swappable; a sequence number per room event.
- **Move on when:** p99 commit latency starts to affect action latency, a single node's CPU/connections approach ~50–60% at peak (Colyseus's baseline of 1,000–2,000 connections per 1 vCPU/1 GB is a sanity check), or you need zero-downtime deploys / more than one node.

**Stage 1 — A few nodes, a few thousand rooms.**
- Architecture: move the durable log to **Postgres** (append-only `room_events(room_id, seq, type, version, payload bytea)` plus `room_snapshots`), with `synchronous_commit=on` for game-end/result events and optionally `off` per transaction for move events (≤ ~600 ms loss window by default). Add a room registry (Postgres or Redis) mapping `room_id → node` for sticky routing. Retention jobs delete or anonymise ended rooms' logs on schedule.
- Deploys: blue/green — new nodes take new rooms, old nodes drain up to your P95 room length, then leftovers are handed off via "final snapshot + reconnect-to-X".
- **Move on when:** Postgres write IOPS or connection count becomes the bottleneck (thousands of events/s sustained), drain windows are too long for your release cadence, or node failures cause noticeable reconnect storms.

**Stage 2 — Fleet, tens of thousands of rooms.**
- Choose one of two paths:
  - (a) **Orchestrated fleet**: Agones fleets with Allocated-protection, `allocationOverflow` labels to drive graceful handoff, and `terminationGracePeriodSeconds` sized to room lifetime (≤10 min if Cluster Autoscaler evicts, ≤1 h for upgrades). Logs go to a sharded Postgres (partition by `room_id` hash and by time for cheap retention drops) or Redis AOF `everysec` streams per room, with Postgres archival at game end.
  - (b) **Actor-per-room with built-in storage**: Cloudflare Durable Objects (per-room SQLite, 3-of-5 replication, output gate, 30-day PITR), Orleans grains (explicit `WriteStateAsync`, ETags), or Akka/Pekko sharding with event-sourced entities and snapshot-every-N.
- Add server-side connection admission control, staggered node rollouts (1/N at a time), and metrics for recovery time (rooms loaded/s, replay length distribution).
- **Signals you outgrew the previous stage:** per-node restart causes >X% of active players to reconnect at once; registry hot-spotting; deploy frequency is limited by drain time; storage cost is dominated by logs of finished games (→ tiered archival).
- **Expensive to change at this stage:** the routing model (single writer per room) and the vendor choice (DO/Orleans/Akka APIs are not interchangeable). Decide the actor-vs-orchestrated-fleet path before Stage 2, not during it.

## Caveats

- No primary engineering source was found for online poker platforms' live-state storage; that table row is inferred and should be verified.
- The Lichess write-buffering detail comes from a third-party code walkthrough (davidreis.me) and DeepWiki summaries of the lila source, not from Lichess engineering posts. The lila-ws memory figure is from an unverified secondary site.
- The Durable Objects "2–10 ms" confirmation figure and the Redis `always` vs `everysec` throughput numbers are from secondary sources and depend on hardware and region.
- No published measurements of game-room replay time were found; replay timing and snapshot-frequency guidance is inferred arithmetic anchored to Akka's documented examples.
- GDPR text was taken from gdpr-info.eu, and *Breyer* from the EUR-Lex official summary. Crypto-shredding's legal sufficiency is unsettled. This report is not legal advice.
- Lichess's privacy policy does not state explicitly what happens to game records on account closure beyond the anonymisation option; don't assume either deletion or retention.

## Sources

1. [boardgame.io storage base adapter (GitHub)](https://github.com/boardgameio/boardgame.io/blob/main/src/server/db/base.ts)
2. [boardgame.io master tests (GitHub)](https://github.com/boardgameio/boardgame.io/blob/main/src/master/master.test.ts)
3. [Akka Persistence — snapshots (2.5 docs)](https://doc.akka.io/docs/akka/2.5/typed/persistence-snapshot.html)
4. [DeepWiki — lichess-org/lila](https://deepwiki.com/lichess-org/lila)
5. [What happens when you make a move on Lichess — davidreis.me](https://www.davidreis.me/2024/what-happens-when-you-make-a-move-in-lichess)
6. [Board Game Arena forum thread](https://forum.boardgamearena.com/viewtopic.php?t=4070)
7. [Colyseus FAQ](https://docs.colyseus.io/faq)
8. [Colyseus — Graceful shutdown](https://docs.colyseus.io/server/graceful-shutdown)
9. [Redis persistence docs](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
10. [Redis Software — database persistence configuration](https://redis.io/docs/latest/operate/rs/databases/configure/database-persistence/)
11. [PostgreSQL — Asynchronous Commit](https://www.postgresql.org/docs/current/wal-async-commit.html)
12. [postgresqlco.nf — wal_writer_delay](https://postgresqlco.nf/doc/en/param/wal_writer_delay/)
13. [SQLite forum — WAL durability discussion](https://sqlite.org/forum/info/9d6f13e346231916)
14. [Agones — Fleet Updates guide](https://agones.dev/site/docs/guides/fleet-updates/)
15. [Agones — Fleet reference](https://agones.dev/site/docs/reference/fleet/)
16. [websocket.org — Reconnection guide](https://websocket.org/guides/reconnection/)
17. [websocket.org — Connection limits guide](https://websocket.org/guides/connection-limits/)
18. [Colyseus schema benchmark (GitHub)](https://github.com/colyseus/schema/tree/master/benchmark)
19. [arXiv 2201.03051 — JSON-compatible binary formats benchmark](https://arxiv.org/pdf/2201.03051)
20. [Board Game Arena — Legal](https://en.boardgamearena.com/legal)
21. [Lichess — Privacy policy](https://lichess.org/privacy)
22. [boardgame.io CHANGELOG (GitHub)](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/CHANGELOG.md)
23. [DeepWiki — boardgameio/storage-cache](https://deepwiki.com/boardgameio/storage-cache)
24. [Akka Persistence docs (snapshot, current)](https://doc.akka.io/libraries/akka/snapshot/persistence.html?language=scala)
25. [Akka.NET — Persistence module config](https://getakka.net/articles/configuration/modules/akka.persistence.html)
26. [Akka Persistence — snapshot (2.7 docs)](https://doc.akka.io/libraries/akka-core/2.7/typed/persistence-snapshot.html)
27. [Board Game Arena — Table doc](http://en.boardgamearena.com/doc/Table)
28. [DeepWiki — lila game persistence and export](https://deepwiki.com/lichess-org/lila/4.4-game-persistence-and-export)
29. [Lichess changelog 2021](https://lichess.org/page/changelog-2021)
30. [lichess-org/lila (GitHub)](https://github.com/lichess-org/lila)
31. [ggprompts — Lichess architecture write-up](https://ggprompts.com/architecture/lichess/index.html)
32. [Lichess forum — lost on time due to restart](https://lichess.org/forum/general-chess-discussion/lost-on-time-due-to-lichess-server-restarting)
33. [Lichess forum — restart caused timeout refund](https://lichess.org/forum/lichess-feedback/lichess-restart-caused-time-out-can-i-get-refunded)
34. [Lichess forum — restart lost on time](https://lichess.org/forum/lichess-feedback/lichess-restart-lost-on-time)
35. [BGA docs — dbmodel.sql](https://en.doc.boardgamearena.com/Game_database_model:_dbmodel.sql)
36. [BGA — Game database model doc](https://en.boardgamearena.com/doc/Game_database_model:_dbmodel.sql)
37. [BGA — Deck doc](http://en.boardgamearena.com/doc/Deck)
38. [Colyseus — devMode](https://docs.colyseus.io/server/devmode)
39. [colyseus/colyseus issue #341 (GitHub)](https://github.com/colyseus/colyseus/issues/341)
40. [Colyseus forum — restore room handlers after restart](https://discuss.colyseus.io/topic/201/restore-room-handlers-after-server-restart)
41. [Avi — SQLite fsync](https://avi.im/blag/2025/sqlite-fsync/)
42. [SQLite — Write-Ahead Logging](https://www.sqlite.org/wal.html)
43. [sqlite-users — WAL durability and synchronous=NORMAL](https://sqlite-users.sqlite.narkive.com/Zy5Lrn6W/wal-durability-and-synchronous-normal)
44. [SQLite in production — shivekkhurana.com](https://shivekkhurana.com/blog/sqlite-in-production/)
45. [PostgreSQL — WAL runtime config](https://www.postgresql.org/docs/current/runtime-config-wal.html)
46. [postgresqlco.nf — synchronous_commit](https://postgresqlco.nf/doc/en/param/synchronous_commit/9.1/)
47. [Postgres Professional mailing list thread](https://postgrespro.com/list/thread-id/2490428)
48. [RunxBuild — Redis persistence](https://www.runxbuild.com/blog/redis-persistence/)
49. [OneUptime — Redis appendfsync AOF durability](https://oneuptime.com/blog/post/2026-03-31-redis-appendfsync-aof-durability/view)
50. [LMDB microbenchmarks](http://www.lmdb.tech/bench/microbench/)
51. [OpenLDAP technical list — LMDB durability](https://www.openldap.org/lists/openldap-technical/201405/msg00035.html)
52. [arXiv 2110.01465](https://arxiv.org/pdf/2110.01465)
53. [RocksDB — WAL Performance wiki](https://github.com/facebook/rocksdb/wiki/WAL-Performance)
54. [arXiv 2506.04678](https://arxiv.org/pdf/2506.04678)
55. [Orleans grain persistence docs (GitHub)](https://github.com/dotnet/orleans-docs/blob/main/src/docs/grains/grain_persistence/index.md)
56. [Microsoft Learn — Orleans grain persistence](https://learn.microsoft.com/en-us/dotnet/orleans/grains/grain-persistence/)
57. [Akka Persistence docs (2.3 Scala)](https://doc.akka.io/docs/akka/2.3/scala/persistence.html)
58. [Cloudflare blog — SQLite in Durable Objects](https://blog.cloudflare.com/sqlite-in-durable-objects/)
59. [Cloudflare docs — accessing Durable Objects storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
60. [Ashley Peacock — Ultimate guide to Cloudflare Durable Objects](https://blog.ashleypeacock.co.uk/p/the-ultimate-guide-to-cloudflares)
61. [ainoya.dev — Durable Objects](https://ainoya.dev/posts/durable-object/)
62. [Architecting on Cloudflare — Chapter 6](https://architectingoncloudflare.com/chapter-06/)
63. [Colyseus 0.15 docs — Room](https://0-15-x.docs.colyseus.io/server/room/)
64. [Colyseus 0.16 docs — Room](https://0-16-x.docs.colyseus.io/room)
65. [agones-dev/agones issue #2794 (GitHub)](https://github.com/agones-dev/agones/issues/2794)
66. [Agones — Controlling disruption](https://agones.dev/site/docs/advanced/controlling-disruption/)
67. [Agones 1.33.0 blog — SDKGracefulTermination](https://0-12-0.agones.dev/site/blog/2023/07/05/1.33.0-sdkgracefultermination-to-stable-and-returning-metadata-on-allocation/)
68. [Lichess forum — losing a game because of restart](https://lichess.org/forum/lichess-feedback/loosing-a-game-because-of-lichess-restart)
69. [Lichess forum — server restart bad game state](https://lichess.org/forum/lichess-feedback/server-restart-results-in-bad-game-state)
70. [ekilie/ekilied issue #23 (GitHub)](https://github.com/ekilie/ekilied/issues/23)
71. [ahyibrahim/hermes-fe issue #162 (GitHub)](https://github.com/ahyibrahim/hermes-fe/issues/162)
72. [Akka Persistence docs (2.5.25)](https://doc.akka.io/docs/akka/2.5.25//persistence.html)
73. [@colyseus/schema (npm)](https://www.npmjs.com/package/@colyseus/schema)
74. [colyseus/schema (GitHub)](https://github.com/colyseus/schema)
75. [Colyseus 0.14 docs — Room](https://0-14-x.docs.colyseus.io/colyseus/server/room/)
76. [akka/akka-core persistence-snapshot.md (GitHub)](https://github.com/akka/akka-core/blob/main/akka-docs/src/main/paradox/typed/persistence-snapshot.md)
77. [DeepWiki — lila game persistence and export (4.5)](https://deepwiki.com/lichess-org/lila/4.5-game-persistence-and-export)
78. [EUR-Lex — Breyer case summary (C-582/14)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62014CJ0582_SUM)
79. [commanded/recipes issue #4 (GitHub)](https://github.com/commanded/recipes/issues/4)
80. [Verraes — Event Sourcing patterns: throw away the key](https://verraes.net/2019/05/eventsourcing-patterns-throw-away-the-key/)
81. [GDPR Art. 5 (gdpr.eu.org)](https://gdpr.eu.org/art/5/)
82. [GDPR Art. 5 (gdpr-info.eu)](https://gdpr-info.eu/art-5-gdpr/)
83. [GDPR Art. 17 — Right to erasure (gdpr-info.eu)](https://gdpr-info.eu/art-17-gdpr/)
84. [Technethics — ECJ dynamic IP addresses as personal data](https://www.technethics.com/ecj-holds-dynamic-ip-addresses-are-personal-data-if-additional-information-allowing-user-identification-can-reasonably-be-obtained-from-third-parties/)
