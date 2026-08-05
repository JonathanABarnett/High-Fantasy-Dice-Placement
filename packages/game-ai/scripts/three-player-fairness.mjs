import console from 'node:console';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

const seedsPerSeating = Math.max(
  1,
  Number.parseInt(process.argv[2] ?? '25', 10),
);
const seedOffset = Math.max(0, Number.parseInt(process.argv[3] ?? '0', 10));
const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  root: workspaceRoot,
  server: { middlewareMode: true },
});

try {
  const simulation = await server.ssrLoadModule(
    '/packages/game-ai/src/three-player-simulation.ts',
  );
  const content = await server.ssrLoadModule(
    '/packages/game-content/src/index.ts',
  );
  const seatings = simulation.orderedFactionSeatings();
  const metrics = [];
  for (const [seatingIndex, seating] of seatings.entries()) {
    for (let index = 0; index < seedsPerSeating; index += 1) {
      const seedIndex = seedOffset + index;
      metrics.push(
        simulation.simulateThreePlayerMatch(
          `three-player-${seatingIndex}-${seedIndex}`,
          seating,
        ),
      );
    }
  }

  const seats = simulation.recordsFor(metrics, (_, seat) => String(seat));
  const factionRecords = simulation.recordsFor(
    metrics,
    (metric, seat) => metric.factionIds[seat],
  );
  const groups = new Map();
  for (const metric of metrics) {
    const key = [...metric.factionIds].sort().join('|');
    groups.set(key, [...(groups.get(key) ?? []), metric]);
  }
  const groupRecords = new Map(
    [...groups].map(([group, groupMetrics]) => [
      group,
      simulation.recordsFor(
        groupMetrics,
        (metric, seat) => metric.factionIds[seat],
      ),
    ]),
  );
  const spreads = metrics
    .map((metric) => metric.scoreSpread)
    .sort((left, right) => left - right);
  const averageSpread =
    spreads.reduce((total, spread) => total + spread, 0) / spreads.length;
  const percentile95 = spreads[Math.floor(spreads.length * 0.95)] ?? 0;
  const largestSpread = metrics.reduce((largest, metric) =>
    metric.scoreSpread > largest.scoreSpread ? metric : largest,
  );
  const summarizeRecords = (records) =>
    Object.fromEntries(
      [...records].map(([key, record]) => [
        key,
        {
          averageScore: Number((record.points / record.games).toFixed(2)),
          games: record.games,
          winRate: Number((record.wins / record.games).toFixed(3)),
        },
      ]),
    );

  const difficultyOrders = simulation.permutations([
    'squire',
    'knight',
    'warlord',
  ]);
  const rotatedFactionSeatings = content.factions.map((_, index) => [
    content.factions[index % content.factions.length],
    content.factions[(index + 1) % content.factions.length],
    content.factions[(index + 2) % content.factions.length],
  ]);
  const difficultyMetrics = difficultyOrders.flatMap(
    (difficulties, orderIndex) =>
      rotatedFactionSeatings.map((seating, seatingIndex) =>
        simulation.simulateThreePlayerMatch(
          `three-player-difficulty-${orderIndex}-${seatingIndex}-${seedOffset}`,
          seating,
          difficulties,
        ),
      ),
  );
  const difficultyRecords = simulation.recordsFor(
    difficultyMetrics,
    (metric, seat) => metric.difficulties[seat],
  );

  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };
  const seatScores = simulation.averageScores(seats);
  const factionScores = simulation.averageScores(factionRecords);
  check(
    metrics.every((metric) => metric.actions < 300),
    'action guard exceeded',
  );
  check(
    metrics.every((metric) => metric.placements >= 70),
    'placement floor missed',
  );
  check(
    metrics.every((metric) => metric.forcedPasses <= 18),
    'forced-pass ceiling exceeded',
  );
  check(Math.max(...spreads) < 60, 'catastrophic score spread detected');
  check(percentile95 <= 35, '95th-percentile score spread exceeded 35');
  check(averageSpread < 25, 'average score spread exceeded 25');
  check(
    Math.max(...seatScores) - Math.min(...seatScores) < 4,
    'seat average-score spread exceeded 4',
  );
  check(
    simulation.winRates(seats).every((rate) => rate > 0.2 && rate < 0.5),
    'seat win rate left the 20%-50% fairness band',
  );
  check(
    Math.max(...factionScores) - Math.min(...factionScores) < 6,
    'faction average-score spread exceeded 6',
  );
  check(
    simulation
      .winRates(factionRecords)
      .every((rate) => rate > 0.18 && rate < 0.5),
    'faction win rate left the 18%-50% fairness band',
  );
  check(
    [...groupRecords.values()].every((records) =>
      simulation.winRates(records).every((rate) => rate > 0.1 && rate < 0.6),
    ),
    'a specific three-faction group left the 10%-60% fairness band',
  );
  const squire = difficultyRecords.get('squire');
  const warlord = difficultyRecords.get('warlord');
  check(
    warlord.points / warlord.games > squire.points / squire.games,
    'Warlord did not outscore Squire',
  );
  check(warlord.wins > squire.wins, 'Warlord did not out-win Squire');

  console.log(
    JSON.stringify(
      {
        configuration: {
          matches: metrics.length,
          seedOffset,
          seedsPerSeating,
          seatingOrders: seatings.length,
        },
        completion: {
          maximumActions: Math.max(...metrics.map((item) => item.actions)),
          maximumForcedPasses: Math.max(
            ...metrics.map((item) => item.forcedPasses),
          ),
          minimumPlacements: Math.min(
            ...metrics.map((item) => item.placements),
          ),
        },
        difficulty: summarizeRecords(difficultyRecords),
        factions: summarizeRecords(factionRecords),
        factionGroups: Object.fromEntries(
          [...groupRecords].map(([group, records]) => [
            group,
            summarizeRecords(records),
          ]),
        ),
        scoreSpread: {
          average: Number(averageSpread.toFixed(2)),
          maximum: largestSpread.scoreSpread,
          maximumFactions: largestSpread.factionIds,
          maximumScores: largestSpread.scores,
          maximumSeed: largestSpread.seed,
          percentile95,
        },
        seats: summarizeRecords(seats),
        status: failures.length === 0 ? 'pass' : 'fail',
        failures,
      },
      null,
      2,
    ),
  );
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await server.close();
}
