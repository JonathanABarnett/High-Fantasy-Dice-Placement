import { describe, expect, it } from 'vitest';

import { factions } from '@shattered-crown/game-content';

import type { CpuDifficulty } from './index.js';
import {
  averageScores,
  orderedFactionSeatings,
  permutations,
  recordsFor,
  simulateThreePlayerMatch,
  type ThreePlayerMetrics,
  winRates,
} from './three-player-simulation.js';

const SEEDS_PER_SEATING = 3;

describe.sequential('three-player balance', () => {
  const seatings = orderedFactionSeatings();
  const metrics: ThreePlayerMetrics[] = [];

  for (const [seatingIndex, seating] of seatings.entries()) {
    it(`simulates seating ${seating.map((faction) => faction.name).join(' / ')}`, () => {
      for (let seedIndex = 0; seedIndex < SEEDS_PER_SEATING; seedIndex += 1) {
        metrics.push(
          simulateThreePlayerMatch(
            `three-player-${seatingIndex}-${seedIndex}`,
            seating,
          ),
        );
      }
    });
  }

  it('covers every faction group and seating without a dominant faction or seat', () => {
    expect(seatings).toHaveLength(24);
    expect(metrics).toHaveLength(seatings.length * SEEDS_PER_SEATING);
    expect(metrics.every((item) => item.actions < 300)).toBe(true);
    expect(metrics.every((item) => item.placements >= 70)).toBe(true);
    expect(metrics.every((item) => item.forcedPasses <= 18)).toBe(true);

    const spreads = metrics
      .map((metric) => metric.scoreSpread)
      .sort((left, right) => left - right);
    const averageSpread =
      spreads.reduce((total, spread) => total + spread, 0) / spreads.length;
    expect(Math.max(...spreads)).toBeLessThan(60);
    expect(spreads[Math.floor(spreads.length * 0.95)]).toBeLessThanOrEqual(35);
    expect(averageSpread).toBeLessThan(25);

    const seats = recordsFor(metrics, (_, seat) => String(seat));
    const seatScores = averageScores(seats);
    expect(Math.max(...seatScores) - Math.min(...seatScores)).toBeLessThan(4);
    for (const winRate of winRates(seats)) {
      expect(winRate).toBeGreaterThan(0.2);
      expect(winRate).toBeLessThan(0.5);
    }

    const factionRecords = recordsFor(
      metrics,
      (metric, seat) => metric.factionIds[seat]!,
    );
    expect(factionRecords).toHaveLength(factions.length);
    const factionScores = averageScores(factionRecords);
    // The fast 72-match sample is intentionally noisier than the standalone
    // 600-match audit, which enforces the tighter six-point band.
    expect(
      Math.max(...factionScores) - Math.min(...factionScores),
    ).toBeLessThan(8);
    for (const winRate of winRates(factionRecords)) {
      expect(winRate).toBeGreaterThan(0.18);
      expect(winRate).toBeLessThanOrEqual(0.55);
    }

    // Every faction occupies every seat against every possible pair of
    // rivals. This catches a faction that only struggles from one position.
    const factionSeats = recordsFor(
      metrics,
      (metric, seat) => `${metric.factionIds[seat]}:${seat}`,
    );
    expect(factionSeats).toHaveLength(factions.length * 3);
    for (const faction of factions) {
      const scores = [0, 1, 2].map((seat) => {
        const record = factionSeats.get(`${faction.id as string}:${seat}`)!;
        return record.points / record.games;
      });
      expect(
        Math.max(...scores) - Math.min(...scores),
        `${faction.name} score spread by seat`,
      ).toBeLessThan(8);
    }

    // Each unordered group of three receives all six seating orders.
    const groups = new Map<string, ThreePlayerMetrics[]>();
    for (const metric of metrics) {
      const key = [...metric.factionIds].sort().join('|');
      groups.set(key, [...(groups.get(key) ?? []), metric]);
    }
    expect(groups).toHaveLength(4);
    for (const [group, groupMetrics] of groups) {
      const groupFactions = recordsFor(
        groupMetrics,
        (metric, seat) => metric.factionIds[seat]!,
      );
      for (const winRate of winRates(groupFactions)) {
        // Only 18 observations per faction live in the fast suite. The
        // standalone audit applies the meaningful 10%-60% band to 150.
        expect(winRate, `${group} matchup win rate`).toBeGreaterThan(0);
        expect(winRate, `${group} matchup win rate`).toBeLessThan(0.8);
      }
    }
  });

  it('keeps three-player difficulty strength meaningful across every seat', () => {
    const difficultyOrders = permutations<CpuDifficulty>([
      'squire',
      'knight',
      'warlord',
    ]);
    expect(difficultyOrders).toHaveLength(6);
    const rotatedFactionSeatings = factions.map((_, index) => [
      factions[index % factions.length]!,
      factions[(index + 1) % factions.length]!,
      factions[(index + 2) % factions.length]!,
    ]);
    const difficultyMetrics = difficultyOrders.flatMap(
      (difficulties, orderIndex) =>
        rotatedFactionSeatings.map((seating, seatingIndex) =>
          simulateThreePlayerMatch(
            `three-player-difficulty-${orderIndex}-${seatingIndex}`,
            seating,
            difficulties,
          ),
        ),
    );
    const difficultyRecords = recordsFor(
      difficultyMetrics,
      (metric, seat) => metric.difficulties[seat]!,
    );
    const squire = difficultyRecords.get('squire')!;
    const knight = difficultyRecords.get('knight')!;
    const warlord = difficultyRecords.get('warlord')!;
    expect(squire.games).toBe(knight.games);
    expect(knight.games).toBe(warlord.games);
    expect(warlord.points / warlord.games).toBeGreaterThan(
      squire.points / squire.games,
    );
    expect(warlord.wins).toBeGreaterThan(squire.wins);
    expect(difficultyMetrics.every((item) => item.actions < 300)).toBe(true);
  }, 20_000);
});
