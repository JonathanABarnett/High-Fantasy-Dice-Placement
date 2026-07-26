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

import { chooseCpuAction } from './index.js';

interface FactionRecord {
  wins: number;
  games: number;
  points: number;
}

/**
 * Plays every ordered faction pairing with the same policy on both seats, so
 * the only asymmetry left is the factions themselves. Bot-versus-bot win rates
 * are a smoke test for dominant or trap factions, not a model of skilled play.
 */
function playAllMatchups(seedsPerPairing: number) {
  const records = new Map<string, FactionRecord>(
    factions.map((faction) => [
      faction.id as string,
      { wins: 0, games: 0, points: 0 },
    ]),
  );

  for (const first of factions) {
    for (const second of factions) {
      if (first.id === second.id) continue;
      for (let seed = 0; seed < seedsPerPairing; seed += 1) {
        let state: GameState = createGame({
          seed: `matchup-${first.id}-${second.id}-${seed}`,
          humanFactionId: first.id,
          cpuFactionId: second.id,
          content: { factions, locations, cards, upgrades, objectives },
        }).state;
        let guard = 0;
        while (state.phase !== 'complete' && guard < 400) {
          const allCpu: GameState = {
            ...state,
            players: state.players.map((player) => ({
              ...player,
              controller: 'cpu' as const,
            })),
          };
          let action: GameAction;
          try {
            action = chooseCpuAction(allCpu);
          } catch {
            action = { type: 'pass', playerId: state.turn.activePlayerId };
          }
          state = applyAction(state, action).state;
          guard += 1;
        }

        const firstRecord = records.get(first.id as string)!;
        const secondRecord = records.get(second.id as string)!;
        const totals = state.players.map((player) =>
          (state.result?.scores[player.id] ?? []).reduce(
            (total, entry) => total + entry.points,
            0,
          ),
        );
        firstRecord.games += 1;
        secondRecord.games += 1;
        firstRecord.points += totals[0] ?? 0;
        secondRecord.points += totals[1] ?? 0;
        const winners = state.result?.winnerIds ?? [];
        if (winners.length === 1) {
          if (winners[0] === state.players[0]?.id) firstRecord.wins += 1;
          else secondRecord.wins += 1;
        }
      }
    }
  }

  return records;
}

describe('faction balance', () => {
  it('leaves no faction dominant and none a trap', () => {
    const records = playAllMatchups(8);

    for (const faction of factions) {
      const record = records.get(faction.id as string)!;
      expect(record.games).toBeGreaterThan(0);
      const winRate = record.wins / record.games;
      // Wide bounds: this guards against the lopsided cases that real tuning
      // bugs produce, without pinning the design to one bot's quirks.
      expect(
        winRate,
        `${faction.name} win rate ${(winRate * 100).toFixed(1)}%`,
      ).toBeGreaterThan(0.25);
      expect(
        winRate,
        `${faction.name} win rate ${(winRate * 100).toFixed(1)}%`,
      ).toBeLessThan(0.75);
    }

    // Every faction should also be scoring in the same league.
    const averages = factions.map((faction) => {
      const record = records.get(faction.id as string)!;
      return record.points / record.games;
    });
    expect(Math.min(...averages)).toBeGreaterThan(Math.max(...averages) * 0.7);
  });
});
