import { describe, expect, it } from 'vitest';

import type {
  BoardLocation,
  Card,
  CardId,
  FactionDefinition,
  FactionId,
  GameAction,
  LocationId,
  ObjectiveId,
  PlayerId,
  SlotId,
  UpgradeDefinition,
  UpgradeId,
} from '@shattered-crown/shared-types';

import {
  applyAction,
  createGame,
  deserializeGame,
  dieValue,
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
    // 1 starting + 2 location reward + 2 Arcanum resonance for an Arcane die.
    expect(updated.resources.mana).toBe(5);
    expect(updated.victoryPoints).toBe(1);
    expect(result.events.map((event) => event.sequence)).toEqual(
      [...result.events.map((event) => event.sequence)].sort((a, b) => a - b),
    );
  });

  it('slays monsters with scaled overkill loot and critical strikes', () => {
    const huntLocations: readonly BoardLocation[] = [
      {
        id: 'dragon-lair' as LocationId,
        name: 'Dragon Lair',
        description: 'Beasts guard the pass.',
        tags: ['martial', 'combat'],
        reward: { victoryPoints: 1 },
        encounter: {
          title: 'Dragon Lair',
          beasts: ['Wyvern', 'Elder Dragon'],
          loot: 'gold',
          criticalBonus: 3,
        },
        slots: [
          {
            id: 'lair-1' as SlotId,
            occupantDieId: null,
            occupantPlayerId: null,
            requirement: { minimumValue: 4 },
          },
          {
            id: 'lair-2' as SlotId,
            occupantDieId: null,
            occupantPlayerId: null,
            requirement: { minimumValue: 6 },
          },
        ],
      },
      {
        id: 'meadow' as LocationId,
        name: 'Meadow',
        description: 'A calm field keeps low rolls useful.',
        tags: ['nature'],
        reward: { gold: 1 },
        slots: [
          {
            id: 'meadow-1' as SlotId,
            occupantDieId: null,
            occupantPlayerId: null,
            requirement: {},
          },
          {
            id: 'meadow-2' as SlotId,
            occupantDieId: null,
            occupantPlayerId: null,
            requirement: {},
          },
        ],
      },
    ];

    const hunt = (faceIndex: number, slotId: string) => {
      const base = createGame({
        seed: 'monster-hunt',
        humanFactionId: factions[0]!.id,
        cpuFactionId: factions[1]!.id,
        content: { factions, locations: huntLocations, cards, upgrades },
      }).state;
      const human = base.players[0]!;
      const attacker = human.dice[0]!;
      const state = {
        ...base,
        players: base.players.map((player) =>
          player.id === human.id
            ? {
                ...player,
                dice: player.dice.map((die) =>
                  die.id === attacker.id
                    ? { ...die, rolledFaceIndex: faceIndex }
                    : die,
                ),
              }
            : player,
        ),
      };
      return applyAction(state, {
        type: 'place-die',
        playerId: human.id,
        dieId: attacker.id,
        locationId: 'dragon-lair' as LocationId,
        slotId: slotId as SlotId,
      });
    };

    // Value 6 into the threat-4 Wyvern: overkill 2 loots +2 gold, and the
    // natural six lands a critical strike for +3 victory points.
    const crit = hunt(5, 'lair-1');
    const critPlayer = crit.state.players.find(
      (player) => player.id === ('player-human' as PlayerId),
    )!;
    expect(critPlayer.resources.gold).toBe(2 + 2);
    expect(critPlayer.victoryPoints).toBe(1 + 3);
    expect(crit.events).toContainEqual(
      expect.objectContaining({
        type: 'monster-slain',
        beast: 'Wyvern',
        overkill: 2,
        critical: true,
      }),
    );

    // Value 5 into the threat-4 Wyvern: overkill 1 loots +1 gold with no crit.
    const grind = hunt(4, 'lair-1');
    const grindPlayer = grind.state.players.find(
      (player) => player.id === ('player-human' as PlayerId),
    )!;
    expect(grindPlayer.resources.gold).toBe(2 + 1);
    expect(grindPlayer.victoryPoints).toBe(1);
    expect(grind.events).toContainEqual(
      expect.objectContaining({
        type: 'monster-slain',
        beast: 'Wyvern',
        overkill: 1,
        critical: false,
      }),
    );
  });

  it('wounds a raid boss across turns and pays the killing blow', () => {
    const raidLocations: readonly BoardLocation[] = [
      {
        id: 'raid-pass' as LocationId,
        name: 'Raid Pass',
        description: 'A persistent boss.',
        tags: ['martial', 'combat'],
        reward: { influence: 1 },
        encounter: {
          title: 'Raid Pass',
          beasts: ['Elder Dragon'],
          loot: 'gold',
          criticalBonus: 0,
          health: 10,
          bounty: { victoryPoints: 6, loot: { gold: 3 } },
        },
        slots: [
          {
            id: 'raid-a' as SlotId,
            occupantDieId: null,
            occupantPlayerId: null,
            requirement: {},
          },
          {
            id: 'raid-b' as SlotId,
            occupantDieId: null,
            occupantPlayerId: null,
            requirement: {},
          },
        ],
      },
    ];
    const start = createGame({
      seed: 'raid-test',
      humanFactionId: factions[0]!.id,
      cpuFactionId: factions[1]!.id,
      content: { factions, locations: raidLocations, cards, upgrades },
    }).state;
    const human = start.players[0]!;

    const withFace = (
      state: typeof start,
      dieIndex: number,
      faceIndex: number,
    ) => ({
      ...state,
      turn: { ...state.turn, activePlayerId: human.id },
      players: state.players.map((player) =>
        player.id === human.id
          ? {
              ...player,
              dice: player.dice.map((die, index) =>
                index === dieIndex
                  ? {
                      ...die,
                      rolledFaceIndex: faceIndex,
                      status: 'ready' as const,
                    }
                  : die,
              ),
            }
          : player,
      ),
    });

    // A value-4 die chips the 10-health boss without killing it.
    const chipState = withFace(start, 0, 3);
    const chip = applyAction(chipState, {
      type: 'place-die',
      playerId: human.id,
      dieId: human.dice[0]!.id,
      locationId: 'raid-pass' as LocationId,
      slotId: 'raid-a' as SlotId,
    });
    expect(chip.state.raidDamage['raid-pass']).toBe(4);
    expect(chip.events).toContainEqual(
      expect.objectContaining({
        type: 'raid-damaged',
        damage: 4,
        remaining: 6,
      }),
    );
    expect(chip.events.some((event) => event.type === 'monster-slain')).toBe(
      false,
    );

    // A natural six doubles to 12 damage, finishing the boss and taking the
    // bounty: 6 victory points plus 3 gold from the hoard.
    const finishState = withFace(chip.state, 1, 5);
    const finish = applyAction(finishState, {
      type: 'place-die',
      playerId: human.id,
      dieId: human.dice[1]!.id,
      locationId: 'raid-pass' as LocationId,
      slotId: 'raid-b' as SlotId,
    });
    expect(finish.state.raidDamage['raid-pass']).toBe(10);
    const slayer = finish.state.players.find((p) => p.id === human.id)!;
    expect(slayer.monstersSlain).toBe(1);
    expect(finish.events).toContainEqual(
      expect.objectContaining({
        type: 'monster-slain',
        beast: 'Elder Dragon',
        critical: true,
      }),
    );
    // 6 bounty points, and gold rose by the 3-gold hoard.
    const before = chip.state.players.find((p) => p.id === human.id)!;
    expect(slayer.victoryPoints - before.victoryPoints).toBe(6);
    expect(slayer.resources.gold - before.resources.gold).toBe(3);
  });

  it('bumps an enemy die with a higher value and returns it ready', () => {
    const base = game();
    const human = base.players[0]!;
    // Pin the contested values: the defender rolls 3, the challenger 5.
    const state = {
      ...base,
      players: base.players.map((player, playerIndex) => ({
        ...player,
        dice: player.dice.map((die, dieIndex) =>
          dieIndex === 0
            ? { ...die, rolledFaceIndex: playerIndex === 0 ? 2 : 4 }
            : die,
        ),
      })),
    };
    const placed = applyAction(state, {
      type: 'place-die',
      playerId: human.id,
      dieId: human.dice[0]!.id,
      locationId: locations[0]!.id,
      slotId: locations[0]!.slots[0]!.id,
    }).state;
    const cpu = placed.players[1]!;

    // Equal or lower values cannot take a held slot; only a strictly higher one.
    const weakBump: GameAction = {
      type: 'bump-die',
      playerId: cpu.id,
      dieId: cpu.dice[1]!.id,
      locationId: locations[0]!.id,
      slotId: locations[0]!.slots[0]!.id,
    };
    const weakState = {
      ...placed,
      players: placed.players.map((player) =>
        player.id === cpu.id
          ? {
              ...player,
              dice: player.dice.map((die, index) =>
                index === 1 ? { ...die, rolledFaceIndex: 2 } : die,
              ),
            }
          : player,
      ),
    };
    expect(validateAction(weakState, weakBump)).toMatchObject({
      legal: false,
      code: 'requirement-not-met',
    });

    const bump: GameAction = {
      type: 'bump-die',
      playerId: cpu.id,
      dieId: cpu.dice[0]!.id,
      locationId: locations[0]!.id,
      slotId: locations[0]!.slots[0]!.id,
    };
    expect(validateAction(placed, bump).legal).toBe(true);

    const bumped = applyAction(placed, bump);
    const slot = bumped.state.locations
      .find((item) => item.id === locations[0]!.id)!
      .slots.find((item) => item.id === locations[0]!.slots[0]!.id)!;
    expect(slot.occupantPlayerId).toBe(cpu.id);
    // The victim's die comes back ready to be used again, not destroyed.
    const victimDie = bumped.state.players
      .find((player) => player.id === human.id)!
      .dice.find((die) => die.id === human.dice[0]!.id)!;
    expect(victimDie.status).toBe('ready');
    expect(bumped.events).toContainEqual(
      expect.objectContaining({
        type: 'die-bumped',
        victimPlayerId: human.id,
      }),
    );
  });

  it('gives each faction its own grip on combat and displacement', () => {
    const verdant: FactionDefinition = {
      id: 'test-verdant' as FactionId,
      name: 'Test Verdant',
      passiveAbilityId: 'verdant-adaptation',
      passiveAbility: 'Adapt',
      roundAbility: 'None',
      startingCardId: 'card-a' as CardId,
      scoringRule: 'Breadth',
    };
    const ember: FactionDefinition = {
      id: 'test-ember' as FactionId,
      name: 'Test Ember',
      passiveAbilityId: 'martial-glory',
      passiveAbility: 'Glory',
      roundAbility: 'None',
      startingCardId: 'card-b' as CardId,
      scoringRule: 'Martial',
    };
    const roster = [...factions, verdant, ember];

    // Verdant fields a sixth die; the other factions field five.
    const verdantGame = createGame({
      seed: 'faction-abilities',
      humanFactionId: verdant.id,
      cpuFactionId: factions[1]!.id,
      content: { factions: roster, locations, cards, upgrades },
    }).state;
    expect(verdantGame.players[0]!.dice).toHaveLength(6);
    expect(verdantGame.players[1]!.dice).toHaveLength(5);

    // Ember adds flat damage to a raid boss on top of the doubled critical.
    const raid: readonly BoardLocation[] = [
      {
        id: 'boss' as LocationId,
        name: 'Boss',
        description: 'A raid.',
        tags: ['martial', 'combat'],
        reward: {},
        encounter: {
          title: 'Boss',
          beasts: ['Wyrm'],
          loot: 'gold',
          criticalBonus: 0,
          health: 40,
          bounty: { victoryPoints: 1 },
        },
        slots: [
          {
            id: 'boss-a' as SlotId,
            occupantDieId: null,
            occupantPlayerId: null,
            requirement: {},
          },
        ],
      },
    ];
    const strike = (factionId: FactionId) => {
      const base = createGame({
        seed: 'raid-damage',
        humanFactionId: factionId,
        cpuFactionId: factions[0]!.id,
        content: { factions: roster, locations: raid, cards, upgrades },
      }).state;
      const attacker = base.players[0]!;
      const pinned = {
        ...base,
        players: base.players.map((player) =>
          player.id === attacker.id
            ? {
                ...player,
                dice: player.dice.map((die, index) =>
                  index === 0 ? { ...die, rolledFaceIndex: 3 } : die,
                ),
              }
            : player,
        ),
      };
      return applyAction(pinned, {
        type: 'place-die',
        playerId: attacker.id,
        dieId: attacker.dice[0]!.id,
        locationId: 'boss' as LocationId,
        slotId: 'boss-a' as SlotId,
      }).state.raidDamage['boss'];
    };
    // A value-4 die: 4 damage normally, 6 for Ember's martial glory.
    expect(strike(factions[0]!.id)).toBe(4);
    expect(strike(ember.id)).toBe(6);
  });

  it('prices bumping by attacker and defender faction', () => {
    const stonebound = factions[1]!;
    const arcanum = factions[0]!;
    const base = createGame({
      seed: 'bump-pricing',
      humanFactionId: arcanum.id,
      cpuFactionId: stonebound.id,
      content: { factions, locations, cards, upgrades },
    }).state;
    // Defender rolls 3, attacker rolls 5, so only the price differs.
    const state = {
      ...base,
      players: base.players.map((player, playerIndex) => ({
        ...player,
        dice: player.dice.map((die, dieIndex) =>
          dieIndex === 0
            ? { ...die, rolledFaceIndex: playerIndex === 1 ? 2 : 4 }
            : die,
        ),
      })),
    };
    const defender = state.players[1]!;
    const held = applyAction(
      { ...state, turn: { ...state.turn, activePlayerId: defender.id } },
      {
        type: 'place-die',
        playerId: defender.id,
        dieId: defender.dice[0]!.id,
        locationId: locations[0]!.id,
        slotId: locations[0]!.slots[0]!.id,
      },
    ).state;

    const attacker = held.players[0]!;
    const before = attacker.resources;
    const bumped = applyAction(
      { ...held, turn: { ...held.turn, activePlayerId: attacker.id } },
      {
        type: 'bump-die',
        playerId: attacker.id,
        dieId: attacker.dice[0]!.id,
        locationId: locations[0]!.id,
        slotId: locations[0]!.slots[0]!.id,
      },
    ).state;
    const after = bumped.players.find((p) => p.id === attacker.id)!.resources;
    // Arcanum pays in mana, and Stonebound's masonry taxes 1 extra influence.
    expect(before.mana - after.mana).toBe(1);
    expect(before.influence - after.influence).toBe(1);
  });

  it('boosts a die for the round, unlocking gates it could not reach', () => {
    const boostCard: Card = {
      id: 'boost-card' as CardId,
      name: 'Test War Cry',
      category: 'tactic',
      cost: {},
      effects: [{ type: 'boost-die', amount: 3 }],
      rulesText: 'A ready die gains +3.',
      target: 'ready-die',
      marketCopies: 0,
    };
    const base = createGame({
      seed: 'boost-test',
      humanFactionId: factions[0]!.id,
      cpuFactionId: factions[1]!.id,
      content: { factions, locations, cards: [...cards, boostCard], upgrades },
    }).state;
    const human = base.players[0]!;
    const arcane = human.dice.find((die) => die.affinity === 'arcane')!;
    // Pin the die to a 2 and put the boost card in hand.
    const state = {
      ...base,
      players: base.players.map((player) =>
        player.id === human.id
          ? {
              ...player,
              hand: [boostCard.id],
              dice: player.dice.map((die) =>
                die.id === arcane.id ? { ...die, rolledFaceIndex: 1 } : die,
              ),
            }
          : player,
      ),
    };

    // The vault needs a 4, so a 2 is blocked before the boost.
    const reach: GameAction = {
      type: 'place-die',
      playerId: human.id,
      dieId: arcane.id,
      locationId: locations[1]!.id,
      slotId: locations[1]!.slots[0]!.id,
    };
    expect(validateAction(state, reach)).toMatchObject({
      legal: false,
      code: 'requirement-not-met',
    });

    const boosted = applyAction(state, {
      type: 'play-card',
      playerId: human.id,
      cardId: boostCard.id,
      targetDieId: arcane.id,
    });
    const boostedDie = boosted.state.players
      .find((player) => player.id === human.id)!
      .dice.find((die) => die.id === arcane.id)!;
    expect(dieValue(boostedDie)).toBe(5);
    expect(boosted.events).toContainEqual(
      expect.objectContaining({ type: 'die-boosted', amount: 3, value: 5 }),
    );
    // At value 5 the same placement is now legal.
    expect(
      validateAction(
        {
          ...boosted.state,
          turn: { ...boosted.state.turn, activePlayerId: human.id },
        },
        reach,
      ).legal,
    ).toBe(true);

    // The boost is temporary: a fresh round clears it.
    let rolled = boosted.state;
    for (const player of rolled.players)
      rolled = applyAction(
        { ...rolled, turn: { ...rolled.turn, activePlayerId: player.id } },
        { type: 'pass', playerId: player.id },
      ).state;
    expect(rolled.round.number).toBe(2);
    const freshDie = rolled.players
      .find((player) => player.id === human.id)!
      .dice.find((die) => die.id === arcane.id)!;
    expect(freshDie.valueBonus ?? 0).toBe(0);
  });

  it('steals from rivals and softens but never finishes a raid boss', () => {
    const siege: Card = {
      id: 'siege-card' as CardId,
      name: 'Test Ballista',
      category: 'tactic',
      cost: {},
      effects: [{ type: 'damage-raid', amount: 99 }],
      rulesText: 'Batter the boss.',
      target: 'none',
      marketCopies: 0,
    };
    const thief: Card = {
      id: 'thief-card' as CardId,
      name: 'Test Cutpurse',
      category: 'ally',
      cost: {},
      effects: [{ type: 'steal-resource', resource: 'gold', amount: 2 }],
      rulesText: 'Steal 2 gold.',
      target: 'none',
      marketCopies: 0,
    };
    const raidLocations: readonly BoardLocation[] = [
      {
        id: 'siege-pass' as LocationId,
        name: 'Siege Pass',
        description: 'A persistent boss.',
        tags: ['martial', 'combat'],
        reward: {},
        encounter: {
          title: 'Siege Pass',
          beasts: ['Elder Dragon'],
          loot: 'gold',
          criticalBonus: 0,
          health: 20,
          bounty: { victoryPoints: 6 },
        },
        slots: [
          {
            id: 'siege-a' as SlotId,
            occupantDieId: null,
            occupantPlayerId: null,
            requirement: {},
          },
        ],
      },
    ];
    const base = createGame({
      seed: 'siege-test',
      humanFactionId: factions[0]!.id,
      cpuFactionId: factions[1]!.id,
      content: {
        factions,
        locations: raidLocations,
        cards: [...cards, siege, thief],
        upgrades,
      },
    }).state;
    const human = base.players[0]!;
    const state = {
      ...base,
      players: base.players.map((player) =>
        player.id === human.id
          ? { ...player, hand: [siege.id, thief.id] }
          : player,
      ),
    };

    // Overwhelming card damage still leaves the beast on 1 health: a die must
    // land the killing blow, so no monster-slain event fires here.
    const battered = applyAction(state, {
      type: 'play-card',
      playerId: human.id,
      cardId: siege.id,
    });
    expect(battered.state.raidDamage['siege-pass']).toBe(19);
    expect(
      battered.events.some((event) => event.type === 'monster-slain'),
    ).toBe(false);
    expect(battered.events).toContainEqual(
      expect.objectContaining({ type: 'raid-damaged', remaining: 1 }),
    );

    // Stealing moves resources between players rather than creating them.
    const cpu = state.players[1]!;
    const beforeThief = cpu.resources.gold;
    const robbed = applyAction(
      { ...state, turn: { ...state.turn, activePlayerId: human.id } },
      { type: 'play-card', playerId: human.id, cardId: thief.id },
    );
    const taken = Math.min(2, beforeThief);
    const thiefAfter = robbed.state.players.find((p) => p.id === human.id)!;
    const victimAfter = robbed.state.players.find((p) => p.id === cpu.id)!;
    expect(victimAfter.resources.gold).toBe(beforeThief - taken);
    expect(thiefAfter.resources.gold).toBe(human.resources.gold + taken);
    expect(robbed.events).toContainEqual(
      expect.objectContaining({ type: 'resource-stolen', amount: taken }),
    );
  });

  it('resolves payoff cards from prior hunts, forged faces, and tag placements', () => {
    const trophy: Card = {
      id: 'trophy-card' as CardId,
      name: 'Test Trophy Cabinet',
      category: 'relic',
      cost: {},
      effects: [
        {
          type: 'gain-victory-points-per-monster',
          amountPerMonster: 2,
          maxAmount: 8,
        },
      ],
      rulesText: 'Cash in kills.',
      target: 'none',
      marketCopies: 0,
    };
    const charter: Card = {
      id: 'charter-card' as CardId,
      name: 'Test Forge Charter',
      category: 'ally',
      cost: {},
      effects: [
        {
          type: 'gain-victory-points-per-upgrade',
          amountPerUpgrade: 1,
        },
      ],
      rulesText: 'Cash in upgrades.',
      target: 'none',
      marketCopies: 0,
    };
    const captain: Card = {
      id: 'captain-card' as CardId,
      name: 'Test Veteran Captain',
      category: 'ally',
      cost: {},
      effects: [
        {
          type: 'gain-resource-per-tag-placement',
          tag: 'combat',
          resource: 'gold',
          amountPerPlacement: 1,
          maxAmount: 4,
        },
      ],
      rulesText: 'Cash in combat.',
      target: 'none',
      marketCopies: 0,
    };
    const state = createGame({
      seed: 'payoff-cards',
      humanFactionId: factions[0]!.id,
      cpuFactionId: factions[1]!.id,
      content: {
        factions,
        locations,
        cards: [...cards, trophy, charter, captain],
        upgrades,
      },
    }).state;
    const human = state.players[0]!;
    const primed = {
      ...state,
      players: state.players.map((player) =>
        player.id === human.id
          ? {
              ...player,
              hand: [trophy.id, charter.id, captain.id],
              monstersSlain: 3,
              placementCounts: { combat: 5 },
              dice: player.dice.map((die, index) =>
                index === 0
                  ? {
                      ...die,
                      enhancements: ['alpha' as UpgradeId, 'beta' as UpgradeId],
                    }
                  : die,
              ),
            }
          : player,
      ),
    };

    const scoredKills = applyAction(primed, {
      type: 'play-card',
      playerId: human.id,
      cardId: trophy.id,
    });
    expect(scoredKills.state.players[0]!.victoryPoints).toBe(6);

    const scoredForge = applyAction(
      {
        ...scoredKills.state,
        turn: { ...scoredKills.state.turn, activePlayerId: human.id },
      },
      { type: 'play-card', playerId: human.id, cardId: charter.id },
    );
    expect(scoredForge.state.players[0]!.victoryPoints).toBe(8);

    const paidCaptain = applyAction(
      {
        ...scoredForge.state,
        turn: { ...scoredForge.state.turn, activePlayerId: human.id },
      },
      { type: 'play-card', playerId: human.id, cardId: captain.id },
    );
    expect(paidCaptain.state.players[0]!.resources.gold).toBe(
      scoredForge.state.players[0]!.resources.gold + 4,
    );
  });

  it('awards a shared objective to the first player to satisfy it', () => {
    const objectivePool = [
      {
        id: 'test-quest' as ObjectiveId,
        name: 'Test Quest',
        description: 'Play a card.',
        victoryPoints: 5,
        condition: { type: 'cards-played', amount: 1 },
      },
    ] as const;
    const state = createGame({
      seed: 'objective-test',
      humanFactionId: factions[0]!.id,
      cpuFactionId: factions[1]!.id,
      content: {
        factions,
        locations,
        cards,
        upgrades,
        objectives: objectivePool,
      },
    }).state;
    expect(state.objectives).toHaveLength(1);
    expect(state.objectives[0]?.claimedBy).toBeNull();

    const human = state.players[0]!;
    const played = applyAction(state, {
      type: 'play-card',
      playerId: human.id,
      cardId: cards[0]!.id,
    });
    expect(played.state.objectives[0]?.claimedBy).toBe(human.id);
    expect(played.events).toContainEqual(
      expect.objectContaining({
        type: 'objective-claimed',
        victoryPoints: 5,
      }),
    );
    const claimer = played.state.players.find((p) => p.id === human.id)!;
    expect(claimer.victoryPoints).toBeGreaterThanOrEqual(5);

    // A second player meeting the same condition cannot claim it again.
    const cpu = played.state.players[1]!;
    const cpuTurn = {
      ...played.state,
      turn: { ...played.state.turn, activePlayerId: cpu.id },
    };
    const cpuPlayed = applyAction(cpuTurn, {
      type: 'play-card',
      playerId: cpu.id,
      cardId: cpu.hand[0]!,
    });
    expect(cpuPlayed.state.objectives[0]?.claimedBy).toBe(human.id);
    expect(
      cpuPlayed.events.some((event) => event.type === 'objective-claimed'),
    ).toBe(false);
  });

  it('claims objectives for played card categories', () => {
    const ally: Card = {
      id: 'ally-quest-card' as CardId,
      name: 'Quest Ally',
      category: 'ally',
      cost: {},
      effects: [{ type: 'gain-resource', resource: 'gold', amount: 1 }],
      rulesText: 'Gain gold.',
      target: 'none',
      marketCopies: 0,
    };
    const objectivePool = [
      {
        id: 'ally-quest' as ObjectiveId,
        name: 'Ally Quest',
        description: 'Play an ally.',
        victoryPoints: 4,
        condition: {
          type: 'category-cards-played',
          category: 'ally',
          amount: 1,
        },
      },
    ] as const;
    const state = createGame({
      seed: 'category-objective',
      humanFactionId: factions[0]!.id,
      cpuFactionId: factions[1]!.id,
      content: {
        factions,
        locations,
        cards: [...cards, ally],
        upgrades,
        objectives: objectivePool,
      },
    }).state;
    const human = state.players[0]!;
    const primed = {
      ...state,
      players: state.players.map((player) =>
        player.id === human.id ? { ...player, hand: [ally.id] } : player,
      ),
    };

    const played = applyAction(primed, {
      type: 'play-card',
      playerId: human.id,
      cardId: ally.id,
    });
    expect(played.state.objectives[0]?.claimedBy).toBe(human.id);
    expect(played.events).toContainEqual(
      expect.objectContaining({
        type: 'objective-claimed',
        objectiveId: 'ally-quest',
      }),
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
