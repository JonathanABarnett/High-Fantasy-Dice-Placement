import type {
  ActionValidation,
  BoardLocation,
  Card,
  Die,
  DieAffinity,
  DieFace,
  DieId,
  FactionDefinition,
  FactionId,
  GameAction,
  GameEvent,
  GameId,
  GameState,
  MatchResult,
  PlayerId,
  PlayerState,
  ResourcePool,
  ScoreBreakdown,
  UpgradeDefinition,
} from '@shattered-crown/shared-types';

import { SeededRandom } from './random/seeded-random.js';

const RESOURCE_TYPES = [
  'gold',
  'mana',
  'knowledge',
  'materials',
  'influence',
] as const;
const STARTING_AFFINITIES: readonly DieAffinity[] = [
  'arcane',
  'martial',
  'nature',
  'influence',
  'neutral',
];

export interface MatchContent {
  readonly factions: readonly FactionDefinition[];
  readonly locations: readonly BoardLocation[];
  readonly cards?: readonly Card[];
  readonly upgrades?: readonly UpgradeDefinition[];
}

export interface CreateGameOptions {
  readonly seed: string;
  readonly humanFactionId: FactionId;
  readonly cpuFactionId: FactionId;
  readonly additionalCpuFactionIds?: readonly FactionId[];
  readonly content: MatchContent;
  readonly maximumRounds?: number;
}

export interface TransitionResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

function emptyResources(): ResourcePool {
  return { gold: 2, mana: 1, knowledge: 1, materials: 1, influence: 1 };
}

function createFaces(): Die['faces'] {
  return [1, 2, 3, 4, 5, 6].map((value) => ({
    value,
    symbols: [],
  })) as unknown as Die['faces'];
}

function createDice(playerId: PlayerId): readonly Die[] {
  return STARTING_AFFINITIES.map((affinity, index) => ({
    id: `${playerId}-die-${index + 1}` as DieId,
    affinity,
    faces: createFaces(),
    rolledFaceIndex: null,
    status: 'ready' as const,
    enhancements: [],
  }));
}

function createPlayer(
  id: PlayerId,
  name: string,
  controller: PlayerState['controller'],
  faction: FactionDefinition,
): PlayerState {
  return {
    id,
    name,
    controller,
    factionId: faction.id,
    factionAbilityId: faction.passiveAbilityId,
    resources: emptyResources(),
    dice: createDice(id),
    hand: [],
    playedCards: [],
    victoryPoints: 0,
    hasPassed: false,
    placementCounts: {},
  };
}

interface ScarcityProfile {
  readonly activeLocationCount: number;
  readonly openSlotCount: number;
  readonly lowRollSlotCount: number;
}

function slotMinimum(location: BoardLocation, slotIndex: number): number {
  return location.slots[slotIndex]?.requirement.minimumValue ?? 1;
}

function slotHasCostOrAffinity(location: BoardLocation, slotIndex: number) {
  const requirement = location.slots[slotIndex]?.requirement;
  return (
    Boolean(requirement?.affinities?.length) ||
    Object.keys(requirement?.cost ?? {}).length > 0
  );
}

function scarcityProfile(
  playerCount: number,
  totalDiceCount: number,
  locationCount: number,
): ScarcityProfile {
  const openSlotCount = Math.max(
    playerCount * 3,
    Math.ceil(totalDiceCount * 0.75),
  );
  const cappedOpenSlots = Math.min(locationCount * 2, openSlotCount);
  return {
    activeLocationCount: Math.min(
      locationCount,
      cappedOpenSlots,
      Math.max(playerCount * 2 + 2, Math.ceil(cappedOpenSlots * 0.7)),
    ),
    openSlotCount: cappedOpenSlots,
    lowRollSlotCount: Math.min(cappedOpenSlots, playerCount + 1),
  };
}

function slotKey(locationId: string, slotIndex: number): string {
  return `${locationId}:${slotIndex}`;
}

/**
 * Scarcity scales from the actual player and dice count. The board should leave
 * players bumping elbows, while still reserving a few low-minimum routes so a
 * bad roll creates a smaller plan instead of no plan.
 */
