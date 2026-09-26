# Randomness, Shuffling and Fairness in Digital Card Games

> Result for [04 — Randomness, shuffling and fairness](04-shuffling-and-fairness-prompt.md). Produced by an external deep-research tool on 2026-09-26; content is unedited except for fixing a few HTML-escaped characters (`=>`, `<`, `>`) that the tool emitted as entities inside code samples.

Every documented shuffle failure found here traces back to one of three problems: a biased shuffle algorithm, a seed that could be guessed, or random streams that were wired together carelessly. A 128-bit PRNG is not too small to shuffle a 52-card deck. So a casual card server should run a textbook Fisher–Yates with unbiased integer draws, seed it from the operating system's CSPRNG, and derive a separate seed for each stream and each hand with a keyed hash.

## TL;DR

- **What went wrong in real cases:** ASF/PlanetPoker (1999), Microsoft's browser ballot (2010), V8's MWC1616 `Math.random` (2015), Aristocrat/Novomatic slot machines (2017), a casino shelf shuffler, and the Slay the Spire games all broke through a biased shuffle, a guessable or low-entropy seed, a weak generator, or streams that were correlated with each other. The PRNG's period was never the cause.
- **What to build:** a correct Fisher–Yates using Lemire-style unbiased bounded integers. Seed each game with 256 bits from the OS CSPRNG. Derive a seed for each named stream and each hand with HMAC-SHA256. Use a counter-based ChaCha generator (or sfc32 for non-sensitive, high-volume streams) so every deal can be replayed exactly.
- **Fairness and perception:** regulated labs (GLI-19, iTech Labs, eCOGRA) check source code for bias, run statistical tests on the final shuffled output, and require cryptographic strength and unguessable seeds. A casual game should copy the first two and can adopt the third cheaply. Streak complaints are better answered with a commit-reveal "provably fair" log than by quietly biasing the shuffle.

## Summary

- **The canonical failure.** In the Arkin et al. (Reliable Software Technologies, 1999) break of ASF's PlanetPoker shuffle, an off-by-one error combined with a "swap with any position" loop gave non-uniform decks. On top of that, a 32-bit Borland LCG was seeded from milliseconds since midnight, so only 86,400,000 decks were possible. Syncing to the server's clock cut this to about 200,000, and five visible cards identified the whole deck in real time.
- **Sorting with a random comparator is not a shuffle.** Microsoft's 2010 EU browser ballot used `sort(() => 0.5 - Math.random())`. Rob Weir of IBM ran Microsoft's ballot code 10,000 times in Internet Explorer, and Computerworld reported that "50% of the time IE appeared in the fifth spot at the far right."
- **Fisher–Yates is simple but easy to get subtly wrong.** Swap position *i* only with a position from *i* to *n*. Draw each index without modulo or float bias: rejection sampling, or Lemire's nearly-divisionless method (arXiv 1805.10941).
- **52! ≈ 2^225.6.** A generator with *k* bits of seed can produce at most 2^k distinct decks from a fresh seed. That matters when *k* is small (32 bits) or the seed can be guessed. It does not matter statistically for 128-bit or larger secret seeds.
- **JavaScript favours 32-bit generators.** sfc32 is among the fastest good-quality JS PRNGs and has 128 bits of state. Mersenne Twister has 2.5 KB of state and fails linear-complexity tests. xorshift128+ fails BigCrush when its bits are reversed. PCG and xoshiro256 need 64-bit arithmetic, which is awkward in JS. ChaCha is fast enough on a server.
- **Regulators require a lot.** GLI-19 v3.0 requires source-code review of shuffling and scaling, statistical testing of the final output at 99% confidence, a "cryptographically strong" RNG, no seeding from time alone, and all outcomes generated on the server.
- **Determinism breaks in predictable ways.** The usual causes are a different number of RNG calls, shared streams, floating-point differences across platforms, unordered iteration, unstable sorts, and stray `Math.random`. Age of Empires and Gaffer On Games describe these first-hand.
- **Slay the Spire shows why streams must be independent.** The first game seeded several RNGs with the same value. Slay the Spire 2 seeds about 12 streams with `runSeed + hash(name)` into `System.Random`. Both produce correlations players can exploit.
- **Many games deliberately bias randomness.** Examples are Dota 2's pseudo-random distribution, the Tetris 7-bag and TGM history randomisers, MTG Arena's best-of-one hand smoothing, and Spotify's artist-spreading shuffle.
- **Commit-reveal schemes let players verify outcomes afterwards.** A typical scheme is a SHA-256 commitment to a server seed, followed by HMAC-SHA256(server seed, client seed:nonce:cursor).

## Findings

### 1. Failures: broken shuffles and predictable randomness

**ASF Software / PlanetPoker (1999).** "How We Learned to Cheat at Online Poker" by Brad Arkin, Frank Hill, Scott Marks, Matt Schmid, Thomas John Walls and Gary McGraw analysed the Pascal shuffle that ASF had published to show its games were fair. It had three layered flaws:

1. **Off-by-one.** `random_number := random(51)+1` returns 1–51, so the loop never swapped a card with position 52. As a result, "this shuffling algorithm never allows the 52nd card to end up in the 52nd place."
2. **Biased distribution.** Swapping each position with *any* position gives n^n equally likely paths (27 for three cards). Since 27 is not a multiple of 3! = 6, some orderings must come up more often. The authors show that decks 231, 213 and 132 appear more often than 312, 321 and 123.
3. **Predictable seed.** The Borland LCG had only a 32-bit state, and `Randomize()` seeded it from milliseconds since midnight. That gives "a mere 86,400,000" possible decks. Synchronising with the server clock cut the search to "on the order of 200,000 possibilities". The two hole cards plus the flop were then enough to pin down the whole deck in real time, and once the seed was found once, "all future games in under one second."

