# Handoff: Milestone 4 interaction systems

This note covers the Milestone 4 work that added combat, rivalry, and shared
goals to the match. Player-facing rules live in [`RULES.md`](RULES.md) and scope
lives in [`ROADMAP.md`](ROADMAP.md); this file records the reasoning, the
invariants that are easy to break, and where the open questions are. Once it has
been absorbed it can be deleted.

## Why this work happened

The engine was correct but emotionally flat. The specific diagnosis:

- **Die values did not matter beyond a gate.** A slot only asked `value >= minimum`,
  so a rolled 6 at Dragon Pass paid exactly what a 5 did. The AI even _penalised_
  spending high dice (`score -= faceValue * 0.04`). In a dice game that is the
  core sin — the roll stops being interesting the moment it clears the bar.
- **No swings.** Every reward was "gain N resources", funnelled into a capped
  3 points of reserves. Nothing could go dramatically right or wrong.
- **No interaction.** Two players raced for slots in parallel. The `combat` tag,
  Dragon Pass, and "monsters" existed in the docs but had no implementation.

Everything below follows from those three problems.

## What was added

| System             | Where                  | Shape                                                                                                                                      |
| ------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Monster hunts      | Ruined Stronghold      | Slot minimum = beast threat. Value over threat loots spoils; natural 6 or masterwork face is a critical strike.                            |
| Raid boss          | Dragon Pass            | 20 shared health in `GameState.raidDamage`, persists across rounds. Both players wound the same pool; the finisher takes the whole bounty. |
| Bumping            | `bump-die` action      | Strictly higher value plus a bump cost takes a held slot. The victim's die returns `ready`.                                                |
| Crown quests       | `GameState.objectives` | Three seeded `ClaimableObjective`s, first-come, resolved in `resolveObjectives`.                                                           |
| Faction identities | all four               | Each pulls on a different system (see `RULES.md`).                                                                                         |
| Board-facing cards | 6 new market cards     | `boost-die`, `damage-raid`, `steal-resource`.                                                                                              |

State moved to **schema v4**. Old v3 saves are rejected rather than migrated,
matching how the loader already handled version drift. `SAVE_KEY` in
`apps/web/src/App.tsx` moved to `.v4` in step.

## Invariants — the things that are easy to break

**1. Every rule that reads a die's number must call `dieValue(die)`.**
Cards can add a temporary `Die.valueBonus`, so the rolled face is no longer the
die's real value. `dieValue` is exported from `@shattered-crown/game-engine` and
is used by legality checks, bump comparisons, overkill, criticals, raid damage,
the CPU, and the UI. Reading `faces[rolledFaceIndex].value` directly will look
correct and silently ignore boosts.

**2. Derived combat numbers come from the engine, not from re-derivation.**
`raidDamageFor(player, die)` is exported for exactly this reason — the AI and the
location preview both call it. An earlier version recomputed damage in the UI and
drifted from the rules the moment Ember's `+2` bonus landed. If a new surface
needs a combat number, export a helper rather than reimplementing the formula.

**3. Adding an RNG draw in `createGame` reshuffles every seed.**
`createGame` draws from one seeded stream in order. Inserting a draw — the
three-objective shuffle did this — shifts everything downstream, so every seed
produces a different board. This is invisible to unit tests (they use their own
fixtures) and broke the Forge Hall e2e test, which had assumed Forge Hall was
open in round one on the default seed. **After changing RNG ordering, run
`pnpm test:e2e`, not just `pnpm test`.** Tests that need a specific board should
fill the "Match seed" input rather than trusting the app default.
(`random.shuffle([])` consumes nothing, so content-free fixtures stay stable.)

**4. `packages/game-ai/src/balance.test.ts` runs against real content.**
It asserts hard floors across 24 seeds: matches complete, placements ≥ 44,
forced passes ≤ 12, low-roll route coverage ≥ 0.9. Any change to
`game-content` locations or to `configureRoundScarcity` can break it. Reward and
scoring changes are usually safe; changes to _which or how many slots open_ are
not. A first attempt at guaranteeing combat forced both high-minimum combat sites
open every round and pushed placements under the floor.

