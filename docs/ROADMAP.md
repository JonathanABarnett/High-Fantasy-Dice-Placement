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

**Status:** complete as a playable systems layer. Four starting cards and ten market cards use typed deterministic effects; the market replenishes from a seeded deck; hands and card actions are playable in the browser; six Forge-gated upgrades permanently replace die faces with resource or masterwork symbols; upgrade costs, previews, scoring, saves, logs, CPU evaluation, a replayable nine-step visual tutorial, and deterministic player-count-scaled board scarcity are integrated.

## Milestone 4 — Content and polish

**Status:** in progress. Four interaction systems are implemented end to end (engine, content, CPU evaluation, UI, and tests):

- **Monster hunts** at Ruined Stronghold, with value-scaled overkill loot and critical strikes, and a guaranteed live hunt every round.
- **Raid bosses** at Dragon Pass: the Elder Dragon carries a 20-health pool across rounds, and the finishing blow claims the whole bounty.
- **Bumping**, letting a strictly higher die plus one influence drive a rival off a contested slot.
- **Crown quests**: three seeded, first-come shared objectives with typed conditions.

All four faction identities are also complete, each with a distinct grip on these systems, and the thirteen-step tutorial now teaches hunts, the raid, bumping, and quests. The market has grown to twenty-six cards, including empower, siege, steal, trophy, forged-face, and tag-payoff effects that reach into combat, rivalry, and long-term engines rather than only granting income. The Forge shop has grown to twelve permanent faces, including dual-symbol and masterwork lines. State moved to schema v4 (shared objectives and raid damage). Remaining: audio placeholders, deeper AI personality, end-game scoring presentation, and more late-game content.

## Deferred

Online multiplayer, accounts, matchmaking, ranked play, purchases, campaigns, achievements, native mobile apps, mods, large backend services, and live generative AI remain out of scope until the vertical slice is stable.
