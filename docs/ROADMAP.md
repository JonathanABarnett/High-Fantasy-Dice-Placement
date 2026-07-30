# Roadmap

## Milestone 0 — Repository and architecture

**Status:** complete.

- pnpm monorepo and package boundaries
- React/Vite web shell with PixiJS and Zustand dependencies
- deterministic RNG and unit tests
- shared game contracts
- ESLint, Prettier, Vitest, Playwright, and CI
- architecture and product documentation

## Milestone 1 — Headless match

**Status:** complete as a playable debug vertical layer.

Implemented two-player setup, four initial factions, five dice per player, twelve locations, placement validation, rewards, six-round flow, passing, basic scoring, deterministic CPU turns, serialization, and a temporary browser debug interface.

## Milestone 2 — Playable board interface

**Status:** complete. The React debug grid has been replaced by a responsive PixiJS terrain board with twelve interactive hotspots over a generated painted realm map, generated faction portraits, legal-placement highlighting, click placement, HTML drag-and-drop, engine-derived previews and rejection explanations, match logging, reduced-motion control, and keyboard-accessible placement alternatives. Final location art and iconography remain replaceable visual-content work.

## Milestone 3 — Cards and dice upgrades

**Status:** complete as a playable systems layer. Four starting cards and a deeper market use typed deterministic effects; the market replenishes from a seeded deck; hands and card actions are playable in the browser; twelve Forge-gated upgrades permanently replace die faces with resource, dual-symbol, or masterwork symbols; upgrade costs, previews, scoring, saves, a command-drawer sidebar, CPU evaluation, a replayable visual tutorial, and deterministic player-count-scaled board scarcity are integrated.

## Milestone 4 — Content and polish

**Status:** in progress. Four interaction systems are implemented end to end (engine, content, CPU evaluation, UI, and tests):

- **Monster hunts** at Ruined Stronghold, with value-scaled overkill loot and critical strikes, and a guaranteed live hunt every round.
- **Raid bosses** at Dragon Pass: the Elder Dragon carries a 20-health pool across rounds, and the finishing blow claims the whole bounty.
- **Bumping**, letting a strictly higher die plus one influence drive a rival off a contested slot.
- **Crown quests**: three seeded, first-come shared objectives with typed conditions.

All four faction identities are also complete, each with a distinct grip on these systems, and the fifteen-step tutorial now teaches panel management, hunts, the raid, bumping, card engines, expanded Forge upgrades, and quests. The market has grown to twenty-six cards, including empower, siege, steal, trophy, forged-face, and tag-payoff effects that reach into combat, rivalry, and long-term engines rather than only granting income. The Forge shop has grown to twelve permanent faces, including dual-symbol and masterwork lines. State moved to schema v4 (shared objectives and raid damage). Remaining: audio placeholders, deeper AI personality, end-game scoring presentation, and more late-game content.

## Milestone 5 — Making it felt

**Status:** in progress. Playtesting showed the systems were present but imperceptible, so this milestone is about tension and legibility rather than new rules:

- **Momentum runs** make placements interlock, so the order dice are committed in is the decision rather than each turn being an isolated best-slot pick.
- **The dragon's wrath** gives a raid boss its own turn: its hoard grows every round it survives and it regenerates in rounds nobody wounds it, which puts a clock on the match.
- **Moment callouts** promote one headline per batch of events over the board, so a critical strike no longer reads like a resource tick.
- **Opponent difficulty** (Squire / Knight / Warlord) with a top tier that weighs what each square is worth to _you_, verified to differ in real strength.
- **Reactive motion.** The screen already had ambient animation — a breathing backdrop, rising panels, pulsing threats — but almost nothing moved in response to the player. Dice now tumble before settling on the value the engine rolled, a committed die is thrown from the tray to its board slot instead of teleporting, and scores count toward their new totals rather than snapping. All of it honours reduced motion.

Remaining: compact card/market rows, tactile Forge before/after previews, richer end-of-match scoring presentation, refreshed art/audio feedback, and broader user-facing playtests around whether momentum and dragon wrath are legible without reading the log.

## Deferred

Online multiplayer, accounts, matchmaking, ranked play, purchases, campaigns, achievements, native mobile apps, mods, large backend services, and live generative AI remain out of scope until the vertical slice is stable.