function configureRoundScarcity(
  locations: readonly BoardLocation[],
  random: SeededRandom,
  playerCount: number,
  totalDiceCount: number,
): readonly BoardLocation[] {
  const profile = scarcityProfile(
    playerCount,
    totalDiceCount,
    locations.length,
  );
  const shuffledLocations = random.shuffle([...locations]);
  const activeIds = new Set<string>();
  const openSlots = new Set<string>();

  const openFirstSlot = (location: BoardLocation) => {
    activeIds.add(location.id);
    openSlots.add(slotKey(location.id, 0));
  };
  const openAnySlot = (location: BoardLocation, slotIndex: number) => {
    activeIds.add(location.id);
    openSlots.add(slotKey(location.id, slotIndex));
    if (slotIndex > 0) openSlots.add(slotKey(location.id, 0));
  };

  const lowRollLocations = random.shuffle(
    locations.filter(
      (location) =>
        location.slots.length > 0 &&
        slotMinimum(location, 0) <= 2 &&
        !slotHasCostOrAffinity(location, 0),
    ),
  );

  for (const location of lowRollLocations) {
    if (openSlots.size >= profile.lowRollSlotCount) break;
    openFirstSlot(location);
  }

  for (const location of shuffledLocations) {
    if (activeIds.size >= profile.activeLocationCount) break;
    openFirstSlot(location);
  }

  const secondSlotCandidates = random.shuffle(
    locations.filter(
      (location) => activeIds.has(location.id) && location.slots.length > 1,
    ),
  );
  for (const location of secondSlotCandidates) {
    if (openSlots.size >= profile.openSlotCount) break;
    openAnySlot(location, 1);
  }

  for (const location of shuffledLocations) {
    if (openSlots.size >= profile.openSlotCount) break;
    openFirstSlot(location);
  }

  return locations.map((location) => {
    const isActive = activeIds.has(location.id);
    return {
      ...location,
      isActive,
      slots: location.slots.map((slot, index) => ({
        ...slot,
        isOpen: isActive && openSlots.has(slotKey(location.id, index)),
        occupantDieId: null,
        occupantPlayerId: null,
      })),
    };
  });
}

function rollPlayers(
  players: readonly PlayerState[],
  random: SeededRandom,
  sequence: number,
): {
  readonly players: readonly PlayerState[];
  readonly events: readonly GameEvent[];
  readonly sequence: number;
} {
  const events: GameEvent[] = [];
  let nextSequence = sequence;
  const rolledPlayers = players.map((player) => ({
    ...player,
    dice: player.dice.map((die) => {
      const faceIndex = random.nextInt(0, die.faces.length);
      nextSequence += 1;
      events.push({
        type: 'die-rolled',
        sequence: nextSequence,
        dieId: die.id,
        faceIndex,
      });
      return { ...die, rolledFaceIndex: faceIndex, status: 'ready' as const };
    }),
  }));

  return { players: rolledPlayers, events, sequence: nextSequence };
}

