import type {
  BoardLocation,
  Card,
  CardId,
  FactionDefinition,
  FactionId,
  LocationId,
  PlacementRequirement,
  ResourcePool,
  SlotId,
  UpgradeDefinition,
  UpgradeId,
} from '@shattered-crown/shared-types';

export const CONTENT_SCHEMA_VERSION = 2 as const;

const factionId = (value: string) => value as FactionId;
const cardId = (value: string) => value as CardId;
const locationId = (value: string) => value as LocationId;
const slotId = (value: string) => value as SlotId;
const upgradeId = (value: string) => value as UpgradeId;

export const factions = [
  {
    id: factionId('arcanum-conclave'),
    name: 'Arcanum Conclave',
    passiveAbilityId: 'arcane-resonance',
    passiveAbility:
      'Gain 1 additional mana when placing an Arcane die at an Arcane location.',
    roundAbility: 'Begin with Revelation of Stars in hand.',
    startingCardId: cardId('arcanum-starting-card'),
    scoringRule: 'Score 1 point for every 3 mana at the end of the match.',
  },
  {
    id: factionId('ember-dominion'),
    name: 'Ember Dominion',
    passiveAbilityId: 'martial-glory',
    passiveAbility:
      'Gain 1 victory point when placing a Martial die at a Martial location.',
    roundAbility: 'Begin with Draconic Challenge in hand.',
    startingCardId: cardId('ember-starting-card'),
    scoringRule:
      'Score 1 point for every 2 Martial placements made during the match.',
  },
  {
    id: factionId('verdant-covenant'),
    name: 'Verdant Covenant',
    passiveAbilityId: 'verdant-adaptation',
    passiveAbility: 'Nature dice treat placement minimums as 1 lower.',
    roundAbility: 'Begin with Gifts of the Grove in hand.',
    startingCardId: cardId('verdant-starting-card'),
    scoringRule: 'Score 1 point for every 3 different resource types held.',
  },
  {
    id: factionId('stonebound-league'),
    name: 'Stonebound League',
    passiveAbilityId: 'stonebound-craft',
    passiveAbility: 'Gain 1 additional material when placing at Forge Hall.',
    roundAbility: 'Begin with Masterwork Blueprint in hand.',
    startingCardId: cardId('stonebound-starting-card'),
    scoringRule: 'Score 1 point for every 3 materials at the end of the match.',
  },
] as const satisfies readonly FactionDefinition[];

