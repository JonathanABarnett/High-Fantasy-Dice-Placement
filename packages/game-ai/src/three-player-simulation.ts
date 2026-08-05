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
  scoreTotal,
  validateAction,
} from '@shattered-crown/game-engine';
import type {
  FactionDefinition,
  GameAction,
  GameState,
} from '@shattered-crown/shared-types';

import { chooseCpuAction, type CpuDifficulty } from './index.js';

export interface ThreePlayerMetrics {
  readonly actions: number;
  readonly difficulties: readonly CpuDifficulty[];
  readonly factionIds: readonly string[];
  readonly forcedPasses: number;
  readonly placements: number;
  readonly scoreSpread: number;
  readonly scores: readonly number[];
  readonly seed: string;
  readonly winnerSeats: readonly number[];
}

export interface AggregateRecord {
  games: number;
  points: number;
  wins: number;
}

export function orderedFactionSeatings(): readonly (readonly FactionDefinition[])[] {
  return factions.flatMap((first) =>
    factions.flatMap((second) =>
      first.id === second.id
        ? []
        : factions.flatMap((third) =>
            third.id === first.id || third.id === second.id
              ? []
              : [[first, second, third] as const],
          ),
    ),
  );
}

export function permutations<T>(
  values: readonly T[],
): readonly (readonly T[])[] {
  if (values.length <= 1) return [[...values]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, itemIndex) => itemIndex !== index)).map(
      (tail) => [value, ...tail],
    ),
  );
}

function chooseAutomatedAction(
  state: GameState,
  difficulties: readonly CpuDifficulty[],
): GameAction {
  const allCpu: GameState = {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      controller: 'cpu' as const,
    })),
  };
  const activeSeat = allCpu.players.findIndex(
    (player) => player.id === allCpu.turn.activePlayerId,
  );
  try {
    return chooseCpuAction(
      allCpu,
      difficulties[activeSeat] ?? difficulties[0] ?? 'knight',
    );
  } catch {
    return { type: 'pass', playerId: state.turn.activePlayerId };
  }
}

export function simulateThreePlayerMatch(
  seed: string,
  seating: readonly FactionDefinition[],
  difficulties: readonly CpuDifficulty[] = ['knight', 'knight', 'knight'],
): ThreePlayerMetrics {
  const [firstFaction, secondFaction, thirdFaction] = seating;
  if (!firstFaction || !secondFaction || !thirdFaction)
    throw new Error('A three-player simulation requires three factions.');
  let state = createGame({
    seed,
    humanFactionId: firstFaction.id,
    cpuFactionId: secondFaction.id,
    additionalCpuFactionIds: [thirdFaction.id],
    content: { factions, locations, cards, upgrades, objectives },
  }).state;
  let actions = 0;
  let forcedPasses = 0;
  let placements = 0;

  while (state.phase !== 'complete' && actions < 450) {
    const legal = enumerateLegalActions(state);
    if (legal.length === 1 && legal[0]?.type === 'pass') forcedPasses += 1;
    const action = chooseAutomatedAction(state, difficulties);
    const validation = validateAction(state, action);
    if (!validation.legal) {
      throw new Error(
        `CPU chose an illegal action in ${seed}: ${validation.message}`,
      );
    }
    if (action.type === 'place-die' || action.type === 'bump-die')
      placements += 1;
    state = applyAction(state, action).state;
    actions += 1;
  }

  if (state.phase !== 'complete')
    throw new Error(`Three-player match ${seed} exceeded its action guard.`);
  const scores = state.players.map((player) => scoreTotal(state, player.id));
  const winnerIds = new Set(state.result?.winnerIds ?? []);
  return {
    actions,
    difficulties,
    factionIds: state.players.map((player) => player.factionId as string),
    forcedPasses,
    placements,
    scoreSpread: Math.max(...scores) - Math.min(...scores),
    scores,
    seed,
    winnerSeats: state.players.flatMap((player, seat) =>
      winnerIds.has(player.id) ? [seat] : [],
    ),
  };
}

export function recordsFor(
  metrics: readonly ThreePlayerMetrics[],
  keyFor: (metric: ThreePlayerMetrics, seat: number) => string,
) {
  const records = new Map<string, AggregateRecord>();
  for (const metric of metrics) {
    for (const [seat, points] of metric.scores.entries()) {
      const key = keyFor(metric, seat);
      const record = records.get(key) ?? { games: 0, points: 0, wins: 0 };
      record.games += 1;
      record.points += points;
      if (metric.winnerSeats.includes(seat)) record.wins += 1;
      records.set(key, record);
    }
  }
  return records;
}

export function averageScores(records: ReadonlyMap<string, AggregateRecord>) {
  return [...records.values()].map((record) => record.points / record.games);
}

export function winRates(records: ReadonlyMap<string, AggregateRecord>) {
  return [...records.values()].map((record) => record.wins / record.games);
}