The authors' lessons still apply. It is "not really required" to be able to produce every one of the 52! decks, but the seed space must be too large to search exhaustively and must be unpredictable. They measured a Pentium 400 checking about 2 million seeds per minute, enough to cover a 32-bit space "in a little over a day." They recommended at least a 64-bit seed from a hardware source. Publishing the algorithm was the right call; it simply exposed that the algorithm was bad.

**Microsoft browser ballot (2010).** The EU browser-choice screen shuffled with `array.sort(function (a, b) { return 0.5 - Math.random() })`. Rob Weir's analysis showed the resulting orders were biased. A comparator that returns random answers is also inconsistent, and the results then depend on which sort algorithm the engine uses. Weir ran Microsoft's ballot code 10,000 times in Internet Explorer, and Computerworld reported that "50% of the time IE appeared in the fifth spot at the far right". Microsoft's Kevin Kutz later told The Register: "We can confirm that we made a change to the random icon order algorithm."

**V8 `Math.random` (2015).** V8's engineers wrote that the old MWC1616 generator could produce only 2^32 distinct values, had many short cycles ("less than 40 million" with a bad initial state), and "fails many statistical tests in the TestU01 suite." V8, SpiderMonkey and Safari moved to xorshift128+. Haramoto and Matsumoto later showed that xorshift128+ output points "concentrate on planes" in 3D plots. A 2025 Chromium issue (456384547) reports that a later V8 change accidentally removed the "+" step. That report is unconfirmed here, but it reinforces the point: never rely on `Math.random` for game logic.

**Aristocrat and Novomatic slot machines (2011–2017).** Wired reported that a St Petersburg group led by "Alex" reverse-engineered the PRNGs in these slot machines, and that of the targeted Aristocrat Mark VI, "more than 100,000 are still on casino floors worldwide". Field agents filmed about two dozen spins with a phone, and the team then predicted favourable spin timings. In March 2015 the US Attorney's Office for the Eastern District of Missouri indicted four Russian nationals for a conspiracy "to cheat at least 10 casinos in Missouri, California and Illinois" on the "Aristocrat Mark VI Electronic Gaming Device"; a secondary source reports that three pleaded guilty and received two-year sentences, with the fourth awaiting sentencing. According to Wired's reporting, the targeted Aristocrat PRNG was partly based on a decades-old public-domain algorithm. The lesson: a generator whose state can be reconstructed from observed outputs is only as secret as the hardware, and the hardware can be bought.

**Casino shelf-shuffling machine.** In "Analysis of casino shelf shuffling machines" (Annals of Applied Probability 23, 2013), Diaconis, Fulman and Holmes studied a 10-shelf mechanical shuffler. They showed that a knowledgeable player could guess about 9½ cards correctly in one pass through the deck; for a well-shuffled deck, as Discover Magazine put it, "on average, you will guess about 4.5 cards correctly out of 52," and Holmes "found a way to double the success rate." The manufacturer changed the design. Physical randomisers need the same scrutiny as software ones.

**Slay the Spire 1 and 2 (correlated streams).** ForgottenArbiter showed that Slay the Spire 1 initialised `monsterRng`, `eventRng`, `cardRng`, `potionRng` and others "to the same state." Outcomes in one stream therefore reveal others. For example, if your first card reward is uncommon, you also get a potion drop.