export const cards = [
  {
    id: cardId('arcanum-starting-card'),
    name: 'Revelation of Stars',
    category: 'tactic',
    cost: {},
    effects: [
      { type: 'gain-resource', resource: 'mana', amount: 2 },
      { type: 'draw-card', amount: 1 },
    ],
    rulesText: 'Gain 2 mana, then draw a card.',
    target: 'none',
    marketCopies: 0,
  },
  {
    id: cardId('ember-starting-card'),
    name: 'Draconic Challenge',
    category: 'tactic',
    cost: {},
    effects: [{ type: 'gain-victory-points', amount: 2 }],
    rulesText: 'Gain 2 victory points.',
    target: 'none',
    marketCopies: 0,
  },
  {
    id: cardId('verdant-starting-card'),
    name: 'Gifts of the Grove',
    category: 'tactic',
    cost: {},
    effects: [
      { type: 'gain-resource', resource: 'materials', amount: 1 },
      { type: 'gain-resource', resource: 'influence', amount: 1 },
    ],
    rulesText: 'Gain 1 material and 1 influence.',
    target: 'none',
    marketCopies: 0,
  },
  {
    id: cardId('stonebound-starting-card'),
    name: 'Masterwork Blueprint',
    category: 'tactic',
    cost: {},
    effects: [{ type: 'gain-resource', resource: 'materials', amount: 2 }],
    rulesText: 'Gain 2 materials.',
    target: 'none',
    marketCopies: 0,
  },
  {
    id: cardId('crystal-focus'),
    name: 'Crystal Focus',
    category: 'relic',
    cost: { knowledge: 1 },
    effects: [{ type: 'gain-resource', resource: 'mana', amount: 2 }],
    rulesText: 'Gain 2 mana.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('scholars-map'),
    name: "Scholar's Map",
    category: 'ally',
    cost: { gold: 1 },
    effects: [{ type: 'gain-resource', resource: 'knowledge', amount: 2 }],
    rulesText: 'Gain 2 knowledge.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('merchant-pact'),
    name: 'Merchant Pact',
    category: 'ally',
    cost: { influence: 1 },
    effects: [{ type: 'gain-resource', resource: 'gold', amount: 2 }],
    rulesText: 'Gain 2 gold.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('court-favor'),
    name: 'Court Favor',
    category: 'ally',
    cost: { gold: 1 },
    effects: [{ type: 'gain-resource', resource: 'influence', amount: 2 }],
    rulesText: 'Gain 2 influence.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('battlefield-salvage'),
    name: 'Battlefield Salvage',
    category: 'tactic',
    cost: { gold: 1 },
    effects: [{ type: 'gain-resource', resource: 'materials', amount: 2 }],
    rulesText: 'Gain 2 materials.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('fortunes-turn'),
    name: "Fortune's Turn",
    category: 'tactic',
    cost: { mana: 1 },
    effects: [{ type: 'reroll-die' }],
    rulesText: 'Reroll one ready die.',
    target: 'ready-die',
    marketCopies: 2,
  },
  {
    id: cardId('shared-wisdom'),
    name: 'Shared Wisdom',
    category: 'ally',
    cost: { influence: 1 },
    effects: [
      { type: 'gain-resource', resource: 'knowledge', amount: 1 },
      { type: 'draw-card', amount: 1 },
    ],
    rulesText: 'Gain 1 knowledge, then draw a card.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('crowns-claim'),
    name: "Crown's Claim",
    category: 'relic',
    cost: { gold: 1, influence: 1 },
    effects: [{ type: 'gain-victory-points', amount: 2 }],
    rulesText: 'Gain 2 victory points.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('river-bargain'),
    name: 'River Bargain',
    category: 'tactic',
    cost: { knowledge: 1 },
    effects: [
      { type: 'gain-resource', resource: 'gold', amount: 1 },
      { type: 'gain-resource', resource: 'influence', amount: 1 },
    ],
    rulesText: 'Gain 1 gold and 1 influence.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('mystic-recovery'),
    name: 'Mystic Recovery',
    category: 'tactic',
    cost: { knowledge: 1 },
    effects: [
      { type: 'gain-resource', resource: 'mana', amount: 1 },
      { type: 'gain-resource', resource: 'materials', amount: 1 },
    ],
    rulesText: 'Gain 1 mana and 1 material.',
    target: 'none',
    marketCopies: 2,
  },
] as const satisfies readonly Card[];

export const upgrades = [
  {
    id: upgradeId('tempered-two'),
    name: 'Tempered Pair',
    description: 'A reliable value-2 face with a material sigil.',
    cost: { materials: 1 },
    replacement: { value: 2, symbols: ['materials'] },
    scoreValue: 1,
  },
  {
    id: upgradeId('gilded-three'),
    name: 'Gilded Three',
    description: 'A value-3 face bearing a gold sigil.',
    cost: { materials: 1, gold: 1 },
    replacement: { value: 3, symbols: ['gold'] },
    scoreValue: 1,
  },
  {
    id: upgradeId('arcane-four'),
    name: 'Arcane Four',
    description: 'A value-4 face bearing a mana sigil.',
    cost: { materials: 2, mana: 1 },
    replacement: { value: 4, symbols: ['mana'] },
    scoreValue: 2,
  },
  {
    id: upgradeId('learned-four'),
    name: 'Learned Four',
    description: 'A value-4 face bearing a knowledge sigil.',
    cost: { materials: 2, knowledge: 1 },
    replacement: { value: 4, symbols: ['knowledge'] },
    scoreValue: 2,
  },
  {
    id: upgradeId('courtly-five'),
    name: 'Courtly Five',
    description: 'A value-5 face bearing an influence sigil.',
    cost: { materials: 3, influence: 1 },
    replacement: { value: 5, symbols: ['influence'] },
    scoreValue: 2,
  },
  {
    id: upgradeId('masterwork-six'),
    name: 'Masterwork Six',
    description: 'A powerful value-6 masterwork face.',
    cost: { materials: 4, gold: 1 },
    replacement: { value: 6, symbols: ['masterwork'] },
    scoreValue: 3,
  },
] as const satisfies readonly UpgradeDefinition[];

interface LocationInput {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly reward: Partial<ResourcePool> & { readonly victoryPoints?: number };
  readonly first?: PlacementRequirement;
  readonly second?: PlacementRequirement;
}

