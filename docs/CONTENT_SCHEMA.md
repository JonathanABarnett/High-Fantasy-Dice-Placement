# Content Schema

## Status

Milestone 3 supplies four faction definitions, twelve locations, fourteen executable cards, and six permanent die-face upgrades. Objectives remain deferred.

Content belongs in `packages/game-content` and is imported as immutable data. Definitions use stable branded string IDs and reference other entities by ID. Rules-facing effects form a discriminated union in `packages/shared-types`; UI components render those effects but do not execute them.

## Current models

- `FactionDefinition`: identity, passive, round ability, starting card reference, and scoring rule description.
- `BoardLocation`: identity, description, tags, and placement slots.
- `PlacementSlot`: occupancy and typed placement requirements.
- `Card`: category, cost, typed effects, target requirement, market copies, and display text.
- `UpgradeDefinition`: cost, permanent replacement face, symbols, description, and score value.
- `Objective`: identity, description, and points.
- `GameEffect`: a closed union of resource gain, card draw, ready-die reroll, and victory-point operations.

## Planned validation

Later content work should add runtime schema validation that rejects duplicate IDs, dangling references, invalid resource amounts, malformed dice faces, and unsupported effects before a match starts. Rules text is presentation only; it must agree with typed effects but cannot itself drive behavior.