**5. The guaranteed-hunt swap must stay count-preserving.**
`configureRoundScarcity` guarantees a live hunt each round by swapping one in for
an ordinary location _only when none was selected_, matching the evicted
location's open-slot count and never evicting a reserved low-roll route. If that
swap starts changing totals, invariant 4 fails.

## How to verify gameplay, not just correctness

Compiling and unit-testing does not tell you whether a mechanic _fires_ or
whether it is _fun_. Two harnesses exist for that, both driving **both seats**
with `chooseCpuAction` so the only variable is the rules:

- **`packages/game-ai/src/systems.test.ts`** — asserts each system actually
  occurs in real play: a live hunt is reachable in every round, the dragon dies
  in most matches, bumps and quest claims happen on every seed, boosts and steals
  fire, and bumping stays below a per-match rate. Extend this when adding a
  system. It caught bump pricing that produced ~15 bumps/match, which made denial
  routine instead of dramatic.
- **`packages/game-ai/src/faction-balance.test.ts`** — plays every ordered
  faction pairing and fails if any faction leaves a 25–75% win band. This caught
  a first-draft Stonebound ability ("dice cannot be bumped") at **82%**.

**Read the caveat on these numbers.** They are identical-greedy-bot versus
identical-greedy-bot. They are a smoke test for dominant or trap factions, not a
model of skilled human play. The current spread is roughly 44–57%; treat that as
"nothing is broken", not "perfectly balanced".

## Decisions that were deliberate

- **Card damage cannot finish the raid.** `damage-raid` floors the boss at 1
  health. Siege weapons soften; a die must land the killing blow. This keeps the
  bounty a placement moment and avoids duplicating bounty/`monstersSlain` logic in
  the card path. There is a content test asserting no siege card ships without a
  second effect, so it cannot be dead in hand after the dragon dies.
- **Boosts are temporary.** `valueBonus` is cleared on reroll. Permanent face
  improvement stays the Forge's exclusive role.
- **Bumping returns the die ready.** It costs the attacker tempo and a resource
  rather than destroying anything, which keeps it aggressive without being
  punishing. The strictly-higher-value requirement is also what makes bump
  exchanges terminate rather than loop.
- **Stonebound resist bumping via a tax, not immunity.** Absolute immunity tested
  at an 82% win rate.
- **Default seed is `shattered-crown-008`.** Chosen because Forge Hall opens in
  round one, which keeps the tutorial's Forge step demonstrable on a first run.
  It is otherwise arbitrary.

## Pre-existing bug fixed along the way

Verdant's scoring rule was `floor(resourceTypes / 3)`. With only five resource
types in the game that **caps at 1 point**, permanently — the faction's scoring
rule was a trap and had been since it was written. It now scores 1 point per
resource type held 3 or more of. Flagging it because it predates this work and
suggests the other scoring rules deserve the same arithmetic sanity check.

## Where to go next

Roughly in order of value:

1. **More upgrades and relics.** The upgrade list is six entries and every relic
   is a plain resource gain. Relics that interact with raids or bumping would use
   the effect types that now exist.
2. **Scoring presentation.** The end screen is a flat list of five sources. With
   bounties, criticals, and quests now feeding victory points, a breakdown that
   shows _where the drama came from_ would land much better.
3. **Tutorial depth.** Thirteen steps is close to the limit of a pre-game
   walkthrough. Contextual prompts during the first match may now beat adding a
   fourteenth step.
4. **AI quality.** `chooseCpuAction` is greedy and single-ply. It calls
   `applyAction` speculatively for objective claims, which is a natural seam for
   real lookahead if the CPU ever needs to be a genuine opponent.

## Open questions worth a human decision

- **Is a v3 → v4 save migration wanted?** Currently v3 saves are rejected. That
  matched existing behaviour, but no migration path has been written.
- **Is bumping tuned right?** It sits around nine per match. That was chosen so
  it reads as a swing rather than routine, but it is a feel judgement made against
  a bot, not against real play.
- **Should the CPU be beatable-but-sharp, or a sparring partner?** Current tuning
  aims at "competent", and several magic numbers in `game-ai` encode that
  assumption.
