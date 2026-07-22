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

**Status:** planned. Complete four factions, cards, upgrades, objectives, monsters, relics, tutorial, audio placeholders, save/resume, scoring presentation, and automated balance checks.

## Deferred

Online multiplayer, accounts, matchmaking, ranked play, purchases, campaigns, achievements, native mobile apps, mods, large backend services, and live generative AI remain out of scope until the vertical slice is stable.