export function createGame(options: CreateGameOptions): TransitionResult {
  const humanFaction = options.content.factions.find(
    (item) => item.id === options.humanFactionId,
  );
  const cpuFaction = options.content.factions.find(
    (item) => item.id === options.cpuFactionId,
  );
  if (!humanFaction || !cpuFaction) {
    throw new Error('Both selected factions must exist in match content.');
  }
  if (options.content.locations.length === 0) {
    throw new Error('A match requires at least one board location.');
  }

  const humanId = 'player-human' as PlayerId;
  const cpuIds = [
    'player-cpu' as PlayerId,
    ...((options.additionalCpuFactionIds ?? []).map(
      (_, index) => `player-cpu-${index + 2}` as PlayerId,
    ) as readonly PlayerId[]),
  ];
  const random = new SeededRandom(options.seed);
  const cards = options.content.cards ?? [];
  const cardPool = cards.flatMap((card) =>
    Array.from({ length: card.marketCopies }, () => card.id),
  );
  const shuffledCards = random.shuffle(cardPool);
  const cardMarket = shuffledCards.slice(0, 3);
  const cardDeck = shuffledCards.slice(3);
  const cpuFactionIds = [
    options.cpuFactionId,
    ...(options.additionalCpuFactionIds ?? []),
  ];
  const cpuFactions = cpuFactionIds.map((factionId) => {
    const faction = options.content.factions.find(
      (item) => item.id === factionId,
    );
    if (!faction)
      throw new Error('Every CPU faction must exist in match content.');
    return faction;
  });
  const players = [
    createPlayer(humanId, 'Player', 'human', humanFaction),
    ...cpuFactions.map((faction, index) =>
      createPlayer(
        cpuIds[index] as PlayerId,
        index === 0 ? 'CPU' : `CPU ${index + 1}`,
        'cpu',
        faction,
      ),
    ),
  ];
  const roundLocations = configureRoundScarcity(
    options.content.locations,
    random,
    players.length,
    players.reduce((total, player) => total + player.dice.length, 0),
  );
  const rolled = rollPlayers(players, random, 1);
  const roundEvent: GameEvent = {
    type: 'round-started',
    sequence: 1,
    round: 1,
  };

  return {
    state: {
      schemaVersion: 3,
      id: `match-${options.seed}` as GameId,
      seed: options.seed,
      rngState: random.snapshot().state,
      phase: 'action',
      players: rolled.players.map((player) => {
        const cpuIndex = cpuIds.indexOf(player.id);
        const faction =
          player.id === humanId
            ? humanFaction
            : (cpuFactions[cpuIndex] as FactionDefinition);
        return cards.some((card) => card.id === faction.startingCardId)
          ? { ...player, hand: [faction.startingCardId] }
          : player;
      }),
      locations: roundLocations,
      cards,
      cardDeck,
      cardMarket,
      cardDiscard: [],
      upgrades: options.content.upgrades ?? [],
      round: {
        number: 1,
        maximum: options.maximumRounds ?? 6,
        firstPlayerId: humanId,
        passedPlayerIds: [],
      },
      turn: { activePlayerId: humanId, turnNumber: 1 },
      eventSequence: rolled.sequence,
      result: null,
    },
    events: [roundEvent, ...rolled.events],
  };
}

function currentFace(die: Die): DieFace | null {
  return die.rolledFaceIndex === null
    ? null
    : (die.faces[die.rolledFaceIndex] ?? null);
}

function hasResources(
  resources: ResourcePool,
  cost: Partial<ResourcePool> | undefined,
): boolean {
  return RESOURCE_TYPES.every(
    (resource) => resources[resource] >= (cost?.[resource] ?? 0),
  );
}

