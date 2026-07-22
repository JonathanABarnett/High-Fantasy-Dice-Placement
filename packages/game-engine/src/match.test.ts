import { describe, expect, it } from 'vitest';

import type {
  BoardLocation,
  Card,
  CardId,
  FactionDefinition,
  FactionId,
  GameAction,
  LocationId,
  PlayerId,
  SlotId,
  UpgradeDefinition,
  UpgradeId,
} from '@shattered-crown/shared-types';

import {
  applyAction,
  createGame,
  deserializeGame,
  enumerateLegalActions,
  serializeGame,
  validateAction,
} from './match.js';

const factions: readonly FactionDefinition[] = [
  {
    id: 'test-arcanum' as FactionId,
    name: 'Test Arcanum',
    passiveAbilityId: 'arcane-resonance',
    passiveAbility: 'Arcane bonus',
    roundAbility: 'None',
    startingCardId: 'card-a' as CardId,
    scoringRule: 'Mana',
  },
  {
    id: 'test-stonebound' as FactionId,
    name: 'Test Stonebound',
    passiveAbilityId: 'stonebound-craft',
    passiveAbility: 'Forge bonus',
    roundAbility: 'None',
    startingCardId: 'card-b' as CardId,
    scoringRule: 'Materials',
  },
];

const locations: readonly BoardLocation[] = [
  {
    id: 'open-field' as LocationId,
    name: 'Open Field',
    description: 'Always open.',
    tags: ['nature'],
    reward: { gold: 2 },
    slots: [
      {
        id: 'open-slot' as SlotId,
        occupantDieId: null,
        occupantPlayerId: null,
        requirement: {},
      },
    ],
  },
  {
    id: 'arcane-vault' as LocationId,
    name: 'Arcane Vault',
    description: 'Restricted and costly.',
    tags: ['arcane'],
    reward: { mana: 2, victoryPoints: 1 },
    slots: [
      {
        id: 'vault-slot' as SlotId,
        occupantDieId: null,
        occupantPlayerId: null,
        requirement: {
          minimumValue: 4,
          affinities: ['arcane'],
          cost: { gold: 1 },
        },
      },
    ],
  },
  {
    id: 'test-forge' as LocationId,
    name: 'Test Forge',
    description: 'Unlocks die upgrades.',
    tags: ['craft', 'forge'],
    reward: { materials: 2 },
    slots: [
      {
        id: 'forge-slot' as SlotId,
        occupantDieId: null,
        occupantPlayerId: null,
        requirement: {},
      },
    ],
  },
];

const cards: readonly Card[] = [
  {
    id: 'card-a' as CardId,
    name: 'Test Revelation',
    category: 'tactic',
    cost: {},
    effects: [
      { type: 'gain-resource', resource: 'mana', amount: 2 },
      { type: 'draw-card', amount: 1 },
    ],
    rulesText: 'Gain mana and draw.',
    target: 'none',
    marketCopies: 0,
  },
  {
    id: 'card-b' as CardId,
    name: 'Test Glory',
    category: 'tactic',
    cost: {},
    effects: [{ type: 'gain-victory-points', amount: 1 }],
    rulesText: 'Gain a point.',
    target: 'none',
    marketCopies: 0,
  },
  {
    id: 'market-card' as CardId,
    name: 'Test Market Card',
    category: 'ally',
    cost: { gold: 1 },
    effects: [{ type: 'gain-resource', resource: 'knowledge', amount: 1 }],
    rulesText: 'Gain knowledge.',
    target: 'none',
    marketCopies: 4,
  },
];

const upgrades: readonly UpgradeDefinition[] = [
  {
    id: 'test-tempered' as UpgradeId,
    name: 'Test Tempering',
    description: 'Replace a face and add a material symbol.',
    cost: { materials: 1 },
    replacement: { value: 4, symbols: ['materials'] },
    scoreValue: 2,
  },
];

function game(maximumRounds = 6) {
  return createGame({
    seed: 'match-test',
    humanFactionId: factions[0]!.id,
    cpuFactionId: factions[1]!.id,
    content: { factions, locations, cards, upgrades },
    maximumRounds,
  }).state;
}

function scarcityGame() {
  const scarcityLocations = Array.from(
    { length: 12 },
    (_, index) =>
      ({
        id: `scarcity-${index}` as LocationId,
        name: `Scarcity ${index}`,
        description: 'A contested test region.',
        tags: ['nature'],
        reward: { gold: 1 },
        slots: [
          {
            id: `scarcity-${index}-a` as SlotId,
            occupantDieId: null,
            occupantPlayerId: null,
            requirement: {},
          },
          {
            id: `scarcity-${index}-b` as SlotId,
            occupantDieId: null,
            occupantPlayerId: null,
            requirement: {},
          },
        ],
      }) satisfies BoardLocation,
  );
  return createGame({
    seed: 'scarcity-test',
    humanFactionId: factions[0]!.id,
    cpuFactionId: factions[1]!.id,
    content: { factions, locations: scarcityLocations, cards, upgrades },
  }).state;
}