Community analyses of Slay the Spire 2 (Andy Tockman's blog and the `sts2-rng-fix` mod) report about 12 streams seeded as `new System.Random(runSeed + hash(streamName))`. Because `System.Random`'s first output is almost linear in its seed, these streams are correlated too. The reported effect is that the Neow's Bones curse distribution depends on the starting map, for example "~54% Debt on one start, ~73% Writhe on another". These are community findings, not developer statements.

**Lessons.**
- Use a proven shuffle algorithm.
- Never seed from time alone.
- Keep seeds large and secret.
- Don't let observers see raw generator output.
- Derive stream seeds through a strong mixing function, not by addition or by reusing one seed.
- Test the *final* shuffled output statistically, not just the raw generator.

### 2. Shuffling algorithms

**Correct Fisher–Yates (Durstenfeld form).** Go from the last position down to position 1. At each step, swap `a[i]` with `a[j]`, where `j` is a uniform integer in `[0, i]` including both ends:

```js
function shuffle(a, randBelow) {        // randBelow(n) -> uniform int in [0, n)
  for (let i = a.length - 1; i > 0; i--) {
    const j = randBelow(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

This yields exactly n! equally likely paths, one per ordering. The Arkin et al. "good" pseudocode does the same thing going upwards: `X = RANDOM NUMBER BETWEEN CT AND 52 INCLUSIVE`.

**Common bugs:**
- **Wrong range.** Drawing `j` from `[0, n)` every time (the "naïve swap") gives n^n paths and a biased result.
- **Off-by-one.** Drawing from `[0, i)` instead of `[0, i]` turns the shuffle into Sattolo's algorithm, which only produces single cycles, so no card ever stays in its original place. ASF's `random(51)+1` is a close relative of this bug.
- **Random-comparator sort.** Inconsistent comparators are undefined behaviour and biased (see the browser ballot). If you must shuffle by sorting, attach a random 64-bit key to each item, sort by the key once, and break ties deterministically.
- **Modulo or float scaling.** `rand32() % n` and `Math.floor(Math.random() * n)` are slightly biased whenever n doesn't divide the generator's range.
- **Reseeding per shuffle from low-entropy input.** ASF's time seed is the classic example.

**Unbiased integers in a range.**
- *Rejection sampling (classic).* Take the largest multiple of n that fits in 2^32, reject draws above it, and return `x % n`. This is unbiased but costs a division.
- *Lemire's nearly-divisionless method* ("Fast Random Integer Generation in an Interval", ACM TOMACS 29(1), 2019; arXiv 1805.10941). Multiply the 32-bit random word by n to get a 64-bit product. The high 32 bits are the candidate result. Reject only if the low 32 bits fall below `2^32 mod n`, and compute that threshold only when the low bits are below n. Divisions are therefore rare, and the paper shows it "can multiply the speed of unbiased random shuffling on x64 processors."
- A later paper citing Lemire says the method has been adopted by GNU libstdc++, Microsoft's C++ standard library, the Linux kernel, and the Go, Swift, Julia, C# and Zig standard libraries. That list is secondary.
- In JavaScript, do the 32×32→64 multiply with two `Math.imul` halves or with `BigInt`. Or just use rejection sampling: for a 52-card deck, speed doesn't matter. GLI-19 explicitly allows this kind of rejection: "The discard of RNG values is permissible in this context and may be necessary to eliminate bias."

**Simulating physical shuffles.**
- The Gilbert–Shannon–Reeds (GSR) model describes a riffle shuffle. Cut the deck at a Binomial(n, ½) point, then drop cards from the two halves with probability proportional to how many are left in each.
- Bayer and Diaconis ("Trailing the Dovetail Shuffle to Its Lair", 1992) showed that mixing takes about (3/2)·log₂n riffles. For 52 cards that gives the famous "seven shuffles". Sellke, Shi and Wang (arXiv 2510.22783, 2025) extended the result to general cut-size distributions.
- A digital game can simulate k GSR riffles to reproduce the clumping of a real, under-shuffled deck, for example "bring the ordered deck from the previous hand and riffle 3 times" for a house-rules or nostalgia mode.
- I found no documented commercial game that does this on purpose. That claim is inferred from the lack of evidence.
- GLI-19 §4.6.2 matters here. For money games, a simulation of a physical object must behave like the real object "unless otherwise denoted by the game artwork", so a deliberately imperfect riffle would need to be disclosed.

### 3. Seed space: 52! versus PRNG state

A 52-card deck has 52! ≈ 8.07×10^67 ≈ 2^225.6 orderings. A deterministic generator started from one of 2^k seeds can produce at most 2^k distinct decks. Some consequences:

- **32-bit seeds (ASF, `System.Random`-style, mulberry32 and splitmix32).** At most about 4.3 billion decks, which can be searched on commodity hardware. This is fatal if an adversary can test candidate seeds against visible cards.
- **64-bit seeds.** Arkin et al. judged these "resistant to almost any brute force attack" in 1999. Today that is marginal against a well-funded attacker (inferred).
- **128-bit state (sfc32, xoshiro128, xorshift128+).** Brute-force search is impossible. Only about 2^128/2^225.6 ≈ 2^-97.6 of all orderings can be reached from a fresh seed. No statistical test or player could ever detect that.
- **Mersenne Twister (19,937-bit state).** In principle it can reach every ordering, but only if it is seeded with at least about 226 bits of entropy. According to former Arena Game Director Chris Clay, MTG Arena uses "Fisher-Yates, pulling numbers from a Merseene Twister (MT199937), which is seeded with 256 cryptographically secure randomized bits," and the same approach for coin tosses. A 32-bit `seed(time)` throws away the large state entirely (inferred).

**Does it matter when seeds are secret?**
- For *fairness*, no. Arkin et al. themselves say an algorithm "capable of producing each of the 52! shuffles is not really required," because only a vanishing fraction of decks will ever be dealt.
- For *security*, what matters is whether an observer can **recover the state from outputs**. Linear generators (xorshift/xoshiro, MT) are mathematically invertible from enough consecutive outputs. Card positions leak about log₂(remaining cards) bits per draw, so a long-lived, shared, non-cryptographic stream is the real risk, not the size of its period (inferred).
- Regulators take the strict view. GLI-19 §3.2.5 requires the RNG period to be "sufficiently large to ensure that all outcomes shall be available on every draw".
- Practical rule: use a fresh, unguessable seed for each deal (so recovering one deal's state gives nothing away about others), 128 bits or more of state, and a CSPRNG wherever state recovery would actually pay off.

### 4. Choosing a PRNG

| Generator | State | Statistical quality | JS speed and practicality | Serialisation | Cryptographic? |
|---|---|---|---|---|---|
| Mersenne Twister (MT19937) | 19,937 bits (624×32-bit words, about 2.5 KB) | Fails 2 LinearComp tests in BigCrush. An ML-framework study measured about 2.37 BigCrush failures per stream versus about 0.33 for PCG32 | 32-bit ops so works in JS, but heavy (inferred) | 624 words + index | No; state recoverable from outputs (inferred) |
| xorshift128+ (V8 `Math.random`) | 128 bits | Passes BigCrush forward, fails when bits reversed; points on planes (Haramoto–Matsumoto) | Needs 64-bit ops; engines expose it only as an unseedable `Math.random` | Not accessible from JS | No |
| xoshiro128** | 128 bits (4×uint32) | Weak low bits; fails linear-complexity and binary-rank tests (bryc) | About 6.93 M ops/s in bryc's benchmark | 4 numbers | No |
| xoshiro256** / xoroshiro128+ | 256 / 128 bits | xoroshiro fails BigCrush per Lemire; xoshiro256** is well regarded | Needs 64-bit arithmetic, so `BigInt` in JS (slow) | 4 / 2 64-bit values | No |
| PCG32 | 64-bit state + 64-bit increment | Passes BigCrush; PCG-RXS-M-XS passes with only 36 bits of state, the theoretical minimum (O'Neill) | 64-bit multiply is awkward in JS | 2 64-bit values | No (though harder to predict than LCGs) |
| SplitMix64 / splitmix32 | 64 / 32 bits | SplitMix64 passes BigCrush (Lemire); each output appears once per period | splitmix32 about 10.48 M ops/s (bryc); good for **seeding** other generators | 1 number | No |
| sfc32 | 128 bits (96-bit chaotic + 32-bit counter) | Passes PractRand; a Linux kernel RFC called it "smaller, faster and does better on statistical tests than xoshiro128**" | About 7.45 M ops/s; bryc's "best 2^128 state JS PRNG" | 4 uint32 | No |
| mulberry32 | 32 bits | Fast but only 2^32 streams; bryc no longer recommends it | About 10.44 M ops/s | 1 number | No |
| ChaCha20 / ChaCha8 (e.g. `@noble/ciphers`) | 256-bit key + nonce + counter | Cryptographic | rngChacha8 about 479 ns per 64-byte call on Apple M4 (noble-ciphers README); a 52-card shuffle needs about 200 bytes, so about 2 µs (inferred) | Key + counter: tiny and exact | Yes |
| `crypto.getRandomValues` / Node `crypto` | OS-managed | Cryptographic | An informal benchmark found `Math.random` about 10× faster per call | **Not seedable, so no replays** | Yes |

Notes on the table: the bryc numbers come from his `PRNGs.md` benchmark (higher is faster) and are relative, varying by engine. Also, PCG's and O'Neill's quality claims are disputed in places. Lemire and O'Neill disagree about how to read some BigCrush failures, and an arXiv 2025 study (2507.03007) found occasional failures in PCG streams too.

**When is a CSPRNG actually necessary?**
- **Required** when anything of value rides on the outcome: real money, tradeable items, ranked ladders with prizes. GLI-19 §3.3.1 requires "cryptographically strong" generation, meaning an attacker "who may have knowledge of the source code" can't predict future values. It also requires reseeding with external entropy to limit state-compromise attacks.
- **Always** for seeds, commitments and any value a player could profit from predicting.
- **Advisable** for shared server-side streams that many observers sample over a long time.
- **Not needed** for AI tie-breaks, cosmetic effects, procedural content or client-side prediction. A seeded non-cryptographic generator is better there, because it is fast and replayable.
- The noble-ciphers author recommends WebCrypto for security-critical randomness and treats userspace ChaCha generators as a deterministic expansion of a WebCrypto seed. That fits the design recommended below.

### 5. Certification in regulated games

**GLI-19 v3.0 (Gaming Laboratories International, revised 17 July 2020).** The standard deliberately "does not specify any particular design, method, or algorithm." It requires:

- **§3.2.1 Source code review** of "core randomness algorithms, scaling algorithms, shuffling algorithms", checking for bias, implementation errors and undisclosed switches.
- **§3.2.2 Statistical analysis of the "final outcome output"** (after scaling and shuffling), "evaluated, collectively, at a 99% confidence level". Suggested tests: chi-square, overlaps, coupon collector, runs, interplay correlation, serial correlation and duplicates.
- **§3.2.3–3.2.5** Unbiased scaling and shuffling, independence between draws, and a period large enough that all outcomes are available.
- **§3.3.2** Resistance to direct cryptanalytic attacks and known-input attacks ("the RNG shall not be seeded from a time value alone"), plus periodic external entropy to limit state-compromise extension.
- **§2.6.5(g)** The client software "shall not contain any logic utilized to generate the result of any game."
- **§4.4.4** Cards dealt "from a randomly shuffled deck(s)" at the start of each hand, with no reshuffling except as the rules allow.
- **§4.5.2** No adaptive behaviour: no altering outcomes based on past payouts and no substituted "near miss" displays.
- **§3.4.2** Mechanical shufflers must be tested on at least 10,000 game outcomes.

**iTech Labs.** Its current site says RNG testing involves "source code evaluation, compilation to generate the raw RNG output, and testing the raw numbers and scaled/shuffled output." A 2019 method page (Italian site) gives the full process:
- Review source, seeding, background cycling and re-seeding.
- Run "diehard"-type tests on the raw output.
- Run chi-square tests on "a large number" of shuffled decks.
- Source code is mandatory for PRNGs, and card-shuffling code must be submitted.
- Recommended algorithms included Fortuna, SHA-based and AES-CTR/OFB generators, ISAAC and Mersenne Twister.
- Testing usually takes 1–3 weeks.

iTech also describes regular live-output audits, "generally done monthly", which for poker require the dealt cards ("preferably the full shuffled deck"). Many jurisdictions require re-certification every year or every two years.

**eCOGRA.** Its RNG certification covers source code review, "extensive statistical analysis on the output of the RNG over many iterations", checking that seed generation is "adequately unpredictable", resistance to prediction attacks, and possible periodic audits or re-certification. Its site names no specific test suite. A published eCOGRA game certificate (Hellenic Gaming Commission, 2023) verified "the scaling and mapping used to convert raw RNG output to game outcomes." It also relied on a separate GLI Europe report for the RNG itself, and included a schedule of the critical software elements assessed.

**What transfers to a casual, no-money game:**
- A code review of the shuffle and bounded-integer code against a published reference. This is cheap and catches ASF-class bugs.
- An automated statistical test of the *final* dealt output: position-by-card chi-square over millions of shuffles, plus a serial-correlation check between consecutive deals, run in CI.
- Unguessable seeds (never time-based) and generation only on the server.
- An immutable log of seeds and actions for "game recall" and dispute handling.
- An explicit policy of no adaptive or hidden biasing, or open disclosure if you do smooth outcomes.

Formal lab certification, annual re-audits, geolocation, and strict cryptographic-strength requirements for every stream can be dropped unless prizes are involved.

### 6. Determinism: replays, testing and lockstep

**Uses of seeded randomness:**
- **Replays and bug reproduction.** Store the seed(s), the PRNG algorithm and version, and the ordered player inputs, then re-simulate.
- **Regression tests.** Assert on golden outputs for fixed seeds.
- **Deterministic lockstep multiplayer.** Every peer runs the same simulation and exchanges only inputs.

In "1500 Archers on a 28.8" (GDC 2001), Mark Terrano and Paul Bettner describe Age of Empires running an identical simulation on every PC with "synchronized random number generators." They note that "programmers were not used to having to write code that used the same number of calls to random within the simulation." Desyncs were hunted through world checksums and 50 MB message traces. A deer placed slightly differently would snowball into a villager missing with his spear minutes later.

Glenn Fiedler (Gaffer On Games) defines determinism as "exact down to the bit-level," good enough to checksum the whole state every frame. Slay the Spire saves a stream's state by storing its seed plus a call counter and replaying that many calls on load. This works, but it is fragile if call counts ever differ (a known Slay the Spire reroll glitch came from exactly this).

**Independent streams.** Give each concern its own generator: deck shuffle, AI, loot and rewards, cosmetics, map generation. Then extra calls in one area don't shift results in another. Slay the Spire's designers wanted "randomness within a combat" not to influence card rewards, so that runs on the same seed stay comparable.

The Slay the Spire cases also show what goes wrong. Streams must be seeded **independently and strongly**: derive each stream's seed with a hash or HMAC of (master seed, stream name, index), or use SplitMix-style mixing. Do not use the same seed for several streams or `seed + small offset` into a weak generator. For finer isolation, create a substream per hand or per turn (e.g. `deal/hand-17`), so an extra AI call on hand 16 cannot change hand 17's deal. A counter-based generator like ChaCha, or a keyed hash, makes this natural: the "state" is just (key, counter).

**What commonly breaks determinism:**
- **Floating point.** Fiedler notes that differences between compilers, operating systems and instruction sets make cross-platform float determinism "almost impossible to guarantee." Battlezone 2's team found AMD and Intel CPUs gave different results for transcendental functions. Osmos shipped a multiplayer desync caused by floating-point differences between builds.
- **Variable timestep.** Use a fixed simulation step (Fiedler's "Fix Your Timestep!").
- **Different numbers of RNG calls** on different code paths, or UI and audio code drawing from the simulation's generator. Age of Empires warns that local factors such as random ambient sounds inside the simulation cause divergence.
- **Iteration order.** Hash maps and sets, object key order, and filesystem or network arrival order can all differ between runs.
- **Sort stability and comparators.** Unstable sorts, or ties without a deterministic tiebreak, can produce different orders. Always add a unique ID as the final sort key (inferred as good practice).
- **Stray `Math.random`, `Date.now()` or `crypto` calls in game logic.** These are unseedable and can differ by engine. Ban them in simulation code with a lint rule (inferred).
- **Platform library randomness.** `System.Random`, `java.util.Random` and C++ distribution implementations can change between runtimes. Tockman notes that bundling your own PRNG guarantees "seeds are the same on all platforms."
- **Changing the PRNG or the shuffle code.** Old replays stop matching. Version the algorithm alongside every stored seed.

### 7. Perceived fairness

**Streaks and "rigged" complaints.** Real randomness produces clusters that feel wrong to people.
- **Spotify:** In "How to shuffle songs?" on Spotify's tech blog (28 February 2014), Lukáš Poláček wrote that "since the Spotify service launched, we used Fisher-Yates shuffle," and that after complaints Spotify switched to an algorithm that spreads out songs by the same artist, because "they don't like perfect randomness." A 2025 Spotify Engineering post returned to the theme ("Shuffle: Making Random Feel More Human").
- **MTG Arena:** Former game director Chris Clay responded to shuffler complaints by publishing the implementation: Fisher–Yates over MT19937, seeded with 256 CSPRNG bits. He noted the irony that fixing the *perception* would require "systems... around" the shuffler, which is exactly what players accused them of. Players had also run statistical studies of the shuffler (claims range from "rigged" to "fine"). Community trackers report that deviations suggesting an implementation bug disappeared after an April 2019 update. That is secondary and uncorroborated.

**Deliberate bias:**
- **Pseudo-random distribution (Dota 2 and Warcraft III).** The chance of an effect on the Nth attempt since the last success is P(N) = C·N. For a 25% bash, C is about 8.5%. A 35% critical strike becomes guaranteed within about 7 attempts. The long-run average stays at the nominal rate, but streaks and droughts are rare.
- **Tetris "Random Generator" (7-bag).** Each bag is one random permutation of all 7 pieces (5,040 permutations). There can be at most 12 pieces between two I pieces, and runs of S/Z pieces are capped at 4. It originated in *The New Tetris*.
- **Tetris The Grand Master history randomiser.** It rerolls up to a fixed number of times to avoid the last 4 pieces, and never deals S, Z or O first. TGM3 uses a 35-piece pool that feeds back the least-recent piece to prevent droughts.
- **MTG Arena best-of-one hand smoothing.** The game shuffles several candidate decks and keeps the opening hand whose land ratio is closest to the deck's. The library itself is not modified. A developer post quoted on the Steam forums says that "in best of 1 formats, it will shuffle two copies of your deck… Any further mulligans are not affected. The library itself is not modified." That is still a secondary copy, and MTG Arena Zone describes three hands rather than two.
- **Regulated money games forbid most of this** unless disclosed. GLI-19 §4.5.2 bans adapting the likelihood of outcomes based on history.

**Showing fairness: provably fair commit-reveal.** Stake's published implementation works like this:
1. The server generates a secret server seed and shows its SHA-256 hash before play.
2. The player sets or accepts a client seed.
3. Each bet increments a nonce.
4. Outcome bytes come from HMAC_SHA256(server seed, client seed:nonce:cursor), 4 bytes per result, with the cursor incremented when more than 8 values are needed (for example, a blackjack shoe).
5. After the seeds are rotated, the server seed is revealed and anyone can recompute every outcome.

This proves the server committed before the player's input and didn't change outcomes afterwards. It does **not** prove the game's rules or odds are what's advertised, and the verifier still needs the exact bytes-to-outcome mapping. For card games, the natural version is to commit to a per-game seed, derive each deal with HMAC, and publish the seed and deal indices after the game so clients can replay the Fisher–Yates themselves.

## Recommendation for a casual multiplayer card game server (no money)

**1. PRNG: ChaCha20 (or ChaCha12/8) as a counter-based generator for all outcome-affecting streams; optionally sfc32 for high-volume non-sensitive streams.**
- A shuffle needs about 51 bounded draws, roughly 200 bytes, which takes microseconds with ChaCha. So paying for cryptographic strength costs almost nothing on a server.
- The state is just a 256-bit key plus a counter, which is trivial to serialise and exactly reproducible across platforms.
- Prediction is not a concern even if players watch many cards.
- Use an audited implementation such as `@noble/ciphers` rather than writing your own.
- If you prefer a tiny non-crypto generator, sfc32 is the best-supported choice in JS: 128-bit state, four uint32 values to serialise, passes PractRand, and fast in V8. Seed it fresh for every deal so no stream lives long enough to be reconstructed.
- Avoid `Math.random`, since it is unseedable and engine-specific.
- Avoid MT19937: large state, linear, and no advantage in JS.
- Avoid 32-bit-state generators, which allow only 2^32 decks.

**2. Seeding.**
- At game creation, draw a 256-bit master seed from the OS CSPRNG (`crypto.getRandomValues` or Node's `crypto.randomBytes`). Never use time, IDs or counters alone.
- Keep the master seed on the server only, with all generation done server-side, as GLI-19 §2.6.5(g) requires for money games.
- Store it with the game record, plus a `prngVersion` and `shuffleVersion`.
- *Optional provably-fair layer:* publish `SHA-256(masterSeed)` when the game starts, mix in client seeds that players submit *after* seeing the commitment, and reveal the master seed when the game ends.

**3. Shuffle method.**
- Durstenfeld Fisher–Yates as shown above, with `randBelow(n)` implemented by rejection sampling or Lemire's method on 32-bit integer outputs.
- No floats, no `%` without rejection, no sort-based shuffles.
- One fresh, complete shuffle per hand from an ordered canonical deck, so each deal depends only on its own seed.
- In CI, run a regression test with golden decks for fixed seeds, and a statistical test (card-by-position chi-square over about 10^6 or more shuffles, plus a correlation check between consecutive deals).

**4. Random-stream design.**
- Derive stream keys as `HMAC-SHA256(masterSeed, "<purpose>/<scope>/<index>")`. Examples: `deal/hand/17`, `ai/seat-2/hand/17`, `tiebreak/hand/17`, `cosmetic/client`.
- Each key seeds its own ChaCha (or sfc32) instance, created when needed and thrown away afterwards.
- This means extra AI calls, a new animation or a bug fix in one system can never shift another system's results, avoiding the Slay the Spire correlation problems.
- Replays need only (master seed, versions, ordered actions).
- Checksum the game state each turn and include the checksum in the replay log to catch desyncs early, as Age of Empires did.
- Keep all simulation maths in integers.
- Iterate only over ordered collections (arrays, or `Map`s built in deterministic order).
- Sort with a total order that ends in a unique ID.

**5. Perceived fairness.**
- Keep the core shuffle uniform and say so publicly. Publishing the algorithm helps, as long as it is correct.
- If you want to soften bad streaks, apply the smoothing openly and outside the shuffle (e.g. an MTG Arena-style "pick the more typical of two opening hands" option in casual queues). Never adjust outcomes based on a player's history without saying so.
- Give players a "verify this game" button that replays the revealed seed through the open-source shuffle, because that answers "rigged!" complaints better than statistics do.

## Caveats

- Several specific figures come from secondary or community sources rather than primary documents: the browser ballot's "IE in the fifth spot ~50%" (Rob Weir's test as reported by Computerworld), the MTG Arena shuffler details (from a Reddit post by a former director, relayed by fan sites), the Slay the Spire 2 correlation percentages, and the list of libraries that adopted Lemire's method.
- The Chromium report that V8 dropped the "+" from xorshift128+ was not confirmed.
- JavaScript PRNG speeds come from one author's benchmark (bryc) and differ by engine and version. The ChaCha8 timing is for native-optimised JS on Apple M4.
- The claim that no commercial game deliberately simulates riffle shuffles comes from finding no evidence, not from proof.
- iTech Labs' detailed method page dates from 2019. eCOGRA names no test suite publicly, and neither lab publishes sample sizes.
- Points marked "(inferred)" are reasoned conclusions and were not found stated in the sources. They include state recovery for linear generators, the timing of a ChaCha shuffle, and the lint and sort-tiebreak practices.

## Sources

1. Scientific American — https://www.scientificamerican.com/article/how-the-math-of-shuffling-cards-almost-brought-down-an-online-poker-empire/
2. Wikipedia, "Cheating in casinos" — https://en.wikipedia.org/wiki/Cheating_in_casinos
3. gwern (host of Arkin et al. PDF) — https://gwern.net/doc/cs/cryptography/2006-arkin.pdf
4. arXiv, Lemire, "Fast Random Integer Generation in an Interval" — https://arxiv.org/abs/1805.10941
5. GitHub, bryc, `PRNGs.md` — https://github.com/bryc/code/blob/master/jshash/PRNGs.md
6. arXiv 2507.03007 — https://arxiv.org/pdf/2507.03007
7. arXiv 2605.05099 — https://arxiv.org/pdf/2605.05099
8. arXiv 1907.03251 — https://arxiv.org/pdf/1907.03251
9. Gaming Laboratories International, GLI-19 v3.0 — https://gaminglabs.com/wp-content/uploads/2024/06/GLI-19-Interactive-Gaming-Systems-v3.0.pdf
10. Game Developer, "1500 Archers on a 28.8: Network Programming in Age of Empires and Beyond" — https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
11. Gaffer On Games, "Deterministic Lockstep" — https://gafferongames.com/post/deterministic_lockstep/
12. GitHub, `sts2-rng-fix` — https://github.com/ing-gom/sts2-rng-fix
13. ForgottenArbiter, "Correlated Randomness" — https://forgottenarbiter.github.io/Correlated-Randomness/
14. MTG Arena Zone, "Inner Workings of Arena" — https://mtgazone.com/inner-workings-of-arena/
15. "Dota 2 Pseudo-RNG Definition" — https://dota2allforfun.home.blog/2019/12/07/dota-2-pseudo-rng-definition/
16. Tetris Fandom wiki, "Random Generator" — https://tetris.fandom.com/wiki/Random_Generator
17. TechXplore, on Spotify shuffle — https://techxplore.com/news/2015-02-spotify-random-shuffle-mortals.html
18. Tech Insider, "How to Wire Up Provably Fair RNG with SHA-256" — https://tech-insider.org/igt-how-to-wire-up-provably-fair-rng-with-sha-256-commit-re-en-d172/
19. Stake, "Provably Fair Implementation" — https://stake.com/provably-fair/implementation
20. Developer.com, "How We Learned to Cheat at Online Poker" — https://www.developer.com/tech/article.php/616221/How-We-Learned-to-Cheat-at-Online-Poker-A-Study-in-Software-Security.htm
21. Datamation, "How to Cheat at Online Poker: A Study in Software Security" — https://www.datamation.com/applications/how-to-cheat-at-online-poker-a-study-in-software-security/
22. Rob Weir, "Microsoft random browser ballot" — https://www.robweir.com/blog/2010/02/microsoft-random-browser-ballot.html
23. Medium, "How to shuffle (correctly) an array in JavaScript" — https://medium.com/@nitinpatel_20236/how-to-shuffle-correctly-shuffle-an-array-in-javascript-15ea3f84bfb
24. V8 blog, "Math.random()" — https://v8.dev/blog/math-random
25. Hackaday, "V8 JavaScript Fixes Horrible Random Number Generator" — https://hackaday.com/2015/12/28/v8-javascript-fixes-horrible-random-number-generator/
26. arXiv 1908.10020 — https://arxiv.org/pdf/1908.10020
27. Chromium issue tracker, issue 456384547 — https://issues.chromium.org/issues/456384547
28. Innowwide, on the Aristocrat/Novomatic slot-machine hack — https://innowwide.eu/uncategorized/meet-alex-the-russian-casino-hacker-who-makes-millions-targeting-slot-machines-2/
29. RISKS Digest 30.13 — https://catless.ncl.ac.uk/Risks/30/13
30. Andy Tockman, "Correlated Randomness in Slay the Spire 2" — https://tck.mn/blog/correlated-randomness-sts2/
31. Steam Community, MTG Arena shuffler discussion — https://steamcommunity.com/sharedfiles/filedetails/?id=2181005326
32. Semantic Scholar, Lemire, "Fast Random Integer Generation in an Interval" — https://www.semanticscholar.org/paper/Fast-Random-Integer-Generation-in-an-Interval-Lemire/3137595b1582036d679dc7982add38da772b8220
33. ResearchGate, same paper — https://www.researchgate.net/publication/330693530_Fast_Random_Integer_Generation_in_an_Interval
34. "7 riffle shuffles to randomize a deck of cards" — https://mathematicaloddsandends.wordpress.com/2022/01/01/7-riffle-shuffles-to-randomize-a-deck-of-cards/
35. Cornell (Numb3rs season 5 math notes) — https://pi.math.cornell.edu/~numb3rs/spulido/Numb3rs_season5/Numb3rs_519.html
36. arXiv 2510.22783, Sellke, Shi and Wang — https://arxiv.org/pdf/2510.22783
37. Diaconis, "The Mathematics of Shuffling Cards" (PDF host) — http://yaroslavvb.com/papers/diaconis-mathematical.pdf
38. Daniel Lemire's blog, "The xorshift128+ random number generator fails BigCrush" — https://lemire.me/blog/2017/09/08/the-xorshift128-random-number-generator-fails-bigcrush/
39. Wikipedia, "Permuted congruential generator" — https://en.wikipedia.org/wiki/Permuted_congruential_generator
40. Daniel Lemire's blog, "Testing non-cryptographic random number generators: my results" — https://lemire.me/blog/2017/08/22/testing-non-cryptographic-random-number-generators-my-results/
41. Linux kernel mailing list archive (sfc32 discussion) — https://lkml.rescloud.iu.edu/hypermail/linux/kernel/2003.3/05870.html
42. GitHub, bryc code discussions #21 — https://github.com/bryc/code/discussions/21
43. GitHub, `paulmillr/noble-ciphers` — https://github.com/paulmillr/noble-ciphers
44. OpenJavaScript, "Create a weak or strong random number generator in JavaScript" — https://openjavascript.info/2022/05/19/create-a-weak-or-strong-random-number-generator-in-javascript/
45. iTech Labs, "RNG Testing" — https://itechlabs.com/compliance-testing/rng-testing/
46. iTech Labs (Italian site), "RNG Testing & Certification" — https://italian.itechlabs.com/certification-services/rng-testing-certification/
47. iTech Labs, "RTP/RNG Audits" — https://itechlabs.com/certification-services/rtprng-audits/
48. iTech Labs, "Annual Security Audits" — https://itechlabs.com/compliance-testing/annual-security-audits/
49. eCOGRA, "RNG Certification" — https://ecogra.org/services/random-number-generator-rng-certification/
50. NetGaming / Hellenic Gaming Commission GRC certificate (PDF) — https://client.netgaming.com/wp-content/uploads/2021/09/EN_e236497NTGGRCM-NG-Entertainment-Ltd-GRC-Multiple-Games-5-2023-ID-403446.pdf
51. WPI Computer Science, course slides referencing the ASF break — https://web.cs.wpi.edu/~claypool/courses/4513-B03/slides/BT01.pdf
52. Sudonull, translated copy of "Age of Empires network code: 1500 archers on a 28.8 kbit/s" — https://sudonull.com/post/13589-Age-of-Empires-network-code-1500-archers-on-a-288-kbit-s-modem/
53. GitHub Gist, Slay the Spire RNG notes — https://gist.github.com/luckytyphlosion/e1c1fd8b445e7df406ad4bc480f9dcdd
54. Lobsters, discussion of "Correlated Randomness" (Slay the Spire 2) — https://lobste.rs/s/irws5p/correlated_randomness_slay_spire_2
55. Gaffer On Games, "Floating Point Determinism" — https://gafferongames.com/post/floating_point_determinism/
56. Game Developer, "Osmos: Updates and Floating-Point Determinism" — https://www.gamedeveloper.com/programming/osmos-updates-and-floating-point-determinism
57. Gaffer On Games, "Fix Your Timestep!" — https://gafferongames.com/post/fix_your_timestep/
58. Draftsim, "MTG Arena Shuffler" — https://draftsim.com/mtg-arena-shuffler/
59. MTG Salvation forums, thread on official Wizards press releases — https://www.mtgsalvation.com/forums/magic-fundamentals/other-magic-products/mtg-arena/806095-looking-for-wizards-official-press-releases
60. MTG Salvation forums, "A million-game study says shuffler is rigged" — https://www.mtgsalvation.com/forums/magic-fundamentals/other-magic-products/mtg-arena/807120-a-million-game-study-says-shuffler-is-rigged
61. Dotabuff blog, "Pseudorandom mechanics, and how to use them to your advantage" — https://www.dotabuff.com/blog/2016-01-03-pseudorandom-mechanics--and-how-to-use-them-to-your-advantage
62. TetrisWiki, "Random Generator" — https://tetris.wiki/Random_Generator
63. Tetris Fandom wiki, "TGM randomizer" — https://tetris.fandom.com/wiki/TGM_randomizer
64. TetrisWiki, "TGM randomizer" — https://tetris.wiki/TGM_randomizer
65. 100RTP, "How to verify provably fair" — https://100rtp.games/guides/how-to-verify-provably-fair/
66. CheckMyPull, "What is a server seed?" — https://www.checkmypull.com/blog/what-is-a-server-seed
67. GamblingCalc, "Provably fair verifier" — https://gamblingcalc.com/crypto/provably-fair-verifier/
68. 100RTP, "Provably fair checker" tool — https://100rtp.games/tools/provably-fair-checker/
69. Snapnet, "Netcode architectures part 1: lockstep" — https://www.snapnet.dev/blog/netcode-architectures-part-1-lockstep/