export function validateAction(
  state: GameState,
  action: GameAction,
): ActionValidation {
  if (state.phase !== 'action') {
    return {
      legal: false,
      code: 'wrong-phase',
      message: 'The match is not accepting actions.',
    };
  }
  if (action.playerId !== state.turn.activePlayerId) {
    return {
      legal: false,
      code: 'not-active-player',
      message: 'It is not that player’s turn.',
    };
  }

  const player = state.players.find((item) => item.id === action.playerId);
  if (!player) {
    return {
      legal: false,
      code: 'entity-not-found',
      message: 'The acting player does not exist.',
    };
  }
  if (player.hasPassed) {
    return {
      legal: false,
      code: 'already-passed',
      message: 'That player has already passed.',
    };
  }
  if (action.type === 'pass') {
    return { legal: true, action };
  }

  if (action.type === 'acquire-card') {
    const card = state.cards.find((item) => item.id === action.cardId);
    if (!card || !state.cardMarket.includes(action.cardId)) {
      return {
        legal: false,
        code: 'entity-not-found',
        message: 'That card is not available in the market.',
      };
    }
    if (!hasResources(player.resources, card.cost)) {
      return {
        legal: false,
        code: 'insufficient-resources',
        message: 'The player cannot afford that card.',
      };
    }
    return { legal: true, action };
  }

  if (action.type === 'play-card') {
    const card = state.cards.find((item) => item.id === action.cardId);
    if (!card || !player.hand.includes(action.cardId)) {
      return {
        legal: false,
        code: 'card-not-in-hand',
        message: 'That card is not in the player’s hand.',
      };
    }
    if (!hasResources(player.resources, card.cost)) {
      return {
        legal: false,
        code: 'insufficient-resources',
        message: 'The player cannot pay this card’s cost.',
      };
    }
    if (card.target === 'ready-die') {
      const target = player.dice.find((die) => die.id === action.targetDieId);
      if (!target || target.status !== 'ready') {
        return {
          legal: false,
          code: 'invalid-target',
          message: 'This card requires one of your ready dice.',
        };
      }
    }
    return { legal: true, action };
  }

  if (action.type === 'upgrade-die') {
    const die = player.dice.find((item) => item.id === action.dieId);
    const upgrade = state.upgrades.find((item) => item.id === action.upgradeId);
    if (
      !die ||
      !upgrade ||
      action.faceIndex < 0 ||
      action.faceIndex >= die.faces.length
    ) {
      return {
        legal: false,
        code: 'entity-not-found',
        message: 'The selected die face or upgrade does not exist.',
      };
    }
    const controlsForge = state.locations.some(
      (location) =>
        location.tags.includes('forge') &&
        location.slots.some((slot) => slot.occupantPlayerId === player.id),
    );
    if (!controlsForge) {
      return {
        legal: false,
        code: 'forge-required',
        message: 'Place one of your dice at Forge Hall before upgrading.',
      };
    }
    if (!hasResources(player.resources, upgrade.cost)) {
      return {
        legal: false,
        code: 'insufficient-resources',
        message: 'The player cannot afford this die upgrade.',
      };
    }
    const current = die.faces[action.faceIndex];
    if (
      current?.value === upgrade.replacement.value &&
      current.symbols.join('|') === upgrade.replacement.symbols.join('|')
    ) {
      return {
        legal: false,
        code: 'invalid-target',
        message: 'That face already has this upgrade.',
      };
    }
    return { legal: true, action };
  }

  const die = player.dice.find((item) => item.id === action.dieId);
  const location = state.locations.find(
    (item) => item.id === action.locationId,
  );
  const slot = location?.slots.find((item) => item.id === action.slotId);
  if (!die || !location || !slot) {
    return {
      legal: false,
      code: 'entity-not-found',
      message: 'The selected die, location, or slot does not exist.',
    };
  }
  if (location.isActive === false) {
    return {
      legal: false,
      code: 'location-inactive',
      message: 'This region is sealed for the current round.',
    };
  }
  if (slot.isOpen === false) {
    return {
      legal: false,
      code: 'slot-unavailable',
      message: 'This slot is sealed for the current round.',
    };
  }
  if (die.status !== 'ready' || currentFace(die) === null) {
    return {
      legal: false,
      code: 'die-unavailable',
      message: 'That die is not available for placement.',
    };
  }
  if (slot.occupantDieId !== null) {
    return {
      legal: false,
      code: 'slot-occupied',
      message: 'That placement slot is already occupied.',
    };
  }

  const face = currentFace(die) as DieFace;
  const reduction =
    player.factionAbilityId === 'verdant-adaptation' &&
    die.affinity === 'nature'
      ? 1
      : 0;
  const minimum = Math.max(1, (slot.requirement.minimumValue ?? 1) - reduction);
  if (face.value < minimum) {
    return {
      legal: false,
      code: 'requirement-not-met',
      message: `This slot requires a die value of ${minimum} or higher.`,
    };
  }
  if (
    slot.requirement.affinities &&
    !slot.requirement.affinities.includes(die.affinity)
  ) {
    return {
      legal: false,
      code: 'requirement-not-met',
      message: 'The die affinity is not accepted by this slot.',
    };
  }
  if (!hasResources(player.resources, slot.requirement.cost)) {
    return {
      legal: false,
      code: 'insufficient-resources',
      message: 'The player cannot pay this placement cost.',
    };
  }
  return { legal: true, action };
}

