# Randomness, shuffling and fairness in digital card games

Research how digital card and board games generate randomness and shuffle fairly, how this has gone wrong, and how deterministic, seeded randomness is used for replays and testing.

## Questions

1. **Failures.** Find documented cases of broken shuffles or predictable randomness in online card games and elsewhere, such as the late-1990s exploit of an online poker site's shuffle. What went wrong, and what are the lessons?
2. **Shuffling algorithms.**
   - What does a correct Fisher–Yates implementation look like, and what are the common bugs (off-by-one errors, sorting with a random comparator)?
   - How do you generate unbiased integers in a range (rejection sampling, Lemire's method)?
   - Have physical shuffles, such as riffles, been simulated, and does any game do this on purpose?
3. **Seed space.** A 52-card deck has 52! ≈ 2^226 orderings. What does a PRNG's state size mean for which shuffles can actually occur? Does it matter in practice when seeds are kept secret?
4. **Choosing a PRNG.** Compare the PRNGs games commonly use: Mersenne Twister, the xorshift/xoshiro family, PCG, SplitMix, sfc, and ChaCha-based cryptographically secure generators. Compare them on:
   - quality;
   - speed in JavaScript;
   - state size;
   - how easily their state can be serialised.

   When is a cryptographically secure generator actually necessary?
5. **Certification.** How do regulated online card games and casinos certify their randomness (e.g. GLI-19, eCOGRA, iTech Labs)? Which parts of that are relevant to casual games with no money involved?
6. **Determinism.**
   - How do games use seeded randomness for replays, testing, reproducing bugs, and keeping multiplayer games in sync (lockstep, deterministic simulation)?
   - How are separate random streams used so that a change in one place doesn't shift every later result?
   - What commonly breaks determinism? For example: floating point, iteration order, sort stability, `Math.random`.
7. **Perceived fairness.**
   - Players often believe shuffles are rigged when they see streaks. How do digital games deal with that?
   - Do any games deliberately bias their randomness? Examples include pseudo-random distribution and bag randomisers.
   - How do games show that they're fair? For example, "provably fair" commit-reveal schemes.

## Output

- **Summary:** up to 10 bullets.
- **Findings:** one section per question.
- **Recommendation:** for a casual multiplayer card game server with no money involved, recommend a PRNG, a seeding approach, a shuffle method and a design for random streams, with reasons.
- **Sources:** cite them inline with links. Prefer papers, official documentation and source code, and mark anything inferred.
