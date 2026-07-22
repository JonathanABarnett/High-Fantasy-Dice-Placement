import type {
  CardCategory,
  DieAffinity,
  ResourceType,
} from '@shattered-crown/shared-types';

export const CATEGORY_INFO: Readonly<
  Record<CardCategory, { icon: string; label: string; description: string }>
> = {
  tactic: {
    icon: '⚡',
    label: 'Tactic',
    description:
      'A one-use effect. Tactics are discarded after play and do not score by category.',
  },
  ally: {
    icon: '♟',
    label: 'Ally',
    description:
      'A character card. After being played, each Ally is worth 1 point at game end.',
  },
  relic: {
    icon: '✥',
    label: 'Relic',
    description:
      'A powerful item card. After being played, each Relic is worth 1 point at game end.',
  },
};

export const RESOURCE_INFO: Readonly<
  Record<
    ResourceType | 'victoryPoints',
    { icon: string; label: string; description: string }
  >
> = {
  gold: {
    icon: '●',
    label: 'Gold',
    description:
      'Flexible currency used for market cards, premium upgrades, and some placements.',
  },
  mana: {
    icon: '◆',
    label: 'Mana',
    description:
      'Arcane power used by magical cards and enchanted die upgrades.',
  },
  knowledge: {
    icon: '▤',
    label: 'Knowledge',
    description:
      'Lore used to acquire cards and craft learned or arcane die faces.',
  },
  materials: {
    icon: '⚒',
    label: 'Materials',
    description:
      'Crafting supplies—the primary cost for permanent die-face upgrades at Forge Hall.',
  },
  influence: {
    icon: '♜',
    label: 'Influence',
    description:
      'Political favor used for allies, trade, court cards, and select locations.',
  },
  victoryPoints: {
    icon: '★',
    label: 'Victory points',
    description:
      'Your main score. The highest total after round six wins the Shattered Crown.',
  },
};

export const AFFINITY_INFO: Readonly<
  Record<DieAffinity, { icon: string; label: string; description: string }>
> = {
  arcane: {
    icon: '✦',
    label: 'Arcane',
    description:
      'Accepted by magical locations and favored by the Arcanum Conclave.',
  },
  martial: {
    icon: '⚔',
    label: 'Martial',
    description:
      'Accepted by battle locations and favored by the Ember Dominion.',
  },
  nature: {
    icon: '❧',
    label: 'Nature',
    description:
      'Accepted by wild locations and favored by the Verdant Covenant.',
  },
  influence: {
    icon: '♜',
    label: 'Influence',
    description: 'Accepted by court and shrine locations.',
  },
  neutral: {
    icon: '◇',
    label: 'Neutral',
    description: 'A flexible affinity accepted by many specialized locations.',
  },
};