export function enumerateLegalActions(
  state: GameState,
  playerId = state.turn.activePlayerId,
): readonly GameAction[] {
  if (state.phase !== 'action' || playerId !== state.turn.activePlayerId)
    return [];
  const player = state.players.find((item) => item.id === playerId);
  if (!player || player.hasPassed) return [];

  const actions: GameAction[] = [];

  for (const cardId of player.hand) {
    const card = state.cards.find((item) => item.id === cardId);
    if (!card) continue;
    if (card.target === 'ready-die') {
      for (const die of player.dice.filter((item) => item.status === 'ready')) {
        const action: GameAction = {
          type: 'play-card',
          playerId,
          cardId,
          targetDieId: die.id,
        };
        if (validateAction(state, action).legal) actions.push(action);
      }
    } else {
      const action: GameAction = { type: 'play-card', playerId, cardId };
      if (validateAction(state, action).legal) actions.push(action);
    }
  }

  for (const cardId of state.cardMarket) {
    const action: GameAction = { type: 'acquire-card', playerId, cardId };
    if (validateAction(state, action).legal) actions.push(action);
  }

  for (const die of player.dice) {
    for (let faceIndex = 0; faceIndex < die.faces.length; faceIndex += 1) {
      for (const upgrade of state.upgrades) {
        const action: GameAction = {
          type: 'upgrade-die',
          playerId,
          dieId: die.id,
          faceIndex,
          upgradeId: upgrade.id,
        };
        if (validateAction(state, action).legal) actions.push(action);
      }
    }
  }

  for (const die of player.dice) {
    if (die.status !== 'ready') continue;
    for (const location of state.locations) {
      for (const slot of location.slots) {
        const action: GameAction = {
          type: 'place-die',
          playerId,
          dieId: die.id,
          locationId: location.id,
          slotId: slot.id,
        };
        if (validateAction(state, action).legal) actions.push(action);
      }
    }
  }
  actions.push({ type: 'pass', playerId });
  return actions;
}

function adjustResources(
  resources: ResourcePool,
  amounts: Partial<ResourcePool>,
  direction: 1 | -1,
): ResourcePool {
  return Object.fromEntries(
    RESOURCE_TYPES.map((resource) => [
      resource,
      resources[resource] + (amounts[resource] ?? 0) * direction,
    ]),
  ) as unknown as ResourcePool;
}

function scoreMatch(state: GameState): MatchResult {
  const scores = {} as Record<PlayerId, readonly ScoreBreakdown[]>;
  for (const player of state.players) {
    const resourceTotal = RESOURCE_TYPES.reduce(
      (total, resource) => total + player.resources[resource],
      0,
    );
    let factionPoints = 0;
    if (player.factionAbilityId === 'arcane-resonance')
      factionPoints = Math.floor(player.resources.mana / 3);
    if (player.factionAbilityId === 'martial-glory')
      factionPoints = Math.floor((player.placementCounts.martial ?? 0) / 2);
    if (player.factionAbilityId === 'verdant-adaptation') {
      factionPoints = Math.floor(
        RESOURCE_TYPES.filter((resource) => player.resources[resource] > 0)
          .length / 3,
      );
    }
    if (player.factionAbilityId === 'stonebound-craft')
      factionPoints = Math.floor(player.resources.materials / 3);
    const cardPoints = player.playedCards.reduce((total, cardId) => {
      const card = state.cards.find((item) => item.id === cardId);
      return total + (card && card.category !== 'tactic' ? 1 : 0);
    }, 0);
    const upgradePoints = player.dice.reduce(
      (total, die) =>
        total +
        die.enhancements.reduce(
          (dieTotal, upgradeId) =>
            dieTotal +
            (state.upgrades.find((item) => item.id === upgradeId)?.scoreValue ??
              0),
          0,
        ),
      0,
    );
    scores[player.id] = [
      { source: 'Victory-point tokens', points: player.victoryPoints },
      {
        source: 'Resource reserves',
        points: Math.min(3, Math.floor(resourceTotal / 5)),
      },
      { source: 'Faction scoring', points: factionPoints },
      { source: 'Allies and relics', points: cardPoints },
      { source: 'Die enhancements', points: upgradePoints },
    ];
  }
  const totals = state.players.map((player) => ({
    id: player.id,
    score: (scores[player.id] ?? []).reduce(
      (total, item) => total + item.points,
      0,
    ),
  }));
  const best = Math.max(...totals.map((item) => item.score));
  return {
    winnerIds: totals
      .filter((item) => item.score === best)
      .map((item) => item.id),
    scores,
  };
}

