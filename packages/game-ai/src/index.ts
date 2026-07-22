import {
  enumerateLegalActions,
  SeededRandom,
} from '@shattered-crown/game-engine';
import type {
  GameAction,
  GameState,
  ResourceType,
} from '@shattered-crown/shared-types';

const RESOURCE_VALUES: Readonly<Record<ResourceType, number>> = {
  gold: 1.1,
  mana: 1,
  knowledge: 1,
  materials: 1.05,
  influence: 1,
};

export interface EvaluatedAction {
  readonly action: GameAction;
  readonly score: number;
}

export function evaluateCpuActions(
  state: GameState,
): readonly EvaluatedAction[] {
  const player = state.players.find(
    (item) => item.id === state.turn.activePlayerId,
  );
  if (!player || player.controller !== 'cpu') return [];

  return enumerateLegalActions(state).map((action) => {
    if (action.type === 'pass') return { action, score: -100 };
    if (action.type === 'play-card') {
      const card = state.cards.find((item) => item.id === action.cardId);
      if (!card) return { action, score: -1000 };
      const effectScore = card.effects.reduce((total, effect) => {
        if (effect.type === 'gain-resource')
          return total + effect.amount * RESOURCE_VALUES[effect.resource];
        if (effect.type === 'gain-victory-points')
          return total + effect.amount * 3;
        if (effect.type === 'draw-card') return total + effect.amount * 1.25;
        return total + 1.1;
      }, 0);
      return { action, score: effectScore + 0.35 };
    }
    if (action.type === 'acquire-card') {
      const card = state.cards.find((item) => item.id === action.cardId);
      if (!card) return { action, score: -1000 };
      const value = card.effects.reduce(
        (total, effect) => {
          if (effect.type === 'gain-victory-points')
            return total + effect.amount * 2;
          if (effect.type === 'gain-resource') return total + effect.amount;
          if (effect.type === 'draw-card') return total + effect.amount;
          return total + 0.8;
        },
        card.category === 'tactic' ? 0 : 1,
      );
      const cost = Object.entries(card.cost).reduce(
        (total, [resource, amount]) =>
          total + (amount ?? 0) * RESOURCE_VALUES[resource as ResourceType],
        0,
      );
      return { action, score: value - cost * 0.45 };
    }
    if (action.type === 'upgrade-die') {
      const upgrade = state.upgrades.find(
        (item) => item.id === action.upgradeId,
      );
      const die = player.dice.find((item) => item.id === action.dieId);
      if (!upgrade || !die) return { action, score: -1000 };
      const oldFace = die.faces[action.faceIndex];
      const improvement = upgrade.replacement.value - (oldFace?.value ?? 0);
      return {
        action,
        score:
          1.5 +
          upgrade.scoreValue * 1.2 +
          improvement * 0.35 +
          upgrade.replacement.symbols.length * 0.8,
      };
    }
    if (action.type !== 'place-die') return { action, score: -50 };
    const location = state.locations.find(
      (item) => item.id === action.locationId,
    );
    const die = player.dice.find((item) => item.id === action.dieId);
    if (!location || !die) return { action, score: -1000 };

    const resourceScore = Object.entries(location.reward).reduce(
      (total, [resource, amount]) => {
        if (resource === 'victoryPoints') return total;
        return (
          total + (amount ?? 0) * RESOURCE_VALUES[resource as ResourceType]
        );
      },
      0,
    );
    let score = resourceScore + (location.reward.victoryPoints ?? 0) * 3;
    if (location.tags.includes(die.affinity)) score += 0.75;
    if (
      player.factionAbilityId === 'arcane-resonance' &&
      location.tags.includes('arcane')
    )
      score += 1.5;
    if (
      player.factionAbilityId === 'martial-glory' &&
      location.tags.includes('martial')
    )
      score += 2;
    if (
      player.factionAbilityId === 'stonebound-craft' &&
      location.tags.includes('forge')
    )
      score += 1.5;
    if (
      player.factionAbilityId === 'verdant-adaptation' &&
      die.affinity === 'nature'
    )
      score += 0.5;
    const face =
      die.rolledFaceIndex === null
        ? 0
        : (die.faces[die.rolledFaceIndex]?.value ?? 0);
    score -= face * 0.04;
    return { action, score };
  });
}

export function chooseCpuAction(state: GameState): GameAction {
  const evaluated = evaluateCpuActions(state);
  if (evaluated.length === 0)
    throw new Error('The active player is not a CPU with legal actions.');
  const bestScore = Math.max(...evaluated.map((item) => item.score));
  const best = evaluated.filter((item) => item.score === bestScore);
  const random = new SeededRandom(
    (state.rngState ^ state.turn.turnNumber) >>> 0,
  );
  return random.pick(best).action;
}
