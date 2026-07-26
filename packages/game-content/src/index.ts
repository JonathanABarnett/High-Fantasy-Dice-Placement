import type {
  BoardLocation,
  Card,
  CardId,
  FactionDefinition,
  FactionId,
  LocationId,
  MonsterEncounter,
  Objective,
  ObjectiveId,
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
const objectiveId = (value: string) => value as ObjectiveId;

export const factions = [
  {
    id: factionId('arcanum-conclave'),
    name: 'Arcanum Conclave',
    passiveAbilityId: 'arcane-resonance',
    passiveAbility:
      'Gain 1 additional mana at any Arcane location, or 2 with an Arcane die, and bump rivals for 1 mana instead of 1 influence.',
    roundAbility: 'Begin with Revelation of Stars in hand.',
    startingCardId: cardId('arcanum-starting-card'),
    scoringRule: 'Score 1 point for every 2 mana at the end of the match.',
  },
  {
    id: factionId('ember-dominion'),
    name: 'Ember Dominion',
    passiveAbilityId: 'martial-glory',
    passiveAbility:
      'Gain 1 victory point when placing a Martial die at a Martial location, and deal 2 extra damage to raid bosses.',
    roundAbility: 'Begin with Draconic Challenge in hand.',
    startingCardId: cardId('ember-starting-card'),
    scoringRule:
      'Score 1 point for every 2 Martial placements made during the match.',
  },
  {
    id: factionId('verdant-covenant'),
    name: 'Verdant Covenant',
    passiveAbilityId: 'verdant-adaptation',
    passiveAbility:
      'Field a sixth Nature die. Nature dice treat placement minimums as 1 lower, and you gain 1 influence whenever one of your dice is bumped.',
    roundAbility: 'Begin with Gifts of the Grove in hand.',
    startingCardId: cardId('verdant-starting-card'),
    scoringRule:
      'Score 1 point for each resource type you hold 3 or more of at the end of the match.',
  },
  {
    id: factionId('stonebound-league'),
    name: 'Stonebound League',
    passiveAbilityId: 'stonebound-craft',
    passiveAbility:
      'Gain 1 additional material when placing at Forge Hall, and rivals must pay 1 extra influence to bump your dice.',
    roundAbility: 'Begin with Masterwork Blueprint in hand.',
    startingCardId: cardId('stonebound-starting-card'),
    scoringRule: 'Score 1 point for every 5 materials at the end of the match.',
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
  {
    id: cardId('war-cry'),
    name: 'War Cry',
    category: 'tactic',
    cost: { gold: 1 },
    effects: [{ type: 'boost-die', amount: 2 }],
    rulesText: 'A ready die gains +2 value this round.',
    target: 'ready-die',
    marketCopies: 3,
  },
  {
    id: cardId('elixir-of-might'),
    name: 'Elixir of Might',
    category: 'relic',
    cost: { mana: 1, materials: 1 },
    effects: [{ type: 'boost-die', amount: 3 }],
    rulesText: 'A ready die gains +3 value this round.',
    target: 'ready-die',
    marketCopies: 2,
  },
  {
    id: cardId('ballista-volley'),
    name: 'Ballista Volley',
    category: 'tactic',
    cost: { materials: 1 },
    effects: [
      { type: 'damage-raid', amount: 6 },
      { type: 'gain-resource', resource: 'gold', amount: 1 },
    ],
    rulesText: 'Deal 6 damage to the raid boss, then gain 1 gold.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('dragon-bait'),
    name: 'Dragon Bait',
    category: 'tactic',
    cost: { knowledge: 1 },
    effects: [
      { type: 'damage-raid', amount: 4 },
      { type: 'draw-card', amount: 1 },
    ],
    rulesText: 'Deal 4 damage to the raid boss, then draw a card.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('cutpurse'),
    name: 'Cutpurse',
    category: 'ally',
    cost: { influence: 1 },
    effects: [{ type: 'steal-resource', resource: 'gold', amount: 2 }],
    rulesText: 'Steal 2 gold from every rival.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('court-saboteur'),
    name: 'Court Saboteur',
    category: 'ally',
    cost: { gold: 1 },
    effects: [
      { type: 'steal-resource', resource: 'influence', amount: 1 },
      { type: 'gain-resource', resource: 'knowledge', amount: 1 },
    ],
    rulesText: 'Steal 1 influence from every rival, then gain 1 knowledge.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('trophy-cabinet'),
    name: 'Trophy Cabinet',
    category: 'relic',
    cost: { knowledge: 1, influence: 1 },
    effects: [
      {
        type: 'gain-victory-points-per-monster',
        amountPerMonster: 2,
        maxAmount: 8,
      },
    ],
    rulesText:
      'Gain 2 victory points for each monster you have slain, up to 8.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('forge-charter'),
    name: 'Forge Charter',
    category: 'ally',
    cost: { knowledge: 1, materials: 1 },
    effects: [
      {
        type: 'gain-victory-points-per-upgrade',
        amountPerUpgrade: 1,
        maxAmount: 5,
      },
      { type: 'gain-resource', resource: 'materials', amount: 1 },
    ],
    rulesText:
      'Gain 1 victory point per forged die face, up to 5, then gain 1 material.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('veteran-captain'),
    name: 'Veteran Captain',
    category: 'ally',
    cost: { gold: 1, influence: 1 },
    effects: [
      {
        type: 'gain-resource-per-tag-placement',
        tag: 'combat',
        resource: 'gold',
        amountPerPlacement: 1,
        maxAmount: 4,
      },
      { type: 'draw-card', amount: 1 },
    ],
    rulesText:
      'Gain 1 gold per combat placement you have made, up to 4, then draw a card.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('siege-banner'),
    name: 'Siege Banner',
    category: 'tactic',
    cost: { influence: 1 },
    effects: [
      { type: 'damage-raid', amount: 3 },
      { type: 'boost-die', amount: 1 },
    ],
    rulesText:
      'Deal 3 damage to the raid boss, then a ready die gains +1 value this round.',
    target: 'ready-die',
    marketCopies: 2,
  },
  {
    id: cardId('blackmail-ledger'),
    name: 'Blackmail Ledger',
    category: 'relic',
    cost: { knowledge: 1, influence: 1 },
    effects: [
      { type: 'steal-resource', resource: 'gold', amount: 1 },
      { type: 'steal-resource', resource: 'influence', amount: 1 },
    ],
    rulesText: 'Steal 1 gold and 1 influence from every rival.',
    target: 'none',
    marketCopies: 2,
  },
  {
    id: cardId('battle-prayer'),
    name: 'Battle Prayer',
    category: 'tactic',
    cost: { mana: 1 },
    effects: [
      { type: 'boost-die', amount: 1 },
      { type: 'gain-victory-points', amount: 1 },
    ],
    rulesText:
      'A ready die gains +1 value this round, then gain 1 victory point.',
    target: 'ready-die',
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
  {
    id: upgradeId('iron-three'),
    name: 'Iron Three',
    description: 'A low-cost value-3 face bearing a material sigil.',
    cost: { materials: 2 },
    replacement: { value: 3, symbols: ['materials'] },
    scoreValue: 1,
  },
  {
    id: upgradeId('sapphire-five'),
    name: 'Sapphire Five',
    description: 'A value-5 face bearing a mana sigil.',
    cost: { materials: 3, mana: 1 },
    replacement: { value: 5, symbols: ['mana'] },
    scoreValue: 2,
  },
  {
    id: upgradeId('scholar-six'),
    name: 'Scholar Six',
    description: 'A value-6 face bearing a knowledge sigil.',
    cost: { materials: 3, knowledge: 2 },
    replacement: { value: 6, symbols: ['knowledge'] },
    scoreValue: 3,
  },
  {
    id: upgradeId('battle-scarred-five'),
    name: 'Battle-Scarred Five',
    description: 'A value-5 face that carries both gold and masterwork glory.',
    cost: { materials: 3, gold: 1, influence: 1 },
    replacement: { value: 5, symbols: ['gold', 'masterwork'] },
    scoreValue: 3,
  },
  {
    id: upgradeId('living-two'),
    name: 'Living Two',
    description: 'A flexible value-2 face with mana and material sigils.',
    cost: { materials: 2, mana: 1 },
    replacement: { value: 2, symbols: ['mana', 'materials'] },
    scoreValue: 2,
  },
  {
    id: upgradeId('courtly-six'),
    name: 'Courtly Six',
    description: 'A value-6 face bearing an influence sigil.',
    cost: { materials: 3, influence: 2 },
    replacement: { value: 6, symbols: ['influence'] },
    scoreValue: 3,
  },
] as const satisfies readonly UpgradeDefinition[];

export const objectives = [
  {
    id: objectiveId('dragonslayer'),
    name: 'Dragonslayer',
    description: 'First to slay 2 monsters claims the glory.',
    victoryPoints: 4,
    condition: { type: 'monsters-slain', amount: 2 },
  },
  {
    id: objectiveId('dragon-hoard'),
    name: 'Dragon Hoard',
    description: 'First to amass 8 gold.',
    victoryPoints: 3,
    condition: { type: 'total-resource', resource: 'gold', amount: 8 },
  },
  {
    id: objectiveId('master-smith'),
    name: 'Master Smith',
    description: 'First to forge 2 permanent die upgrades.',
    victoryPoints: 3,
    condition: { type: 'upgrades-forged', amount: 2 },
  },
  {
    id: objectiveId('grand-vizier'),
    name: 'Grand Vizier',
    description: 'First to play 3 cards.',
    victoryPoints: 3,
    condition: { type: 'cards-played', amount: 3 },
  },
  {
    id: objectiveId('warlord'),
    name: 'Warlord',
    description: 'First to make 4 combat placements.',
    victoryPoints: 4,
    condition: { type: 'tag-placements', tag: 'combat', amount: 4 },
  },
  {
    id: objectiveId('archmage'),
    name: 'Archmage',
    description: 'First to channel 8 mana.',
    victoryPoints: 3,
    condition: { type: 'total-resource', resource: 'mana', amount: 8 },
  },
  {
    id: objectiveId('banner-lord'),
    name: 'Banner Lord',
    description: 'First to play 2 allies.',
    victoryPoints: 3,
    condition: { type: 'category-cards-played', category: 'ally', amount: 2 },
  },
  {
    id: objectiveId('relic-keeper'),
    name: 'Relic Keeper',
    description: 'First to play 2 relics.',
    victoryPoints: 3,
    condition: { type: 'category-cards-played', category: 'relic', amount: 2 },
  },
] as const satisfies readonly Objective[];

interface LocationInput {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly reward: Partial<ResourcePool> & { readonly victoryPoints?: number };
  readonly first?: PlacementRequirement;
  readonly second?: PlacementRequirement;
  readonly encounter?: MonsterEncounter;
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
    ...(input.encounter ? { encounter: input.encounter } : {}),
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
    description:
      'Beasts haunt the old walls. Strike harder than their threat to loot the ruin; a crushing blow salvages extra materials.',
    tags: ['martial', 'combat'],
    reward: { gold: 2, victoryPoints: 1 },
    first: { minimumValue: 4 },
    second: { minimumValue: 5, affinities: ['martial', 'neutral'] },
    encounter: {
      title: 'Ruined Stronghold',
      beasts: ['Ghoul Warband', 'Ogre Warlord'],
      loot: 'materials',
      criticalBonus: 2,
    },
  }),
  defineLocation({
    id: 'dragon-pass',
    name: 'Dragon Pass',
    description:
      'The Elder Dragon guards the high road. Wound it round after round — critical hits bite twice as deep — and the blow that fells it seizes the whole hoard.',
    tags: ['martial', 'combat'],
    reward: { influence: 1 },
    first: { minimumValue: 3 },
    second: { minimumValue: 5 },
    encounter: {
      title: 'Dragon Pass',
      beasts: ['Elder Dragon'],
      loot: 'gold',
      criticalBonus: 0,
      health: 20,
      bounty: { victoryPoints: 6, loot: { gold: 3 } },
    },
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
