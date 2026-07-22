# Realms of the Shattered Crown

A browser-first high-fantasy dice-placement strategy game. The repository is currently at **Milestone 3**: a complete deterministic match with executable cards, a seeded market, permanent die upgrades, an interactive PixiJS fantasy board, and a replayable visual tutorial.

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

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for package responsibilities and [`docs/ROADMAP.md`](docs/ROADMAP.md) for scope.
