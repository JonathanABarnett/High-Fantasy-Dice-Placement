# Build brief: the end-of-match screen

A scoped work order for the final screen of a match. Self-contained — it should
not require the conversation that produced it. Delete once the work has landed.

## The problem

The match's climax is currently its flattest moment. `App.tsx` renders a
`.score-panel` containing a win/lose heading and, per player, five identical
rows of `{source}{points}`:

```
Player: 43              CPU: 37
Victory-point tokens 21 Victory-point tokens 18
Resource reserves     3 Resource reserves     3
Faction scoring       6 Faction scoring       4
Allies and relics     2 Allies and relics     3
Die enhancements     11 Die enhancements      9
```

Three things are wrong with it:

1. **It does not say how close it was.** "The realm crowns you" reads the same
   for a 1-point squeeze and a 20-point rout.
2. **It cannot be compared.** Two separate columns of the same five labels means
   the player has to do the subtraction themselves to find out _where_ the match
   was actually won or lost.
3. **It tells no story.** A match now contains a dragon hunted over several
   rounds, quests raced for, themed runs built, and dice bumped off slots. None
   of that survives to the summary — only arithmetic does.

## What to build

### 1. A headline that states the margin

Replace the flat heading with the result _and_ the gap: "You claim the crown by
6" / "The CPU takes the crown by 6" / "The realm is split" on a tie. Keep the
literal string `Match complete` somewhere in the panel (an e2e test asserts it).

### 2. Head-to-head score rows

One row per scoring source with both players' values side by side, and the
higher side visibly marked as the winner of that row. The player should be able
to glance at it and see "I won on enhancements, I lost the dragon."

Use the engine's own numbers. `scorePlayer(state, playerId)` and
`scoreTotal(state, playerId)` are already exported from
`@shattered-crown/game-engine` and return the five `ScoreBreakdown` entries.
Do not re-derive scoring in the UI — that duplication is exactly what
`scorePlayer` was extracted to prevent.

### 3. A match-highlights strip

Three to five short, concrete lines telling the story of the match. Prefer
whichever of these the data supports:

- **Monsters slain** — `PlayerState.monstersSlain` already exists per player.
- **Who felled the Elder Dragon** — the `monster-slain` event carries `beast`
  and `playerId`; the final hoard value is `raidBountyFor(location, rounds)`.
- **Quests claimed** — `GameState.objectives[].claimedBy` already exists.
- **Longest themed run** — the `chain-extended` event carries `length` and
  `tag`.
- **Biggest single blow** — the largest `bonusVictoryPoints` on a
  `monster-slain` event.

Anything not already on final state must be accumulated in the web layer from
the events flowing through `appendEvents` in `App.tsx`. **Do not add fields to
`GameState` or bump the schema for this.** It is presentation; the authoritative
state already contains or has emitted everything needed.

### 4. Motion, reused not reinvented

`CountUp` already exists in `App.tsx` and counts a number toward a new value
while honouring reduced motion. Use it for the totals so the final score lands
rather than appearing. Stagger the head-to-head rows in if it helps, gated on
`reducedMotion` like the rest of the motion work.

## Constraints

- **Do not touch `packages/game-engine`, `shared-types`, or the save schema.**
  This is a presentation change. If it seems to need engine data, the data is
  almost certainly already in state or in an emitted event.
- **Keep these e2e anchors intact.** `apps/web/e2e/shell.spec.ts` asserts the
  text `Match complete` is visible and that a button named
  `Play another match` exists. Both must survive.
- **Art is already available and wired.** `assets/generated/ui/victory-scoring-v1.webp`
  is imported as `victoryScoringArt` and applied via `panelArtStyle`. Keep using
  it; no new assets are required for this work.
- **Reduced motion must be honoured**, consistent with `.reduced-motion` and the
  existing `CountUp` / callout / die-flight behaviour.
- The panel must stay readable at 1280×720, which is the Playwright viewport.

## Acceptance

- `pnpm check` passes (format, lint, typecheck, all unit tests, build).
- `pnpm test:e2e` passes all eight specs.
- A finished match answers, without the player doing arithmetic: did I win, by
  how much, which category decided it, and what were the two or three moments
  that mattered.
- `docs/ROADMAP.md` Milestone 5 no longer lists end-of-match scoring
  presentation as remaining.

## Worth knowing before you start

Two hazards have already bitten this codebase and both apply here:

- **The CPU acts on a ~220ms timer**, so this tree re-renders constantly. An
  animation owned by a React effect can be torn down mid-flight; that is why
  `throwDieToBoard` builds a detached node instead. Prefer the same approach for
  any fire-and-forget flourish.
- **Playwright measures transient values.** Two tests in this suite already had
  to be wrapped in `expect(...).toPass()` because they read a box or clicked a
  button while the layout was still settling. If a new assertion measures
  geometry, expect to need the same.
