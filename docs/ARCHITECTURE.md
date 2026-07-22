# Architecture

## Package boundaries

The project is a pnpm workspace with a React client and four domain packages:

| Package                 | Responsibility                                                                      | Must not contain                                   |
| ----------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| `apps/web`              | React panels, Zustand UI state, PixiJS board rendering, input, animation            | Rule decisions or authoritative state transitions  |
| `packages/game-engine`  | Deterministic validation, state transitions, event emission, scoring, serialization | React, PixiJS, browser APIs, content prose         |
| `packages/game-content` | Data-driven factions, locations, cards, objectives, upgrades                        | UI components or arbitrary executable card scripts |
| `packages/game-ai`      | Legal-action evaluation and deterministic CPU policy                                | Rule bypasses or hidden-information access         |
| `packages/shared-types` | Stable IDs and serializable cross-boundary contracts                                | Runtime rules or UI state                          |

Dependencies point inward: the web client, AI, and content packages may depend on shared contracts; the engine depends only on shared contracts. The AI must request legal actions from the engine. The engine never imports the AI, content presentation, or web client.

## State and action flow

```text
React/Pixi input
  -> proposed GameAction
  -> engine validation
  -> immutable state transition
  -> GameEvent[]
  -> UI store and animation queue
```

`GameState` is the authoritative match state. Zustand stores transient interface concerns only, such as selection, open panels, and motion preferences. Visual state must be reconstructible from authoritative state plus emitted events.

The Milestone 2 board renderer receives immutable state and legal actions as props. PixiJS owns terrain, location hotspots, occupancy markers, pointer inspection, and highlight animation. React owns dice controls, drag payloads, previews, settings, logs, and accessible fallback buttons. Pixi callbacks can only propose a location and die; React constructs the slot action and sends it through engine validation.

Generated artwork lives under `assets/generated` with an asset manifest. Vite imports the selected map and faction portraits as versioned URLs. The map remains a passive Pixi sprite below code-rendered hotspots; portraits are decorative React images. Replacing either asset class cannot change legality, state, labels, or saved games.

## Determinism and randomness

`SeededRandom` uses xorshift32, accepts numeric or string seeds, and exposes a serializable snapshot. Any rule that needs chance receives an RNG explicitly; it must not use `Math.random`, clocks, DOM state, or ambient globals. A saved match will persist both the original match seed and current RNG state. The algorithm name is part of the snapshot so an incompatible future algorithm can be migrated rather than silently changing replays.

## Validation and events

`validateAction` checks a proposed action without mutation. Rejections carry stable machine codes plus player-readable messages. `applyAction` returns a new state and ordered events with monotonic sequence numbers. `enumerateLegalActions` is shared by the debug client and CPU, and the same API can serve replay verification and a future server.

## Serialization

All authoritative models are JSON-safe. State includes a schema version, stable string IDs, RNG state, and event sequence. The current loader performs structural and schema-version checks; comprehensive runtime schema validation and migrations remain future work. UI state and in-progress animation are not saved.

## Future multiplayer

The client/action boundary is intentionally transport-neutral. A future server can own `GameState`, validate commands, assign action IDs, persist event batches, and return redacted player views. Networking, authentication, matchmaking, databases, and reconciliation are deferred until the vertical slice is stable. No current API should be interpreted as a secure multiplayer protocol.

## Risky assumptions

- A single full `GameState` is acceptable for local play; hidden information will require player-specific projections before multiplayer.
- xorshift32 is chosen for repeatability and speed, not cryptographic security.
- Stable IDs are branded strings at compile time; runtime content validation is still required.
- PixiJS is appropriate for the board while React owns overlays. Accessibility requires parallel DOM controls for every important board action.
- Node 22 and evergreen desktop browsers are the initial support floor.
- Workspace packages compile as ESM. If a future server uses a different module format, it should adapt at its boundary.
