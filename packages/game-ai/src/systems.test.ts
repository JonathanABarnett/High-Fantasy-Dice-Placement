import { describe, expect, it } from 'vitest';

import {
  cards,
  factions,
  locations,
  objectives,
  upgrades,
} from '@shattered-crown/game-content';
import {
  applyAction,
  createGame,
  enumerateLegalActions,
} from '@shattered-crown/game-engine';
import type { GameAction, GameState } from '@shattered-crown/shared-types';

import { chooseCpuAction } from './index.js';

interface SystemMetrics {
  readonly raidKills: number;
  readonly hunts: number;
  readonly bumps: number;
  readonly claims: number;
  readonly boosts: number;
  readonly chainScores: number;
  readonly chainPoints: number;
  readonly longestChain: number;
  readonly steals: number;
  readonly roundsWithHunt: number;
  readonly rounds: number;
  readonly seedsWithBump: number;
  readonly seedsWithClaim: number;
  readonly seedsWithDragonKill: number;
  readonly firstSeatWins: number;
  readonly completed: number;
  readonly seeds: number;
}

/** Drives both seats with the CPU policy so every system gets exercised. */
function simulateSystems(seedCount: number): SystemMetrics {
  let raidKills = 0;
  let hunts = 0;
  let bumps = 0;
  let claims = 0;
  let boosts = 0;
  let chainScores = 0;
  let chainPoints = 0;
  let longestChain = 0;
  let steals = 0;
  let roundsWithHunt = 0;
  let rounds = 0;
  let seedsWithBump = 0;
  let seedsWithClaim = 0;
  let seedsWithDragonKill = 0;
  let firstSeatWins = 0;
  let completed = 0;

  for (let index = 0; index < seedCount; index += 1) {
    let state: GameState = createGame({
      seed: `systems-${index}`,
      humanFactionId: factions[0]!.id,
      cpuFactionId: factions[1]!.id,
      content: { factions, locations, cards, upgrades, objectives },
    }).state;
    let seedBumps = 0;
    let seedClaims = 0;
    let seedDragonKills = 0;
    let guard = 0;
    let seenRound = 0;

    while (state.phase !== 'complete' && guard < 400) {
      if (state.round.number !== seenRound) {
        seenRound = state.round.number;
        rounds += 1;
        const liveHunt = state.locations.some(
          (location) =>
            location.encounter &&
            location.isActive !== false &&
            (location.encounter.health === undefined ||
              (state.raidDamage[location.id] ?? 0) < location.encounter.health),
        );
        if (liveHunt) roundsWithHunt += 1;
      }
      if (enumerateLegalActions(state).length === 0) break;
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
      const result = applyAction(state, action);
      for (const event of result.events) {
        if (event.type === 'monster-slain') {
          if (event.beast === 'Elder Dragon') {
            raidKills += 1;
            seedDragonKills += 1;
          } else hunts += 1;
        }
        if (event.type === 'die-bumped') {
          bumps += 1;
          seedBumps += 1;
        }
        if (event.type === 'objective-claimed') {
          claims += 1;
          seedClaims += 1;
        }
        if (event.type === 'die-boosted') boosts += 1;
        if (event.type === 'chain-extended') {
          if (event.bonusVictoryPoints > 0) chainScores += 1;
          chainPoints += event.bonusVictoryPoints;
          if (event.length > longestChain) longestChain = event.length;
        }
        if (event.type === 'resource-stolen') steals += 1;
      }
      state = result.state;
      guard += 1;
    }

    if (state.phase === 'complete') completed += 1;
    if (seedBumps > 0) seedsWithBump += 1;
    if (seedClaims > 0) seedsWithClaim += 1;
    if (seedDragonKills > 0) seedsWithDragonKill += 1;
    if (
      state.result?.winnerIds.length === 1 &&
      state.result.winnerIds[0] === state.players[0]?.id
    )
      firstSeatWins += 1;
  }

  return {
    raidKills,
    hunts,
    bumps,
    claims,
    boosts,
    steals,
    chainScores,
    chainPoints,
    longestChain,
    roundsWithHunt,
    rounds,
    seedsWithBump,
    seedsWithClaim,
    seedsWithDragonKill,
    firstSeatWins,
    completed,
    seeds: seedCount,
  };
}

describe('milestone 4 systems', () => {
  it('exercises hunts, raids, bumps, and objectives across many seeds', () => {
    const metrics = simulateSystems(24);

    // Every match still resolves under the action guard.
    expect(metrics.completed).toBe(metrics.seeds);

    // A live monster hunt is guaranteed to be reachable every single round.
    expect(metrics.roundsWithHunt).toBe(metrics.rounds);

    // Each system actually fires in real play rather than being dead content.
    expect(metrics.hunts).toBeGreaterThan(0);
    expect(metrics.raidKills).toBeGreaterThan(0);
    expect(metrics.seedsWithDragonKill / metrics.seeds).toBeGreaterThan(0.5);
    expect(metrics.seedsWithBump).toBe(metrics.seeds);
    expect(metrics.seedsWithClaim).toBe(metrics.seeds);

    // Themed runs pay out often enough to plan around, without dwarfing the
    // rest of the scoreboard. Roughly 4-6 points a match against ~40 totals.
    expect(metrics.chainScores).toBeGreaterThan(0);
    const chainPerMatch = metrics.chainPoints / metrics.seeds;
    expect(chainPerMatch).toBeGreaterThan(1);
    expect(chainPerMatch).toBeLessThan(10);

    // The system-facing cards get played rather than sitting dead in hand.
    expect(metrics.boosts).toBeGreaterThan(0);
    expect(metrics.steals).toBeGreaterThan(0);

    // Bumping stays a deliberate swing, not the default play.
    expect(metrics.bumps / metrics.seeds).toBeLessThan(20);

    // Identical policies on both seats should not hand either seat the match.
    expect(metrics.firstSeatWins).toBeGreaterThan(metrics.seeds * 0.2);
    expect(metrics.firstSeatWins).toBeLessThan(metrics.seeds * 0.8);
  });
});