function finishOrStartRound(state: GameState): TransitionResult {
  if (state.round.number >= state.round.maximum) {
    const preliminary = { ...state, phase: 'scoring' as const };
    const result = scoreMatch(preliminary);
    const sequence = state.eventSequence + 1;
    return {
      state: {
        ...preliminary,
        phase: 'complete',
        result,
        eventSequence: sequence,
      },
      events: [{ type: 'match-completed', sequence, result }],
    };
  }

  const nextRound = state.round.number + 1;
  const firstPlayerIndex = state.players.findIndex(
    (player) => player.id === state.round.firstPlayerId,
  );
  const nextFirst = state.players[
    (firstPlayerIndex + 1) % state.players.length
  ] as PlayerState;
  const random = new SeededRandom({
    algorithm: 'xorshift32',
    state: state.rngState,
  });
  const resetPlayers = state.players.map((player) => ({
    ...player,
    hasPassed: false,
  }));
  const roundLocations = configureRoundScarcity(
    state.locations,
    random,
    state.players.length,
    state.players.reduce((total, player) => total + player.dice.length, 0),
  );
  const roundSequence = state.eventSequence + 1;
  const rolled = rollPlayers(resetPlayers, random, roundSequence);
  return {
    state: {
      ...state,
      players: rolled.players,
      locations: roundLocations,
      rngState: random.snapshot().state,
      round: {
        number: nextRound,
        maximum: state.round.maximum,
        firstPlayerId: nextFirst.id,
        passedPlayerIds: [],
      },
      turn: {
        activePlayerId: nextFirst.id,
        turnNumber: state.turn.turnNumber + 1,
      },
      eventSequence: rolled.sequence,
    },
    events: [
      { type: 'round-started', sequence: roundSequence, round: nextRound },
      ...rolled.events,
    ],
  };
}

function nextPlayer(
  state: GameState,
  actingPlayerId: PlayerId,
): PlayerId | null {
  const actingIndex = state.players.findIndex(
    (player) => player.id === actingPlayerId,
  );
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate =
      state.players[(actingIndex + offset) % state.players.length];
    if (candidate && !candidate.hasPassed) return candidate.id;
  }
  return null;
}

