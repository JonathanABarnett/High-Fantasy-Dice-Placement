# Game Design

## Status

Milestone 2 presents the deterministic placement, faction passive, resource, round, CPU, and scoring foundation on an interactive PixiJS fantasy map. The current terrain and location panels establish composition and interaction hierarchy with replaceable procedural artwork. Painted landmarks, portraits, cards, upgrades, objectives, monsters, relics, and final iconography remain target design rather than implemented play.

## Experience and pillars

**Realms of the Shattered Crown** is intended to feel like a premium tabletop strategy game in which dice are both workers and engines that players reshape over time.

1. **Every die creates a decision.** Values and affinities should open competing opportunities, not predetermine a turn. Monster hunts at the combat locations make raw value matter as a magnitude — a high roll loots more and can land a critical strike — so a six is a genuinely different choice from a five, not just another die that clears the gate.
2. **Growth is visible and personal.** Face upgrades, cards, and faction abilities should create a distinctive engine over six rounds.
3. **Competition stays legible.** Scarce locations and denial matter, while previews clearly explain legal actions, costs, and rewards. Bumping makes denial an explicit, priced move; the shared raid pool and first-come crown quests make rivals' progress something you must watch and race, not just observe.
4. **Chance can be managed.** Rerolls, conversion, upgrades, and low-value strategies prevent a poor roll from becoming a non-turn.
5. **Asymmetry changes priorities.** Factions share core rules but value actions differently.

## Planned factions

- **Arcanum Conclave:** mana, cards, arcane manipulation.
- **Ember Dominion:** combat, high values, monster rewards.
- **Verdant Covenant:** flexible resources, extra dice, efficient low values.
- **Stonebound League:** materials, face upgrades, permanent improvements.

All four faction identities are implemented and each now pulls on a different system: Arcanum on mana and cheap displacement, Ember on raid damage, Verdant on an extra die and resilience when bumped, Stonebound on forging and resisting displacement. Balance is checked by playing every faction pairing with an identical policy on both seats; see `packages/game-ai/src/faction-balance.test.ts`.

## Planned resources

Gold, mana, knowledge, materials, and influence should each have distinct sinks. Their exact income curves and conversions will be established through headless simulations in later milestones.

## Desired player emotions

The match should move from curiosity during the opening rolls, through mounting tactical tension as locations fill, to ownership and satisfaction when an upgraded set of dice produces a deliberate late-game combination.
