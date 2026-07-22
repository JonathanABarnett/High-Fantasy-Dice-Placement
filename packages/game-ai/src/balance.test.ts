import { describe, expect, it } from 'vitest';

import {
  cards,
  factions,
  locations,
  upgrades,
} from '@shattered-crown/game-content';
import {
  applyAction,
  createGame,
  enumerateLegalActions,
  validateAction,
} from '@shattered-crown/game-engine';
import type {
  GameAction,
  GameState,
  PlayerId,
} from '@shattered-crown/shared-types';

import { chooseCpuAction } from './index.js';

interface BalanceMetrics {
  readonly seed: string;
  readonly actions: number;
  readonly placements: number;
  readonly forcedPasses: number;
  readonly lowDiceWithRoute: number;
  readonly lowDiceChecked: number;
  readonly winnerCount: number;
}

function placementValue(state: GameState, action: GameAction): number {
  if (action.type !== 'place-die') return -Infinity;
  const location = state.locations.find(
    (item) => item.id === action.locationId,
  );
  if (!location) return -Infinity;
  const resourceValue = Object.values(location.reward).reduce(
    (total, amount) => total + (amount ?? 0),
    0,
  );
  return resourceValue + (location.reward.victoryPoints ?? 0) * 2;
}

function chooseAutoplayAction(state: GameState): GameAction {
  const active = state.players.find(
    (player) => player.id === state.turn.activePlayerId,
  );
  if (active?.controller === 'cpu') return chooseCpuAction(state);

  const legal = enumerateLegalActions(state);
  const nonPass = legal.filter((action) => action.type !== 'pass');
  const placements = nonPass
    .filter((action) => action.type === 'place-die')
    .sort(
      (left, right) =>
        placementValue(state, right) - placementValue(state, left),
    );
  return (
    placements[0] ??
    nonPass.find((action) => action.type === 'play-card') ??
    nonPass.find((action) => action.type === 'upgrade-die') ??
    nonPass.find((action) => action.type === 'acquire-card') ??
    ({ type: 'pass', playerId: state.turn.activePlayerId } as const)
  );
}

function countLowDiceRoutes(state: GameState) {
  let lowDiceChecked = 0;
  let lowDiceWithRoute = 0;

  for (const player of state.players) {
    const turnState = {
      ...state,
      turn: { ...state.turn, activePlayerId: player.id as PlayerId },
      players: state.players.map((item) =>
        item.id === player.id ? { ...item, hasPassed: false } : item,
      ),
    };
    const placementActions = enumerateLegalActions(turnState).filter(
      (action) => action.type === 'place-die',
    );

    for (const die of player.dice) {
      const face =
        die.rolledFaceIndex === null ? null : die.faces[die.rolledFaceIndex];
      if (!face || face.value > 2) continue;
      lowDiceChecked += 1;
      if (
        placementActions.some(
          (action) => action.type === 'place-die' && action.dieId === die.id,
        )
      )
        lowDiceWithRoute += 1;
    }
  }

  return { lowDiceChecked, lowDiceWithRoute };
}

function simulate(seed: string): BalanceMetrics {
  let state = createGame({
    seed,
    humanFactionId: factions[0]!.id,
    cpuFactionId: factions[1]!.id,
    content: { factions, locations, cards, upgrades },
  }).state;
  let actions = 0;
  let placements = 0;
  let forcedPasses = 0;
  let lowDiceChecked = 0;
  let lowDiceWithRoute = 0;
  let observedRound = 0;

  while (state.phase !== 'complete' && actions < 300) {
    if (state.round.number !== observedRound) {
      observedRound = state.round.number;
      const lowRollRoutes = countLowDiceRoutes(state);
      lowDiceChecked += lowRollRoutes.lowDiceChecked;
      lowDiceWithRoute += lowRollRoutes.lowDiceWithRoute;
    }

    const legal = enumerateLegalActions(state);
    if (legal.length === 1 && legal[0]?.type === 'pass') forcedPasses += 1;
    const action = chooseAutoplayAction(state);
    expect(validateAction(state, action).legal).toBe(true);
    if (action.type === 'place-die') placements += 1;
    state = applyAction(state, action).state;
    actions += 1;
  }

  expect(state.phase).toBe('complete');
  return {
    seed,
    actions,
    placements,
    forcedPasses,
    lowDiceChecked,
    lowDiceWithRoute,
    winnerCount: state.result?.winnerIds.length ?? 0,
  };
}

describe('balance simulations', () => {
  it('keeps tightened two-player matches playable across many seeds', () => {
    const metrics = Array.from({ length: 24 }, (_, index) =>
      simulate(`balance-${index + 1}`),
    );

    expect(metrics.every((item) => item.actions < 300)).toBe(true);
    expect(metrics.every((item) => item.winnerCount > 0)).toBe(true);
    expect(metrics.every((item) => item.placements >= 44)).toBe(true);
    expect(metrics.every((item) => item.forcedPasses <= 12)).toBe(true);

    const lowDiceChecked = metrics.reduce(
      (total, item) => total + item.lowDiceChecked,
      0,
    );
    const lowDiceWithRoute = metrics.reduce(
      (total, item) => total + item.lowDiceWithRoute,
      0,
    );
    expect(lowDiceChecked).toBeGreaterThan(0);
    expect(lowDiceWithRoute / lowDiceChecked).toBeGreaterThanOrEqual(0.9);
  });
});
