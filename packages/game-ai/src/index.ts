import {
  applyAction,
  dieValue,
  enumerateLegalActions,
  raidDamageFor,
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

/**
 * Victory points this action would immediately claim from shared objectives.
 * Resolved by asking the engine to apply the action, so the CPU's view of a
 * claim can never drift from the real rules.
 */
function objectiveClaimValue(state: GameState, action: GameAction): number {
  if (state.objectives.every((objective) => objective.claimedBy !== null))
    return 0;
  try {
    return applyAction(state, action).events.reduce(
      (total, event) =>
        event.type === 'objective-claimed' && event.playerId === action.playerId
          ? total + event.victoryPoints
          : total,
      0,
    );
  } catch {
    return 0;
  }
}

export function evaluateCpuActions(
  state: GameState,
): readonly EvaluatedAction[] {
  const player = state.players.find(
    (item) => item.id === state.turn.activePlayerId,
  );
  if (!player || player.controller !== 'cpu') return [];

  const scoreAction = (action: GameAction): EvaluatedAction => {
    if (action.type === 'pass') return { action, score: -100 };
    if (action.type === 'play-card') {
      const card = state.cards.find((item) => item.id === action.cardId);
      if (!card) return { action, score: -1000 };
      const effectScore = card.effects.reduce((total, effect) => {
        if (effect.type === 'gain-resource')
          return total + effect.amount * RESOURCE_VALUES[effect.resource];
        if (effect.type === 'gain-victory-points')
          return total + effect.amount * 3;
        if (effect.type === 'gain-victory-points-per-monster') {
          const amount = Math.min(
            effect.maxAmount ?? Number.POSITIVE_INFINITY,
            player.monstersSlain * effect.amountPerMonster,
          );
          return total + amount * 3;
        }
        if (effect.type === 'gain-victory-points-per-upgrade') {
          const upgradesForged = player.dice.reduce(
            (sum, die) => sum + die.enhancements.length,
            0,
          );
          const amount = Math.min(
            effect.maxAmount ?? Number.POSITIVE_INFINITY,
            upgradesForged * effect.amountPerUpgrade,
          );
          return total + amount * 3;
        }
        if (effect.type === 'gain-resource-per-tag-placement') {
          const amount = Math.min(
            effect.maxAmount ?? Number.POSITIVE_INFINITY,
            (player.placementCounts[effect.tag] ?? 0) *
              effect.amountPerPlacement,
          );
          return total + amount * RESOURCE_VALUES[effect.resource];
        }
        if (effect.type === 'draw-card') return total + effect.amount * 1.25;
        if (effect.type === 'steal-resource') {
          // Taking is worth roughly double gaining: it swings both scores.
          const available = state.players.reduce(
            (sum, rival) =>
              rival.id === action.playerId
                ? sum
                : sum +
                  Math.min(effect.amount, rival.resources[effect.resource]),
            0,
          );
          return total + available * RESOURCE_VALUES[effect.resource] * 2;
        }
        if (effect.type === 'damage-raid') {
          const raid = state.locations.find(
            (item) =>
              item.encounter?.health !== undefined &&
              (state.raidDamage[item.id] ?? 0) < item.encounter.health,
          );
          // Worthless once the beast is dead, valuable while the race is on.
          return total + (raid ? effect.amount * 0.5 : 0);
        }
        if (effect.type === 'boost-die') {
          const target = player.dice.find(
            (item) => item.id === action.targetDieId,
          );
          // A boost that reaches a critical strike is worth far more than one
          // that just nudges a die up a point.
          const reachesCrit =
            target &&
            dieValue(target) < 6 &&
            dieValue(target) + effect.amount >= 6;
          return total + effect.amount * 0.7 + (reachesCrit ? 2.5 : 0);
        }
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
          if (effect.type === 'gain-victory-points-per-monster')
            return total + effect.amountPerMonster * 1.6;
          if (effect.type === 'gain-victory-points-per-upgrade')
            return total + effect.amountPerUpgrade * 1.5;
          if (effect.type === 'gain-resource-per-tag-placement')
            return total + effect.amountPerPlacement * 1.2;
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
    if (action.type !== 'place-die' && action.type !== 'bump-die')
      return { action, score: -50 };
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
    const rolledFace =
      die.rolledFaceIndex === null ? null : die.faces[die.rolledFaceIndex];
    // Use the die's effective value so card boosts are priced correctly.
    const faceValue = dieValue(die);
    const critical =
      faceValue >= 6 || (rolledFace?.symbols.includes('masterwork') ?? false);
    // Combat rewards hitting hard, so a high die is an asset here rather than
    // something to conserve. Value overkill loot, critical strikes, and above
    // all the killing blow on a raid boss, which carries the whole bounty.
    if (location.encounter) {
      const encounter = location.encounter;
      const slot = location.slots.find((item) => item.id === action.slotId);
      if (encounter.health !== undefined) {
        const already = state.raidDamage[location.id] ?? 0;
        const remaining = encounter.health - already;
        if (remaining > 0) {
          const damage = raidDamageFor(player, die);
          if (damage >= remaining) {
            const bountyLoot = Object.entries(encounter.bounty?.loot ?? {});
            score +=
              (encounter.bounty?.victoryPoints ?? 0) * 3 +
              bountyLoot.reduce(
                (total, [resource, amount]) =>
                  total +
                  (amount ?? 0) * RESOURCE_VALUES[resource as ResourceType],
                0,
              );
          } else {
            // Chip damage still matters: it races the rival to the finisher.
            score += damage * 0.45;
          }
        }
      } else {
        const threat = slot?.requirement.minimumValue ?? 1;
        score +=
          Math.max(0, faceValue - threat) * RESOURCE_VALUES[encounter.loot];
        if (critical) score += encounter.criticalBonus * 3;
      }
    }
    // Bumping denies a rival a held slot, but it costs influence, spends a
    // strong die, and hands the victim their die back. Price it as a deliberate
    // swing rather than a default play, so it stays a memorable moment.
    if (action.type === 'bump-die') {
      score -= 1.6 + RESOURCE_VALUES.influence;
    }
    score -= faceValue * 0.04;
    return { action, score };
  };

  return enumerateLegalActions(state).map((action) => {
    const evaluated = scoreAction(action);
    // Claiming a shared objective is worth racing for on top of the action's
    // own merits, so a quest can tip which otherwise-similar play wins.
    const claim = objectiveClaimValue(state, action);
    return claim > 0
      ? { action, score: evaluated.score + claim * 3 }
      : evaluated;
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
