import type {
  ActionValidation,
  BoardLocation,
  Card,
  ChainState,
  ClaimableObjective,
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
  Objective,
  ObjectiveCondition,
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
  readonly objectives?: readonly Objective[];
}

/** How many shared objectives are drawn into a match. */
const OBJECTIVE_COUNT = 3;
/** Default price of bumping an enemy die off a contested slot. */
const BUMP_COST: Partial<ResourcePool> = { influence: 1 };
/** Arcanum bends the cost of displacement onto raw magic instead of politics. */
const ARCANE_BUMP_COST: Partial<ResourcePool> = { mana: 1 };
/** Ember's warbands hit raid bosses this much harder. */
const EMBER_RAID_BONUS = 2;
/** Extra influence demanded to shift a Stonebound die. */
const STONEBOUND_BUMP_TAX: Partial<ResourcePool> = { influence: 1 };
/** Tempo compensation for the opening seat in a three-player match. */
const THREE_PLAYER_FIRST_SEAT_PURSE: Partial<ResourcePool> = {
  gold: 2,
  influence: 1,
};

/**
 * Victory points for extending a themed run of placements, by run length.
 * Short runs pay nothing, so the reward is for committing to a plan across a
 * whole round rather than for two placements that happen to rhyme.
 */
export function chainBonusFor(length: number): number {
  if (length >= 5) return 4;
  if (length === 4) return 3;
  if (length === 3) return 2;
  return 0;
}

/** Health a raid boss claws back in a round where nobody wounded it. */
const RAID_REGENERATION = 5;
/** Victory points added to a raid boss's hoard for each round it survives. */
const RAID_HOARD_GROWTH = 2;

/**
 * What the killing blow on this raid is currently worth. The hoard swells for
 * every round the beast survives, so a dragon left alone becomes both harder
 * to finish and richer to finish — the reason to engage it grows with the risk.
 */
export function raidBountyFor(
  location: BoardLocation,
  roundsSurvived: number,
): number {
  const base = location.encounter?.bounty?.victoryPoints ?? 0;
  return base + roundsSurvived * RAID_HOARD_GROWTH;
}

/** The run a placement at these tags would produce, given the current run. */
export function extendChain(
  chain: ChainState | undefined,
  tags: readonly string[],
): ChainState {
  const continues = Boolean(
    chain?.length && tags.some((tag) => chain.tags.includes(tag)),
  );
  return { tags, length: continues ? (chain?.length ?? 0) + 1 : 1 };
}

/**
 * What the attacker pays, on top of any slot cost, to bump the defender.
 * Stonebound dice are set like masonry: shifting one costs extra rather than
 * being outright impossible, so their resilience is a tax and not a wall.
 */
export function bumpCostFor(
  attacker: PlayerState,
  defender?: PlayerState,
): Partial<ResourcePool> {
  const base =
    attacker.factionAbilityId === 'arcane-resonance'
      ? ARCANE_BUMP_COST
      : BUMP_COST;
  return defender?.factionAbilityId === 'stonebound-craft'
    ? mergeCosts(base, STONEBOUND_BUMP_TAX)
    : base;
}

/**
 * Damage a die deals to a raid boss. Critical strikes bite twice as deep, and
 * Ember warbands add a flat bonus on top. Exported so the CPU evaluates raids
 * with exactly the rule the engine applies.
 */
