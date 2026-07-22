import { describe, expect, it } from 'vitest';

import type {
  BoardLocation,
  CardId,
  FactionDefinition,
  FactionId,
  LocationId,
  SlotId,
} from '@shattered-crown/shared-types';
import {
  applyAction,
  createGame,
  validateAction,
} from '@shattered-crown/game-engine';

import { chooseCpuAction, evaluateCpuActions } from './index.js';

const factions: readonly FactionDefinition[] = [
  {
    id: 'human-faction' as FactionId,
    name: 'Human',
    passiveAbilityId: 'verdant-adaptation',
    passiveAbility: 'Adapt',
    roundAbility: 'None',
    startingCardId: 'human-card' as CardId,
    scoringRule: 'Resources',
  },
  {
    id: 'cpu-faction' as FactionId,
    name: 'CPU',
    passiveAbilityId: 'martial-glory',
    passiveAbility: 'Glory',
    roundAbility: 'None',
    startingCardId: 'cpu-card' as CardId,
    scoringRule: 'Martial',
  },
];

const locations: readonly BoardLocation[] = [
  {
    id: 'quiet-place' as LocationId,
    name: 'Quiet Place',
    description: 'Minor reward',
    tags: [],
    reward: { gold: 1 },
    slots: [
      {
        id: 'quiet-slot' as SlotId,
        occupantDieId: null,
        occupantPlayerId: null,
        requirement: {},
      },
    ],
  },
  {
    id: 'great-place' as LocationId,
    name: 'Great Place',
    description: 'Major reward',
    tags: ['martial'],
    reward: { victoryPoints: 3 },
    slots: [
      {
        id: 'great-slot' as SlotId,
        occupantDieId: null,
        occupantPlayerId: null,
        requirement: {},
      },
    ],
  },
];

function cpuTurn() {
  const created = createGame({
    seed: 'ai-test',
    humanFactionId: factions[0]!.id,
    cpuFactionId: factions[1]!.id,
    content: { factions, locations },
  });
  return applyAction(created.state, {
    type: 'pass',
    playerId: created.state.turn.activePlayerId,
  }).state;
}

describe('deterministic CPU', () => {
  it('chooses deterministically from legal actions', () => {
    const state = cpuTurn();
    const first = chooseCpuAction(state);
    const second = chooseCpuAction(state);
    expect(first).toEqual(second);
    expect(validateAction(state, first).legal).toBe(true);
  });

  it('prefers the high-value martial location', () => {
    const state = cpuTurn();
    const evaluated = evaluateCpuActions(state);
    const action = chooseCpuAction(state);
    expect(evaluated.length).toBeGreaterThan(1);
    expect(action).toMatchObject({
      type: 'place-die',
      locationId: 'great-place',
    });
  });

  it('completes a six-round match using only validated CPU actions', () => {
    let state = createGame({
      seed: 'full-ai-match',
      humanFactionId: factions[0]!.id,
      cpuFactionId: factions[1]!.id,
      content: { factions, locations },
    }).state;
    let actions = 0;

    while (state.phase !== 'complete' && actions < 200) {
      const active = state.players.find(
        (player) => player.id === state.turn.activePlayerId,
      )!;
      const action =
        active.controller === 'cpu'
          ? chooseCpuAction(state)
          : ({ type: 'pass', playerId: active.id } as const);
      expect(validateAction(state, action).legal).toBe(true);
      state = applyAction(state, action).state;
      actions += 1;
    }

    expect(state.phase).toBe('complete');
    expect(state.round.number).toBe(6);
    expect(actions).toBeLessThan(200);
  });
});