export function applyAction(
  state: GameState,
  action: GameAction,
): TransitionResult {
  const validation = validateAction(state, action);
  if (!validation.legal)
    throw new Error(`${validation.code}: ${validation.message}`);

  let sequence = state.eventSequence;
  const events: GameEvent[] = [];
  let players = state.players;
  let locations = state.locations;
  let cardDeck = state.cardDeck;
  let cardMarket = state.cardMarket;
  let cardDiscard = state.cardDiscard;
  let rngState = state.rngState;

  if (action.type === 'pass') {
    sequence += 1;
    events.push({ type: 'player-passed', sequence, playerId: action.playerId });
    players = players.map((player) =>
      player.id === action.playerId ? { ...player, hasPassed: true } : player,
    );
  } else if (action.type === 'acquire-card') {
    const card = state.cards.find((item) => item.id === action.cardId) as Card;
    const marketIndex = cardMarket.indexOf(action.cardId);
    const replacement = cardDeck[0];
    cardMarket = cardMarket.filter((_, index) => index !== marketIndex);
    if (replacement) cardMarket = [...cardMarket, replacement];
    cardDeck = cardDeck.slice(replacement ? 1 : 0);
    players = players.map((player) =>
      player.id === action.playerId
        ? {
            ...player,
            resources: adjustResources(player.resources, card.cost, -1),
            hand: [...player.hand, card.id],
          }
        : player,
    );
    sequence += 1;
    events.push({
      type: 'card-acquired',
      sequence,
      playerId: action.playerId,
      cardId: card.id,
    });
  } else if (action.type === 'play-card') {
    const card = state.cards.find((item) => item.id === action.cardId) as Card;
    const actingPlayer = players.find(
      (player) => player.id === action.playerId,
    ) as PlayerState;
    const handIndex = actingPlayer.hand.indexOf(card.id);
    let updatedPlayer: PlayerState = {
      ...actingPlayer,
      resources: adjustResources(actingPlayer.resources, card.cost, -1),
      hand: actingPlayer.hand.filter((_, index) => index !== handIndex),
      playedCards: [...actingPlayer.playedCards, card.id],
    };

    sequence += 1;
    events.push({
      type: 'card-played',
      sequence,
      playerId: action.playerId,
      cardId: card.id,
    });

    for (const effect of card.effects) {
      if (effect.type === 'gain-resource') {
        updatedPlayer = {
          ...updatedPlayer,
          resources: adjustResources(
            updatedPlayer.resources,
            { [effect.resource]: effect.amount },
            1,
          ),
        };
        sequence += 1;
        events.push({
          type: 'resource-gained',
          sequence,
          playerId: action.playerId,
          resource: effect.resource,
          amount: effect.amount,
        });
      } else if (effect.type === 'gain-victory-points') {
        updatedPlayer = {
          ...updatedPlayer,
          victoryPoints: updatedPlayer.victoryPoints + effect.amount,
        };
        sequence += 1;
        events.push({
          type: 'victory-points-gained',
          sequence,
          playerId: action.playerId,
          amount: effect.amount,
        });
      } else if (effect.type === 'draw-card') {
        const drawn = cardDeck.slice(0, effect.amount);
        cardDeck = cardDeck.slice(drawn.length);
        updatedPlayer = {
          ...updatedPlayer,
          hand: [...updatedPlayer.hand, ...drawn],
        };
        for (const cardId of drawn) {
          sequence += 1;
          events.push({
            type: 'card-acquired',
            sequence,
            playerId: action.playerId,
            cardId,
          });
        }
      } else if (effect.type === 'reroll-die' && action.targetDieId) {
        const target = updatedPlayer.dice.find(
          (die) => die.id === action.targetDieId,
        ) as Die;
        const random = new SeededRandom({
          algorithm: 'xorshift32',
          state: rngState,
        });
        const faceIndex = random.nextInt(0, target.faces.length);
        rngState = random.snapshot().state;
        updatedPlayer = {
          ...updatedPlayer,
          dice: updatedPlayer.dice.map((die) =>
            die.id === target.id ? { ...die, rolledFaceIndex: faceIndex } : die,
          ),
        };
        sequence += 1;
        events.push({
          type: 'die-rerolled',
          sequence,
          dieId: target.id,
          faceIndex,
        });
      }
    }
    players = players.map((player) =>
      player.id === action.playerId ? updatedPlayer : player,
    );
    cardDiscard = [...cardDiscard, card.id];
  } else if (action.type === 'upgrade-die') {
    const upgrade = state.upgrades.find(
      (item) => item.id === action.upgradeId,
    ) as UpgradeDefinition;
    players = players.map((player) => {
      if (player.id !== action.playerId) return player;
      return {
        ...player,
        resources: adjustResources(player.resources, upgrade.cost, -1),
        dice: player.dice.map((die) => {
          if (die.id !== action.dieId) return die;
          const faces = die.faces.map((face, index) =>
            index === action.faceIndex ? upgrade.replacement : face,
          ) as unknown as Die['faces'];
          return {
            ...die,
            faces,
            enhancements: [...die.enhancements, upgrade.id],
          };
        }),
      };
    });
    sequence += 1;
    events.push({
      type: 'die-upgraded',
      sequence,
      playerId: action.playerId,
      dieId: action.dieId,
      faceIndex: action.faceIndex,
      upgradeId: action.upgradeId,
    });
  } else if (action.type === 'place-die') {
    const location = locations.find(
      (item) => item.id === action.locationId,
    ) as BoardLocation;
    const slot = location.slots.find((item) => item.id === action.slotId);
    const actingPlayer = players.find(
      (player) => player.id === action.playerId,
    ) as PlayerState;
    const die = actingPlayer.dice.find(
      (item) => item.id === action.dieId,
    ) as Die;
    const cost = slot?.requirement.cost ?? {};
    let reward = location.reward;
    const bonus: Partial<Record<(typeof RESOURCE_TYPES)[number], number>> = {};
    let bonusPoints = 0;
    const face = currentFace(die) as DieFace;
    for (const symbol of face.symbols) {
      if ((RESOURCE_TYPES as readonly string[]).includes(symbol)) {
        const resource = symbol as (typeof RESOURCE_TYPES)[number];
        bonus[resource] = (bonus[resource] ?? 0) + 1;
      }
      if (symbol === 'masterwork') bonusPoints += 1;
    }
    if (
      actingPlayer.factionAbilityId === 'arcane-resonance' &&
      die.affinity === 'arcane' &&
      location.tags.includes('arcane')
    )
      bonus.mana = 1;
    if (
      actingPlayer.factionAbilityId === 'stonebound-craft' &&
      location.tags.includes('forge')
    )
      bonus.materials = 1;
    if (
      actingPlayer.factionAbilityId === 'martial-glory' &&
      die.affinity === 'martial' &&
      location.tags.includes('martial')
    )
      bonusPoints = 1;
    reward = {
      ...reward,
      ...Object.fromEntries(
        RESOURCE_TYPES.map((resource) => [
          resource,
          (reward[resource] ?? 0) + (bonus[resource] ?? 0),
        ]),
      ),
    };

    players = players.map((player) => {
      if (player.id !== action.playerId) return player;
      const placementCounts = { ...player.placementCounts };
      for (const tag of location.tags)
        placementCounts[tag] = (placementCounts[tag] ?? 0) + 1;
      return {
        ...player,
        resources: adjustResources(
          adjustResources(player.resources, cost, -1),
          reward,
          1,
        ),
        victoryPoints:
          player.victoryPoints +
          (location.reward.victoryPoints ?? 0) +
          bonusPoints,
        placementCounts,
        dice: player.dice.map((item) =>
          item.id === action.dieId
            ? { ...item, status: 'placed' as const }
            : item,
        ),
      };
    });
    locations = locations.map((item) =>
      item.id === action.locationId
        ? {
            ...item,
            slots: item.slots.map((itemSlot) =>
              itemSlot.id === action.slotId
                ? {
                    ...itemSlot,
                    occupantDieId: action.dieId,
                    occupantPlayerId: action.playerId,
                  }
                : itemSlot,
            ),
          }
        : item,
    );
    sequence += 1;
    events.push({
      type: 'die-placed',
      sequence,
      playerId: action.playerId,
      dieId: action.dieId,
      locationId: action.locationId,
      slotId: action.slotId,
    });
    for (const resource of RESOURCE_TYPES) {
      const amount = reward[resource] ?? 0;
      if (amount > 0) {
        sequence += 1;
        events.push({
          type: 'resource-gained',
          sequence,
          playerId: action.playerId,
          resource,
          amount,
        });
      }
    }
    const points = (location.reward.victoryPoints ?? 0) + bonusPoints;
    if (points > 0) {
      sequence += 1;
      events.push({
        type: 'victory-points-gained',
        sequence,
        playerId: action.playerId,
        amount: points,
      });
    }
  }

  const intermediate: GameState = {
    ...state,
    players,
    locations,
    cardDeck,
    cardMarket,
    cardDiscard,
    rngState,
    eventSequence: sequence,
  };
  const activePlayerId = nextPlayer(intermediate, action.playerId);
  if (activePlayerId === null) {
    const advanced = finishOrStartRound(intermediate);
    return { state: advanced.state, events: [...events, ...advanced.events] };
  }

  return {
    state: {
      ...intermediate,
      round: {
        ...intermediate.round,
        passedPlayerIds: players
          .filter((player) => player.hasPassed)
          .map((player) => player.id),
      },
      turn: { activePlayerId, turnNumber: state.turn.turnNumber + 1 },
    },
    events,
  };
}

export function serializeGame(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeGame(serialized: string): GameState {
  const value: unknown = JSON.parse(serialized);
  if (!value || typeof value !== 'object')
    throw new Error('Saved game must be an object.');
  const candidate = value as Partial<GameState>;
  if (
    candidate.schemaVersion !== 3 ||
    !Array.isArray(candidate.players) ||
    !Array.isArray(candidate.locations) ||
    !Array.isArray(candidate.cards) ||
    !Array.isArray(candidate.cardDeck) ||
    !Array.isArray(candidate.cardMarket) ||
    !Array.isArray(candidate.cardDiscard) ||
    !Array.isArray(candidate.upgrades)
  ) {
    throw new Error('Saved game has an unsupported or invalid schema.');
  }
  if (
    typeof candidate.rngState !== 'number' ||
    candidate.result === undefined
  ) {
    throw new Error('Saved game is missing deterministic state.');
  }
  return candidate as GameState;
}