export function raidDamageFor(player: PlayerState, die: Die): number {
  const value = dieValue(die);
  const base = isCriticalStrike(die) ? value * 2 : value;
  return (
    base + (player.factionAbilityId === 'martial-glory' ? EMBER_RAID_BONUS : 0)
  );
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

function createDice(
  playerId: PlayerId,
  faction: FactionDefinition,
): readonly Die[] {
  // Verdant fields an extra Nature die: more workers, each individually
  // smaller, which pairs with their reduced placement minimums.
  const affinities: readonly DieAffinity[] =
    faction.passiveAbilityId === 'verdant-adaptation'
      ? [...STARTING_AFFINITIES, 'nature']
      : STARTING_AFFINITIES;
  return affinities.map((affinity, index) => ({
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
    dice: createDice(id, faction),
    hand: [],
    playedCards: [],
    victoryPoints: 0,
    hasPassed: false,
    placementCounts: {},
    monstersSlain: 0,
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

/** Location ids whose raid boss has already been slain (health fully depleted). */
function slainRaids(
  locations: readonly BoardLocation[],
  raidDamage: Readonly<Record<string, number>>,
): Set<string> {
  const slain = new Set<string>();
  for (const location of locations) {
    const health = location.encounter?.health;
    if (health !== undefined && (raidDamage[location.id] ?? 0) >= health)
      slain.add(location.id);
  }
  return slain;
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
  slainRaidIds: ReadonlySet<string>,
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

  const lowRollSeeded = new Set<string>();
  for (const location of lowRollLocations) {
    if (openSlots.size >= profile.lowRollSlotCount) break;
    openFirstSlot(location);
    lowRollSeeded.add(location.id);
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

  // Guarantee a live monster hunt each round. If the shuffle sealed every
  // encounter (or the only active one is a slain raid), swap one in for a
  // non-critical resource location, matching its open-slot count so the active
  // and open totals — and the reserved low-roll routes — are all preserved.
  const isLiveHunt = (location: BoardLocation) =>
    Boolean(location.encounter) && !slainRaidIds.has(location.id);
  const huntActive = shuffledLocations.some(
    (location) => isLiveHunt(location) && activeIds.has(location.id),
  );
  if (!huntActive) {
    const inactiveHunt = shuffledLocations.find(
      (location) => isLiveHunt(location) && !activeIds.has(location.id),
    );
    const swappable = shuffledLocations.find(
      (location) =>
        !location.encounter &&
        activeIds.has(location.id) &&
        !lowRollSeeded.has(location.id),
    );
    if (inactiveHunt && swappable) {
      const openCount = [0, 1].filter((index) =>
        openSlots.has(slotKey(swappable.id, index)),
      ).length;
      activeIds.delete(swappable.id);
      openSlots.delete(slotKey(swappable.id, 0));
      openSlots.delete(slotKey(swappable.id, 1));
      openAnySlot(inactiveHunt, 0);
      if (openCount >= 2 && inactiveHunt.slots.length > 1)
        openAnySlot(inactiveHunt, 1);
    }
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
      // A fresh roll wipes any temporary boost from last round's cards.
      return {
        ...die,
        rolledFaceIndex: faceIndex,
        status: 'ready' as const,
        valueBonus: 0,
      };
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
  const objectivePool = options.content.objectives ?? [];
  const objectives: readonly ClaimableObjective[] = random
    .shuffle([...objectivePool])
    .slice(0, OBJECTIVE_COUNT)
    .map((objective) => ({ ...objective, claimedBy: null }));
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
  const seatedPlayers = [
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
  const players =
    seatedPlayers.length === 3
      ? seatedPlayers.map((player, seat) =>
          seat === 0
            ? {
                ...player,
                resources: adjustResources(
                  player.resources,
                  THREE_PLAYER_FIRST_SEAT_PURSE,
                  1,
                ),
              }
            : player,
        )
      : seatedPlayers;
  const roundLocations = configureRoundScarcity(
    options.content.locations,
    random,
    players.length,
    players.reduce((total, player) => total + player.dice.length, 0),
    new Set<string>(),
  );
  const rolled = rollPlayers(players, random, 1);
  const roundEvent: GameEvent = {
    type: 'round-started',
    sequence: 1,
    round: 1,
  };

  return {
    state: {
      schemaVersion: 4,
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
      objectives,
      raidDamage: {},
      raidRoundsSurvived: {},
      raidDamageAtRoundStart: {},
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

/**
 * The value a die actually acts with: its rolled face plus any temporary boost
 * from a card. Every rule that reads a die's number goes through here so a
 * boosted die clears gates, wins bumps, and hits monsters at its real strength.
 */
export function dieValue(die: Die): number {
  const face = currentFace(die);
  return face === null ? 0 : face.value + (die.valueBonus ?? 0);
}

/** A boosted die can strike critically, the same as a natural six. */
function isCriticalStrike(die: Die): boolean {
  const face = currentFace(die);
  return dieValue(die) >= 6 || (face?.symbols.includes('masterwork') ?? false);
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
  const isBump = action.type === 'bump-die';
  if (isBump) {
    if (slot.occupantDieId === null) {
      return {
        legal: false,
        code: 'invalid-target',
        message: 'There is no enemy die here to bump.',
      };
    }
    if (slot.occupantPlayerId === player.id) {
      return {
        legal: false,
        code: 'invalid-target',
        message: 'You already hold this slot.',
      };
    }
  } else if (slot.occupantDieId !== null) {
    return {
      legal: false,
      code: 'slot-occupied',
      message: 'That placement slot is already occupied.',
    };
  }

  const value = dieValue(die);
  const reduction =
    player.factionAbilityId === 'verdant-adaptation' &&
    die.affinity === 'nature'
      ? 1
      : 0;
  const minimum = Math.max(1, (slot.requirement.minimumValue ?? 1) - reduction);
  if (value < minimum) {
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
  const placementCost = isBump
    ? mergeCosts(
        slot.requirement.cost,
        bumpCostFor(
          player,
          state.players.find((item) => item.id === slot.occupantPlayerId),
        ),
      )
    : slot.requirement.cost;
  if (!hasResources(player.resources, placementCost)) {
    return {
      legal: false,
      code: 'insufficient-resources',
      message: isBump
        ? 'You cannot pay this slot cost plus the price of bumping.'
        : 'The player cannot pay this placement cost.',
    };
  }
  if (isBump) {
    const occupant = findDie(state, slot.occupantDieId);
    const occupantValue = occupant ? dieValue(occupant) : 0;
    if (value <= occupantValue) {
      return {
        legal: false,
        code: 'requirement-not-met',
        message: `Bumping needs a higher value than the defending die (${occupantValue}).`,
      };
    }
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
        const placement: GameAction = {
          type: 'place-die',
          playerId,
          dieId: die.id,
          locationId: location.id,
          slotId: slot.id,
        };
        if (validateAction(state, placement).legal) actions.push(placement);
        if (slot.occupantDieId !== null && slot.occupantPlayerId !== playerId) {
          const bump: GameAction = {
            type: 'bump-die',
            playerId,
            dieId: die.id,
            locationId: location.id,
            slotId: slot.id,
          };
          if (validateAction(state, bump).legal) actions.push(bump);
        }
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

function mergeCosts(
  base: Partial<ResourcePool> | undefined,
  extra: Partial<ResourcePool>,
): Partial<ResourcePool> {
  const merged: Record<string, number> = { ...base };
  for (const resource of RESOURCE_TYPES)
    if (extra[resource])
      merged[resource] = (merged[resource] ?? 0) + (extra[resource] ?? 0);
  return merged as Partial<ResourcePool>;
}

function findDie(state: GameState, dieId: DieId | null): Die | null {
  if (dieId === null) return null;
  for (const player of state.players) {
    const die = player.dice.find((item) => item.id === dieId);
    if (die) return die;
  }
  return null;
}

function forgedFaceCount(player: PlayerState): number {
  return player.dice.reduce((total, die) => total + die.enhancements.length, 0);
}

function meetsObjective(
  player: PlayerState,
  condition: ObjectiveCondition,
  cards: readonly Card[],
): boolean {
  if (condition.type === 'monsters-slain')
    return player.monstersSlain >= condition.amount;
  if (condition.type === 'total-resource')
    return player.resources[condition.resource] >= condition.amount;
  if (condition.type === 'upgrades-forged')
    return forgedFaceCount(player) >= condition.amount;
  if (condition.type === 'cards-played')
    return player.playedCards.length >= condition.amount;
  if (condition.type === 'category-cards-played') {
    const matchingCards = new Set(
      cards
        .filter((card) => card.category === condition.category)
        .map((card) => card.id),
    );
    return (
      player.playedCards.filter((cardId) => matchingCards.has(cardId)).length >=
      condition.amount
    );
  }
  return (player.placementCounts[condition.tag] ?? 0) >= condition.amount;
}

/**
 * After an action resolves, award any unclaimed shared objective the acting
 * player now satisfies. Objectives are first-come: the earliest player to meet
 * a condition claims its victory points for good.
 */
function resolveObjectives(
  objectives: readonly ClaimableObjective[],
  players: readonly PlayerState[],
  playerId: PlayerId,
  cards: readonly Card[],
  startingSequence: number,
): {
  readonly objectives: readonly ClaimableObjective[];
  readonly players: readonly PlayerState[];
  readonly events: readonly GameEvent[];
  readonly sequence: number;
} {
  const player = players.find((item) => item.id === playerId);
  if (!player)
    return { objectives, players, events: [], sequence: startingSequence };
  let sequence = startingSequence;
  const events: GameEvent[] = [];
  let victoryPoints = 0;
  const updatedObjectives = objectives.map((objective) => {
    if (objective.claimedBy !== null) return objective;
    if (!meetsObjective(player, objective.condition, cards)) return objective;
    victoryPoints += objective.victoryPoints;
    sequence += 1;
    events.push({
      type: 'objective-claimed',
      sequence,
      playerId,
      objectiveId: objective.id,
      victoryPoints: objective.victoryPoints,
    });
    return { ...objective, claimedBy: playerId };
  });
  const updatedPlayers =
    victoryPoints > 0
      ? players.map((item) =>
          item.id === playerId
            ? { ...item, victoryPoints: item.victoryPoints + victoryPoints }
            : item,
        )
      : players;
  return {
    objectives: updatedObjectives,
    players: updatedPlayers,
    events,
    sequence,
  };
}

function cappedAmount(amount: number, maxAmount?: number): number {
  return Math.max(0, Math.min(maxAmount ?? amount, amount));
}

/**
 * The score breakdown for one player from the current state. Exported so the
 * interface can show a live standing mid-match: the winning condition is not
 * victory-point tokens alone, so showing only those would tell the player the
 * wrong story about who is ahead.
 */
export function scorePlayer(
  state: GameState,
  playerId: PlayerId,
): readonly ScoreBreakdown[] {
  const player = state.players.find((item) => item.id === playerId);
  if (!player) return [];
  const resourceTotal = RESOURCE_TYPES.reduce(
    (total, resource) => total + player.resources[resource],
    0,
  );
  let factionPoints = 0;
  if (player.factionAbilityId === 'arcane-resonance')
    factionPoints = Math.floor(player.resources.mana / 2);
  if (player.factionAbilityId === 'martial-glory')
    factionPoints = Math.floor((player.placementCounts.martial ?? 0) / 2);
  if (player.factionAbilityId === 'verdant-adaptation') {
    // Breadth, not depth: score each resource type held in real quantity.
    // Counting types that are merely non-zero capped this at 1 point, which
    // made the faction's scoring rule a trap next to the other three.
    factionPoints = RESOURCE_TYPES.filter(
      (resource) => player.resources[resource] >= 3,
    ).length;
  }
  if (player.factionAbilityId === 'stonebound-craft') {
    // Stonebound already convert materials into forged faces, which score on
    // their own and now also drive critical strikes, so hoarding pays slower.
    factionPoints = Math.floor(player.resources.materials / 5);
  }
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
  return [
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

/** Total of a player's score breakdown at the current moment. */
export function scoreTotal(state: GameState, playerId: PlayerId): number {
  return scorePlayer(state, playerId).reduce(
    (total, item) => total + item.points,
    0,
  );
}

function scoreMatch(state: GameState): MatchResult {
  const scores = {} as Record<PlayerId, readonly ScoreBreakdown[]>;
  for (const player of state.players)
    scores[player.id] = scorePlayer(state, player.id);
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

/**
 * Multi-player initiative runs out and then back across the table when the
 * match has two rounds per seat. A simple endless clockwise rotation gives
 * the final-round opening move to the seat that already benefited from acting
 * later through the early game. The mirrored order (A-B-C-C-B-A) gives every
 * seat one early and one late opening without changing two-player tempo.
 */
function nextRoundFirstPlayer(state: GameState): PlayerState {
  const nextRound = state.round.number + 1;
  if (
    state.players.length >= 3 &&
    state.round.maximum === state.players.length * 2
  ) {
    const outwardIndex = nextRound - 1;
    const mirroredIndex =
      outwardIndex < state.players.length
        ? outwardIndex
        : state.round.maximum - nextRound;
    return state.players[mirroredIndex] as PlayerState;
  }

  const firstPlayerIndex = state.players.findIndex(
    (player) => player.id === state.round.firstPlayerId,
  );
  return state.players[
    (firstPlayerIndex + 1) % state.players.length
  ] as PlayerState;
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
  const nextFirst = nextRoundFirstPlayer(state);
  const random = new SeededRandom({
    algorithm: 'xorshift32',
    state: state.rngState,
  });
  const resetPlayers = state.players.map((player) => ({
    ...player,
    hasPassed: false,
    // Each round is its own run: last round's theme does not carry over.
    chain: { tags: [], length: 0 },
  }));

  // A surviving raid boss takes its turn too: it hoards more treasure, and if
  // nobody wounded it this round it claws health back. Leaving it alone is a
  // choice with a cost, which is what stops the board being pure accumulation.
  let raidDamage = state.raidDamage;
  const roundsSurvived: Record<string, number> = {
    ...(state.raidRoundsSurvived ?? {}),
  };
  const wrathEvents: GameEvent[] = [];
  let wrathSequence = state.eventSequence;
  for (const location of state.locations) {
    const health = location.encounter?.health;
    if (health === undefined) continue;
    const damage = raidDamage[location.id] ?? 0;
    if (damage >= health) continue;
    const before = state.raidDamageAtRoundStart?.[location.id] ?? 0;
    const ignored = damage <= before;
    const survived = (roundsSurvived[location.id] ?? 0) + 1;
    roundsSurvived[location.id] = survived;
    const healed = ignored ? Math.min(damage, RAID_REGENERATION) : 0;
    if (healed > 0)
      raidDamage = { ...raidDamage, [location.id]: damage - healed };
    const remaining = health - (raidDamage[location.id] ?? 0);
    wrathSequence += 1;
    wrathEvents.push({
      type: 'raid-enraged',
      sequence: wrathSequence,
      locationId: location.id,
      beast: location.encounter?.beasts[0] ?? location.name,
      regenerated: healed,
      remaining,
      health,
      bountyVictoryPoints: raidBountyFor(location, survived),
      roundsSurvived: survived,
    });
  }

  const roundLocations = configureRoundScarcity(
    state.locations,
    random,
    state.players.length,
    state.players.reduce((total, player) => total + player.dice.length, 0),
    slainRaids(state.locations, raidDamage),
  );
  const roundSequence = wrathSequence + 1;
  const rolled = rollPlayers(resetPlayers, random, roundSequence);
  return {
    state: {
      ...state,
      players: rolled.players,
      locations: roundLocations,
      rngState: random.snapshot().state,
      raidDamage,
      raidRoundsSurvived: roundsSurvived,
      raidDamageAtRoundStart: raidDamage,
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
      ...wrathEvents,
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
  let raidDamage = state.raidDamage;
  let objectives = state.objectives;

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
    /** Resources taken from each rival this card, applied after its effects. */
    const stolen = new Map<PlayerId, Partial<ResourcePool>>();
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
      } else if (effect.type === 'gain-victory-points-per-monster') {
        const amount = cappedAmount(
          updatedPlayer.monstersSlain * effect.amountPerMonster,
          effect.maxAmount,
        );
        if (amount > 0) {
          updatedPlayer = {
            ...updatedPlayer,
            victoryPoints: updatedPlayer.victoryPoints + amount,
          };
          sequence += 1;
          events.push({
            type: 'victory-points-gained',
            sequence,
            playerId: action.playerId,
            amount,
          });
        }
      } else if (effect.type === 'gain-victory-points-per-upgrade') {
        const amount = cappedAmount(
          forgedFaceCount(updatedPlayer) * effect.amountPerUpgrade,
          effect.maxAmount,
        );
        if (amount > 0) {
          updatedPlayer = {
            ...updatedPlayer,
            victoryPoints: updatedPlayer.victoryPoints + amount,
          };
          sequence += 1;
          events.push({
            type: 'victory-points-gained',
            sequence,
            playerId: action.playerId,
            amount,
          });
        }
      } else if (effect.type === 'gain-resource-per-tag-placement') {
        const amount = cappedAmount(
          (updatedPlayer.placementCounts[effect.tag] ?? 0) *
            effect.amountPerPlacement,
          effect.maxAmount,
        );
        if (amount > 0) {
          updatedPlayer = {
            ...updatedPlayer,
            resources: adjustResources(
              updatedPlayer.resources,
              { [effect.resource]: amount },
              1,
            ),
          };
          sequence += 1;
          events.push({
            type: 'resource-gained',
            sequence,
            playerId: action.playerId,
            resource: effect.resource,
            amount,
          });
        }
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
      } else if (effect.type === 'boost-die' && action.targetDieId) {
        const target = updatedPlayer.dice.find(
          (die) => die.id === action.targetDieId,
        ) as Die;
        const boosted: Die = {
          ...target,
          valueBonus: (target.valueBonus ?? 0) + effect.amount,
        };
        updatedPlayer = {
          ...updatedPlayer,
          dice: updatedPlayer.dice.map((die) =>
            die.id === target.id ? boosted : die,
          ),
        };
        sequence += 1;
        events.push({
          type: 'die-boosted',
          sequence,
          playerId: action.playerId,
          dieId: target.id,
          amount: effect.amount,
          value: dieValue(boosted),
        });
      } else if (effect.type === 'damage-raid') {
        // Siege weapons soften the beast but cannot finish it: the killing
        // blow, and its bounty, must still be struck with a die.
        const raid = locations.find(
          (item) =>
            item.encounter?.health !== undefined &&
            (raidDamage[item.id] ?? 0) < item.encounter.health,
        );
        const health = raid?.encounter?.health;
        if (raid && health !== undefined) {
          const already = raidDamage[raid.id] ?? 0;
          const total = Math.min(health - 1, already + effect.amount);
          if (total > already) {
            raidDamage = { ...raidDamage, [raid.id]: total };
            sequence += 1;
            events.push({
              type: 'raid-damaged',
              sequence,
              playerId: action.playerId,
              locationId: raid.id,
              beast: raid.encounter?.beasts[0] ?? raid.name,
              damage: total - already,
              remaining: health - total,
              health,
            });
          }
        }
      } else if (effect.type === 'steal-resource') {
        for (const rival of players) {
          if (rival.id === action.playerId) continue;
          const taken = Math.min(
            effect.amount,
            rival.resources[effect.resource],
          );
          if (taken <= 0) continue;
          const rivalLoss = stolen.get(rival.id) ?? {};
          stolen.set(rival.id, {
            ...rivalLoss,
            [effect.resource]: (rivalLoss[effect.resource] ?? 0) + taken,
          });
          updatedPlayer = {
            ...updatedPlayer,
            resources: adjustResources(
              updatedPlayer.resources,
              { [effect.resource]: taken },
              1,
            ),
          };
          sequence += 1;
          events.push({
            type: 'resource-stolen',
            sequence,
            playerId: action.playerId,
            victimPlayerId: rival.id,
            resource: effect.resource,
            amount: taken,
          });
        }
      }
    }
    players = players.map((player) => {
      if (player.id === action.playerId) return updatedPlayer;
      const loss = stolen.get(player.id);
      return loss
        ? {
            ...player,
            resources: adjustResources(player.resources, loss, -1),
          }
        : player;
    });
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
  } else if (action.type === 'place-die' || action.type === 'bump-die') {
    const isBump = action.type === 'bump-die';
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
    const victimPlayerId = isBump ? (slot?.occupantPlayerId ?? null) : null;
    const victimDieId = isBump ? (slot?.occupantDieId ?? null) : null;
    const cost = isBump
      ? mergeCosts(
          slot?.requirement.cost,
          bumpCostFor(
            actingPlayer,
            players.find((item) => item.id === victimPlayerId),
          ),
        )
      : (slot?.requirement.cost ?? {});
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
      location.tags.includes('arcane')
    )
      bonus.mana = (bonus.mana ?? 0) + 1;
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

    // Combat. A hunt slays the beast guarding each slot, paying overkill loot
    // and a critical bonus. A raid instead chips a shared health pool that
    // carries across rounds; the blow that empties it wins the bounty.
    let slainBeast: string | null = null;
    let overkill = 0;
    let critical = false;
    let raidChip: {
      readonly beast: string;
      readonly damage: number;
      readonly remaining: number;
      readonly health: number;
    } | null = null;
    if (location.encounter) {
      const encounter = location.encounter;
      const slotIndex = location.slots.findIndex(
        (item) => item.id === action.slotId,
      );
      const reduction =
        actingPlayer.factionAbilityId === 'verdant-adaptation' &&
        die.affinity === 'nature'
          ? 1
          : 0;
      const threat = Math.max(
        1,
        (slot?.requirement.minimumValue ?? 1) - reduction,
      );
      critical = isCriticalStrike(die);
      if (encounter.health !== undefined) {
        const health = encounter.health;
        const already = raidDamage[location.id] ?? 0;
        if (already < health) {
          const damage = raidDamageFor(actingPlayer, die);
          const total = Math.min(health, already + damage);
          raidDamage = { ...raidDamage, [location.id]: total };
          const beast = encounter.beasts[0] ?? encounter.title;
          if (total >= health) {
            slainBeast = beast;
            if (encounter.bounty) {
              // The hoard has grown for every round the beast stayed alive.
              bonusPoints += raidBountyFor(
                location,
                state.raidRoundsSurvived?.[location.id] ?? 0,
              );
              for (const resource of RESOURCE_TYPES) {
                const amount = encounter.bounty.loot?.[resource] ?? 0;
                if (amount) bonus[resource] = (bonus[resource] ?? 0) + amount;
              }
            }
          } else {
            raidChip = { beast, damage, remaining: health - total, health };
          }
        }
      } else {
        overkill = Math.max(0, dieValue(die) - threat);
        if (overkill > 0)
          bonus[encounter.loot] = (bonus[encounter.loot] ?? 0) + overkill;
        if (critical) bonusPoints += encounter.criticalBonus;
        slainBeast = encounter.beasts[slotIndex] ?? encounter.title;
      }
    }
    const slewMonster = slainBeast !== null;

    // A themed run of placements pays out as it lengthens, so the order dice
    // are committed in matters as much as which slots they land on.
    const chain = extendChain(actingPlayer.chain, location.tags);
    const chainBonus = chainBonusFor(chain.length);
    bonusPoints += chainBonus;

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
      if (player.id === action.playerId) {
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
          monstersSlain: player.monstersSlain + (slewMonster ? 1 : 0),
          chain,
          dice: player.dice.map((item) =>
            item.id === action.dieId
              ? { ...item, status: 'placed' as const }
              : item,
          ),
        };
      }
      if (isBump && player.id === victimPlayerId) {
        // Verdant bends rather than breaks: being driven off a slot still
        // yields them something for the trouble.
        const resilient = player.factionAbilityId === 'verdant-adaptation';
        return {
          ...player,
          resources: resilient
            ? adjustResources(player.resources, { influence: 1 }, 1)
            : player.resources,
          dice: player.dice.map((item) =>
            item.id === victimDieId
              ? { ...item, status: 'ready' as const }
              : item,
          ),
        };
      }
      return player;
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
    if (isBump && victimPlayerId && victimDieId) {
      sequence += 1;
      events.push({
        type: 'die-bumped',
        sequence,
        playerId: action.playerId,
        victimPlayerId,
        dieId: victimDieId,
        locationId: action.locationId,
        slotId: action.slotId,
      });
    }
    sequence += 1;
    events.push({
      type: 'die-placed',
      sequence,
      playerId: action.playerId,
      dieId: action.dieId,
      locationId: action.locationId,
      slotId: action.slotId,
    });
    if (slainBeast) {
      sequence += 1;
      events.push({
        type: 'monster-slain',
        sequence,
        playerId: action.playerId,
        locationId: action.locationId,
        beast: slainBeast,
        overkill,
        critical,
        bonusVictoryPoints: (location.reward.victoryPoints ?? 0) + bonusPoints,
      });
    }
    if (chain.length >= 2) {
      sequence += 1;
      events.push({
        type: 'chain-extended',
        sequence,
        playerId: action.playerId,
        tag: location.tags[0] ?? '',
        length: chain.length,
        bonusVictoryPoints: chainBonus,
      });
    }
    if (raidChip) {
      sequence += 1;
      events.push({
        type: 'raid-damaged',
        sequence,
        playerId: action.playerId,
        locationId: action.locationId,
        beast: raidChip.beast,
        damage: raidChip.damage,
        remaining: raidChip.remaining,
        health: raidChip.health,
      });
    }
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

  const objectiveOutcome = resolveObjectives(
    objectives,
    players,
    action.playerId,
    state.cards,
    sequence,
  );
  objectives = objectiveOutcome.objectives;
  players = objectiveOutcome.players;
  sequence = objectiveOutcome.sequence;
  events.push(...objectiveOutcome.events);

  const intermediate: GameState = {
    ...state,
    players,
    locations,
    cardDeck,
    cardMarket,
    cardDiscard,
    rngState,
    objectives,
    raidDamage,
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
    candidate.schemaVersion !== 4 ||
    !Array.isArray(candidate.players) ||
    !Array.isArray(candidate.locations) ||
    !Array.isArray(candidate.cards) ||
    !Array.isArray(candidate.cardDeck) ||
    !Array.isArray(candidate.cardMarket) ||
    !Array.isArray(candidate.cardDiscard) ||
    !Array.isArray(candidate.upgrades) ||
    !Array.isArray(candidate.objectives)
  ) {
    throw new Error('Saved game has an unsupported or invalid schema.');
  }
  if (
    typeof candidate.rngState !== 'number' ||
    candidate.result === undefined ||
    typeof candidate.raidDamage !== 'object' ||
    candidate.raidDamage === null
  ) {
    throw new Error('Saved game is missing deterministic state.');
  }
  return candidate as GameState;
}
