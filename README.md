# Realms of the Shattered Crown

A browser-first high-fantasy dice-placement strategy game. The repository is currently at **Milestone 3** with a **Milestone 4** combat layer underway: a complete deterministic match with executable cards, a seeded market, permanent die upgrades, an interactive PixiJS fantasy board, and a replayable visual tutorial.

Combat and competition turn raw dice values into drama:

- **Monster hunts** at Ruined Stronghold — beat a beast's threat to slay it, and every point over the threat loots extra spoils. A natural six or a forged masterwork face lands a **critical strike** for bonus victory points, so a high roll (or a die you deliberately upgraded at the Forge) is a genuine payoff rather than an overqualified gate-clear. At least one live hunt is open every round.
- **The Elder Dragon** at Dragon Pass — a persistent raid boss with 20 health that carries across rounds. Both players' wounds land in the same pool, and whoever strikes the killing blow takes the entire bounty of 6 victory points and the gold hoard.
- **Bumping** — a strictly higher die plus one influence drives a rival off a contested slot. Their die returns to them ready, so it costs tempo rather than destroying it.
- **Crown quests** — three shared, first-come objectives drawn per match. The moment someone meets one, it is theirs for good.

- **Cards that reach the board** — empower a die mid-round to clear a gate or reach a critical strike, batter the dragon with siege weapons (though a die must still land the killing blow), or simply steal from your rivals.

All four factions are playable and pull on these systems differently: Ember are the fastest dragonslayers, Stonebound are hardest to shift off a slot, Arcanum displace rivals cheaply with magic, and Verdant field a sixth die and profit from being bumped.

Choose **Learn to play** on the setup screen for a guided nine-step walkthrough. During a match, **How to play** reopens it without changing match state. The tutorial supports Back/Next controls, clickable progress markers, Left/Right Arrow navigation, and Escape to close.

Hover or keyboard-focus resource and card-category tokens for rule explanations. Each two-player round opens six regions and eight contested slots, with more slots opening automatically for larger player counts; the rest are visibly sealed. Selecting a die makes every open board location display a textual **Playable**, **Blocked**, or **Full** state, while individual slots show their value, affinity, and payment requirements.

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer

## Commands

```bash
pnpm install
pnpm dev
pnpm check
pnpm test:e2e
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for package responsibilities and [`docs/ROADMAP.md`](docs/ROADMAP.md) for scope. [`docs/HANDOFF.md`](docs/HANDOFF.md) records the reasoning and invariants behind the Milestone 4 interaction systems.
