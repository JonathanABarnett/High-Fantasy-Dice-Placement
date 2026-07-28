import { describe, expect, it } from 'vitest';

import {
  cards,
  factions,
  locations,
  objectives,
  upgrades,
} from '@shattered-crown/game-content';
import { applyAction, createGame } from '@shattered-crown/game-engine';
import type { GameAction, GameState } from '@shattered-crown/shared-types';

import { chooseCpuAction, type CpuDifficulty } from './index.js';

/**
 * Seats a Knight against `challenger` and reports how often the challenger
 * wins. Both seats run the same evaluator, so any gap is the difficulty tier
 * itself rather than faction or seat advantage.
 */
function challengerWinRate(challenger: CpuDifficulty, seedCount: number) {
  let wins = 0;
  let decided = 0;
  for (let index = 0; index < seedCount; index += 1) {
    let state: GameState = createGame({
      seed: `difficulty-${challenger}-${index}`,
      humanFactionId: factions[0]!.id,
      cpuFactionId: factions[1]!.id,
      content: { factions, locations, cards, upgrades, objectives },
    }).state;
    // Seat 0 is the baseline Knight; seat 1 plays at the challenger tier.
    const challengerId = state.players[1]!.id;
    let guard = 0;
    while (state.phase !== 'complete' && guard < 400) {
      const allCpu: GameState = {
        ...state,
        players: state.players.map((player) => ({
          ...player,
          controller: 'cpu' as const,
        })),
      };
      const tier: CpuDifficulty =
        state.turn.activePlayerId === challengerId ? challenger : 'knight';
      let action: GameAction;
      try {
        action = chooseCpuAction(allCpu, tier);
      } catch {
        action = { type: 'pass', playerId: state.turn.activePlayerId };
      }
      state = applyAction(state, action).state;
      guard += 1;
    }
    const winners = state.result?.winnerIds ?? [];
    if (winners.length === 1) {
      decided += 1;
      if (winners[0] === challengerId) wins += 1;
    }
  }
  return decided === 0 ? 0 : wins / decided;
}

describe('cpu difficulty', () => {
  it('separates the tiers by actual strength, not just by label', () => {
    const squire = challengerWinRate('squire', 16);
    const warlord = challengerWinRate('warlord', 16);

    // A Squire seated against a Knight should lose more than it wins, and a
    // Warlord should do better than a Squire. Without this the selector is
    // cosmetic.
    expect(squire).toBeLessThan(0.5);
    expect(warlord).toBeGreaterThan(squire);
  });
});