function defineLocation(input: LocationInput): BoardLocation {
  return {
    id: locationId(input.id),
    name: input.name,
    description: input.description,
    tags: input.tags,
    reward: input.reward,
    slots: [
      {
        id: slotId(`${input.id}-1`),
        occupantDieId: null,
        occupantPlayerId: null,
        requirement: input.first ?? {},
      },
      {
        id: slotId(`${input.id}-2`),
        occupantDieId: null,
        occupantPlayerId: null,
        requirement: input.second ?? input.first ?? {},
      },
    ],
  };
}

export const locations = [
  defineLocation({
    id: 'crystal-cavern',
    name: 'Crystal Cavern',
    description: 'Gather mana from living crystal veins.',
    tags: ['arcane'],
    reward: { mana: 2 },
    first: { affinities: ['arcane', 'neutral'] },
    second: { minimumValue: 3 },
  }),
  defineLocation({
    id: 'mage-tower',
    name: 'Mage Tower',
    description: 'Channel arcane power into future plans.',
    tags: ['arcane'],
    reward: { mana: 1, knowledge: 1 },
    first: { minimumValue: 2 },
    second: { minimumValue: 4 },
  }),
  defineLocation({
    id: 'ancient-library',
    name: 'Ancient Library',
    description: 'Recover lore from the shattered age.',
    tags: ['knowledge'],
    reward: { knowledge: 2 },
    first: { minimumValue: 2 },
    second: { minimumValue: 3 },
  }),
  defineLocation({
    id: 'sacred-shrine',
    name: 'Sacred Shrine',
    description: 'Petition the old powers for influence.',
    tags: ['influence'],
    reward: { influence: 2 },
    first: { affinities: ['influence', 'neutral'] },
    second: { minimumValue: 3 },
  }),
  defineLocation({
    id: 'dwarven-mines',
    name: 'Dwarven Mines',
    description: 'Extract coin and hard-won ore.',
    tags: ['craft'],
    reward: { gold: 1, materials: 2 },
    first: { minimumValue: 2 },
    second: { minimumValue: 4 },
  }),
  defineLocation({
    id: 'forge-hall',
    name: 'Forge Hall',
    description: 'Prepare materials for future upgrades.',
    tags: ['craft', 'forge'],
    reward: { materials: 2 },
    first: { cost: { gold: 1 } },
    second: { minimumValue: 3, cost: { gold: 1 } },
  }),
  defineLocation({
    id: 'goldgate-market',
    name: 'Goldgate Market',
    description: 'Turn influence into coin and opportunity.',
    tags: ['trade'],
    reward: { gold: 2 },
    first: { cost: { influence: 1 } },
    second: { minimumValue: 3 },
  }),
  defineLocation({
    id: 'harbor',
    name: 'Harbor',
    description: 'Welcome merchants bearing flexible wealth.',
    tags: ['trade'],
    reward: { gold: 1, influence: 1 },
    first: { minimumValue: 1 },
    second: { minimumValue: 4 },
  }),
  defineLocation({
    id: 'wildwood-grove',
    name: 'Wildwood Grove',
    description: 'Gather adaptable gifts from the living forest.',
    tags: ['nature'],
    reward: { mana: 1, materials: 1 },
    first: { affinities: ['nature', 'neutral'] },
    second: { minimumValue: 2 },
  }),
  defineLocation({
    id: 'ruined-stronghold',
    name: 'Ruined Stronghold',
    description: 'Challenge the creatures occupying the old walls.',
    tags: ['martial', 'combat'],
    reward: { gold: 1, victoryPoints: 2 },
    first: { minimumValue: 4 },
    second: { minimumValue: 5, affinities: ['martial', 'neutral'] },
  }),
  defineLocation({
    id: 'dragon-pass',
    name: 'Dragon Pass',
    description: 'Risk the high road for renown.',
    tags: ['martial', 'combat'],
    reward: { influence: 1, victoryPoints: 3 },
    first: { minimumValue: 5 },
    second: { minimumValue: 6 },
  }),
  defineLocation({
    id: 'watchtower',
    name: 'Watchtower',
    description: 'Survey the realm and earn the court’s favor.',
    tags: ['influence'],
    reward: { knowledge: 1, influence: 1 },
    first: { minimumValue: 1 },
    second: { minimumValue: 3 },
  }),
] as const satisfies readonly BoardLocation[];

export function getFaction(id: FactionId): FactionDefinition | undefined {
  return factions.find((faction) => faction.id === id);
}