function openSlots(state: ReturnType<typeof scarcityGame>) {
  return state.locations.flatMap((location) =>
    location.slots.filter((slot) => slot.isOpen !== false),
  );
}

describe('headless match', () => {
  it('creates repeatable setup and rolls from a seed', () => {
    expect(game()).toEqual(game());
    expect(game().players).toHaveLength(2);
    expect(game().players[0]?.dice).toHaveLength(5);
  });

  it('opens a tight two-player board while preserving low-roll routes', () => {
    const state = scarcityGame();
    const active = state.locations.filter((location) => location.isActive);
    const playableSlots = openSlots(state);
    expect(active).toHaveLength(6);
    expect(playableSlots).toHaveLength(8);
    expect(
      playableSlots.filter(
        (slot) =>
          (slot.requirement.minimumValue ?? 1) <= 2 &&
          !slot.requirement.affinities?.length &&
          Object.keys(slot.requirement.cost ?? {}).length === 0,
      ).length,
    ).toBeGreaterThanOrEqual(3);

    const human = state.players[0]!;
    const sealedLocation = state.locations.find(
      (location) => !location.isActive,
    )!;
    expect(
      validateAction(state, {
        type: 'place-die',
        playerId: human.id,
        dieId: human.dice[0]!.id,
        locationId: sealedLocation.id,
        slotId: sealedLocation.slots[0]!.id,
      }),
    ).toMatchObject({ legal: false, code: 'location-inactive' });

    const scarceLocation = active.find((location) =>
      location.slots.some((slot) => slot.isOpen === false),
    )!;
    const sealedSlot = scarceLocation.slots.find(
      (slot) => slot.isOpen === false,
    )!;
    expect(
      validateAction(state, {
        type: 'place-die',
        playerId: human.id,
        dieId: human.dice[0]!.id,
        locationId: scarceLocation.id,
        slotId: sealedSlot.id,
      }),
    ).toMatchObject({ legal: false, code: 'slot-unavailable' });
  });

  it('scales scarce slots upward for larger player counts', () => {
    const state = createGame({
      seed: 'scarcity-four-player-test',
      humanFactionId: factions[0]!.id,
      cpuFactionId: factions[1]!.id,
      additionalCpuFactionIds: [factions[0]!.id, factions[1]!.id],
      content: {
        factions,
        locations: Array.from(
          { length: 16 },
          (_, index) =>
            ({
              id: `four-player-${index}` as LocationId,
              name: `Four Player ${index}`,
              description: 'A contested test region.',
              tags: ['nature'],
              reward: { gold: 1 },
              slots: [
                {
                  id: `four-player-${index}-a` as SlotId,
                  occupantDieId: null,
                  occupantPlayerId: null,
                  requirement: {},
                },
                {
                  id: `four-player-${index}-b` as SlotId,
                  occupantDieId: null,
                  occupantPlayerId: null,
                  requirement: { minimumValue: 3 },
                },
              ],
            }) satisfies BoardLocation,
        ),
        cards,
        upgrades,
      },
    }).state;

    expect(state.players).toHaveLength(4);
    expect(
      state.locations.filter((location) => location.isActive),
    ).toHaveLength(11);
    expect(openSlots(state)).toHaveLength(15);
  });

  it('enumerates only actions accepted by the validator', () => {
    const state = game();
    const actions = enumerateLegalActions(state);
    expect(actions.length).toBeGreaterThan(1);
    expect(actions.every((action) => validateAction(state, action).legal)).toBe(
      true,
    );
  });

  it('rejects wrong turns, unavailable dice, restrictions, and occupied slots', () => {
    const state = game();
    const human = state.players[0]!;
    const cpu = state.players[1]!;
    expect(
      validateAction(state, { type: 'pass', playerId: cpu.id }),
    ).toMatchObject({
      legal: false,
      code: 'not-active-player',
    });

    const neutral = human.dice.find((die) => die.affinity === 'neutral')!;
    const restricted: GameAction = {
      type: 'place-die',
      playerId: human.id,
      dieId: neutral.id,
      locationId: locations[1]!.id,
      slotId: locations[1]!.slots[0]!.id,
    };
    expect(validateAction(state, restricted)).toMatchObject({
      legal: false,
      code: 'requirement-not-met',
    });

    const legal = enumerateLegalActions(state).find(
      (action) => action.type === 'place-die',
    )!;
    const after = applyAction(state, legal).state;
    const sameDie = {
      ...legal,
      playerId: after.turn.activePlayerId,
    } as GameAction;
    expect(validateAction(after, sameDie).legal).toBe(false);
    if (legal.type === 'place-die') {
      const cpuDie = after.players.find(
        (player) => player.id === after.turn.activePlayerId,
      )!.dice[0]!;
      expect(
        validateAction(after, {
          ...legal,
          playerId: after.turn.activePlayerId,
          dieId: cpuDie.id,
        }),
      ).toMatchObject({ legal: false, code: 'slot-occupied' });
    }
  });

  it('pays costs, grants rewards, and emits ordered events', () => {
    let state = game();
    const human = state.players[0]!;
    const arcane = human.dice.find((die) => die.affinity === 'arcane')!;
    state = {
      ...state,
      players: state.players.map((player) =>
        player.id === human.id
          ? {
              ...player,
              dice: player.dice.map((die) =>
                die.id === arcane.id ? { ...die, rolledFaceIndex: 5 } : die,
              ),
            }
          : player,
      ),
    };
    const result = applyAction(state, {
      type: 'place-die',
      playerId: human.id,
      dieId: arcane.id,
      locationId: locations[1]!.id,
      slotId: locations[1]!.slots[0]!.id,
    });
    const updated = result.state.players.find(
      (player) => player.id === human.id,
    )!;
    expect(updated.resources.gold).toBe(1);
    expect(updated.resources.mana).toBe(4);
    expect(updated.victoryPoints).toBe(1);
    expect(result.events.map((event) => event.sequence)).toEqual(
      [...result.events.map((event) => event.sequence)].sort((a, b) => a - b),
    );
  });

  it('plays typed effects and replenishes acquired market cards', () => {
    const state = game();
    const human = state.players[0]!;
    const played = applyAction(state, {
      type: 'play-card',
      playerId: human.id,
      cardId: cards[0]!.id,
    });
    const afterPlay = played.state.players[0]!;
    expect(afterPlay.resources.mana).toBe(3);
    expect(afterPlay.hand).toContain(cards[2]!.id);
    expect(afterPlay.playedCards).toContain(cards[0]!.id);
    expect(played.events.map((event) => event.type)).toContain('card-played');

    const marketState = {
      ...state,
      turn: { ...state.turn, activePlayerId: human.id },
    };
    const acquired = applyAction(marketState, {
      type: 'acquire-card',
      playerId: human.id,
      cardId: state.cardMarket[0]!,
    }).state;
    expect(acquired.players[0]!.resources.gold).toBe(1);
    expect(acquired.players[0]!.hand).toContain(cards[2]!.id);
    expect(acquired.cardMarket).toHaveLength(3);
    expect(acquired.cardDeck).toHaveLength(state.cardDeck.length - 1);
  });

  it('requires Forge control and permanently replaces a die face', () => {
    const state = game();
    const human = state.players[0]!;
    const die = human.dice[0]!;
    const upgradeAction: GameAction = {
      type: 'upgrade-die',
      playerId: human.id,
      dieId: die.id,
      faceIndex: 0,
      upgradeId: upgrades[0]!.id,
    };
    expect(validateAction(state, upgradeAction)).toMatchObject({
      legal: false,
      code: 'forge-required',
    });

    const atForge = applyAction(state, {
      type: 'place-die',
      playerId: human.id,
      dieId: die.id,
      locationId: locations[2]!.id,
      slotId: locations[2]!.slots[0]!.id,
    }).state;
    const humanTurn = {
      ...atForge,
      turn: { ...atForge.turn, activePlayerId: human.id },
    };
    const forged = applyAction(humanTurn, upgradeAction);
    const forgedDie = forged.state.players[0]!.dice[0]!;
    expect(forgedDie.faces[0]).toEqual(upgrades[0]!.replacement);
    expect(forgedDie.enhancements).toContain(upgrades[0]!.id);
    expect(forged.events).toContainEqual(
      expect.objectContaining({ type: 'die-upgraded' }),
    );
  });

  it('advances after both players pass and completes after the final round', () => {
    let state = game(2);
    while (state.phase !== 'complete') {
      const action: GameAction = {
        type: 'pass',
        playerId: state.turn.activePlayerId,
      };
      state = applyAction(state, action).state;
    }
    expect(state.round.number).toBe(2);
    expect(state.result).not.toBeNull();
    expect(state.result?.winnerIds.length).toBeGreaterThan(0);
  });

  it('round-trips saves and rejects invalid schemas', () => {
    const state = game();
    expect(deserializeGame(serializeGame(state))).toEqual(state);
    expect(() => deserializeGame('{"schemaVersion":99}')).toThrow(
      'unsupported or invalid schema',
    );
  });

  it('rejects actions from a player after passing', () => {
    const state = game();
    const first = state.turn.activePlayerId;
    const afterPass = applyAction(state, {
      type: 'pass',
      playerId: first,
    }).state;
    const forcedTurn = {
      ...afterPass,
      turn: { ...afterPass.turn, activePlayerId: first as PlayerId },
    };
    expect(
      validateAction(forcedTurn, { type: 'pass', playerId: first }),
    ).toMatchObject({
      legal: false,
      code: 'already-passed',
    });
  });
});
