# Testing

## Commands

| Command             | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `pnpm test`         | Run deterministic engine unit tests once                 |
| `pnpm test:watch`   | Run unit tests in watch mode                             |
| `pnpm test:e2e`     | Run the Chromium browser smoke test                      |
| `pnpm lint`         | Check TypeScript and React lint rules                    |
| `pnpm typecheck`    | Type-check every workspace package                       |
| `pnpm format:check` | Verify formatting                                        |
| `pnpm build`        | Build packages and the production web client             |
| `pnpm check`        | Run formatting, lint, types, units, and production build |

Playwright's browser binary must be installed once with `pnpm exec playwright install chromium`.

## Coverage expectations

Tests cover deterministic RNG behavior, content counts and unique IDs, repeatable setup, legal-action enumeration, placement restrictions, occupied slots, rewards, costs, typed card effects, market replenishment, Forge gating, permanent face replacement, ordered events, passing, round completion, scoring, save round-trips, deterministic legal CPU choices, player-count-scaled scarcity, low-roll placement routes, and multi-seed balance simulations over the real content set. Playwright verifies PixiJS board startup, the complete visual tutorial and replay flow, keyboard-accessible placement through the same engine actions, card play, Forge upgrades, and a complete six-round browser match. Later milestones must add advanced faction powers and wider playstyle-specific balance simulations. Visual appearance never substitutes for rule assertions.

CI runs the main verification suite and Chromium smoke test on each push and pull request.
