export type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export type GameId = Brand<string, 'GameId'>;
export type PlayerId = Brand<string, 'PlayerId'>;
export type FactionId = Brand<string, 'FactionId'>;
export type DieId = Brand<string, 'DieId'>;
export type LocationId = Brand<string, 'LocationId'>;
export type SlotId = Brand<string, 'SlotId'>;
export type CardId = Brand<string, 'CardId'>;
export type UpgradeId = Brand<string, 'UpgradeId'>;
export type ObjectiveId = Brand<string, 'ObjectiveId'>;

export type ResourceType =
  'gold' | 'mana' | 'knowledge' | 'materials' | 'influence';
export type DieAffinity =
  'arcane' | 'martial' | 'nature' | 'influence' | 'neutral';
export type CardCategory = 'tactic' | 'ally' | 'relic';
export type GamePhase =
  'setup' | 'round-start' | 'action' | 'round-end' | 'scoring' | 'complete';

export type ResourcePool = Readonly<Record<ResourceType, number>>;
export type FactionAbilityId =
  | 'arcane-resonance'
  | 'martial-glory'
  | 'verdant-adaptation'
  | 'stonebound-craft';

export interface DieFace {
  readonly value: number;
  readonly symbols: readonly string[];
}

export interface Die {
  readonly id: DieId;
  readonly affinity: DieAffinity;
  readonly faces: readonly [
    DieFace,
    DieFace,
    DieFace,
    DieFace,
    DieFace,
    DieFace,
  ];
  readonly rolledFaceIndex: number | null;
  readonly status: 'ready' | 'placed' | 'exhausted';
  readonly enhancements: readonly string[];
}

export interface PlacementRequirement {
  readonly minimumValue?: number;
  readonly affinities?: readonly DieAffinity[];
  readonly cost?: Partial<ResourcePool>;
}

export interface PlacementSlot {
  readonly id: SlotId;
  readonly occupantDieId: DieId | null;
  readonly occupantPlayerId: PlayerId | null;
  /** A round-scarcity lock. Undefined means open for authored static content. */
  readonly isOpen?: boolean;
  readonly requirement: PlacementRequirement;
}

export interface BoardLocation {
  readonly id: LocationId;
  readonly name: string;
  readonly description: string;
  /** A round-scarcity lock. Undefined means active for authored static content. */
  readonly isActive?: boolean;
  readonly slots: readonly PlacementSlot[];
  readonly tags: readonly string[];
  readonly reward: Partial<ResourcePool> & { readonly victoryPoints?: number };
}

export type GameEffect =
  | {
      readonly type: 'gain-resource';
      readonly resource: ResourceType;
      readonly amount: number;
    }
  | { readonly type: 'reroll-die' }
  | { readonly type: 'draw-card'; readonly amount: number }
  | { readonly type: 'gain-victory-points'; readonly amount: number };

export interface Card {
  readonly id: CardId;
  readonly name: string;
  readonly category: CardCategory;
  readonly cost: Partial<ResourcePool>;
  readonly effects: readonly GameEffect[];
  readonly rulesText: string;
  readonly target: 'none' | 'ready-die';
  readonly marketCopies: number;
}

export interface UpgradeDefinition {
  readonly id: UpgradeId;
  readonly name: string;
  readonly description: string;
  readonly cost: Partial<ResourcePool>;
  readonly replacement: DieFace;
  readonly scoreValue: number;
}

export interface Objective {
  readonly id: ObjectiveId;
  readonly name: string;
  readonly description: string;
  readonly victoryPoints: number;
}

export interface FactionDefinition {
  readonly id: FactionId;
  readonly name: string;
  readonly passiveAbility: string;
  readonly passiveAbilityId: FactionAbilityId;
  readonly roundAbility: string;
  readonly startingCardId: CardId;
  readonly scoringRule: string;
}

export interface AIProfile {
  readonly id: string;
  readonly factionId: FactionId;
  readonly actionWeights: Readonly<Record<string, number>>;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly controller: 'human' | 'cpu';
  readonly factionId: FactionId;
  readonly factionAbilityId: FactionAbilityId;
  readonly resources: ResourcePool;
  readonly dice: readonly Die[];
  readonly hand: readonly CardId[];
  readonly playedCards: readonly CardId[];
  readonly victoryPoints: number;
  readonly hasPassed: boolean;
  readonly placementCounts: Readonly<Record<string, number>>;
}

export interface RoundState {
  readonly number: number;
  readonly maximum: number;
  readonly firstPlayerId: PlayerId;
  readonly passedPlayerIds: readonly PlayerId[];
}

export interface TurnState {
  readonly activePlayerId: PlayerId;
  readonly turnNumber: number;
}

export interface GameState {
  readonly schemaVersion: 3;
  readonly id: GameId;
  readonly seed: string;
  readonly rngState: number;
  readonly phase: GamePhase;
  readonly players: readonly PlayerState[];
  readonly locations: readonly BoardLocation[];
  readonly cards: readonly Card[];
  readonly cardDeck: readonly CardId[];
  readonly cardMarket: readonly CardId[];
  readonly cardDiscard: readonly CardId[];
  readonly upgrades: readonly UpgradeDefinition[];
  readonly round: RoundState;
  readonly turn: TurnState;
  readonly eventSequence: number;
  readonly result: MatchResult | null;
}

export type GameAction =
  | {
      readonly type: 'place-die';
      readonly playerId: PlayerId;
      readonly dieId: DieId;
      readonly locationId: LocationId;
      readonly slotId: SlotId;
    }
  | {
      readonly type: 'play-card';
      readonly playerId: PlayerId;
      readonly cardId: CardId;
      readonly targetDieId?: DieId;
    }
  | {
      readonly type: 'acquire-card';
      readonly playerId: PlayerId;
      readonly cardId: CardId;
    }
  | {
      readonly type: 'upgrade-die';
      readonly playerId: PlayerId;
      readonly dieId: DieId;
      readonly faceIndex: number;
      readonly upgradeId: UpgradeId;
    }
  | { readonly type: 'pass'; readonly playerId: PlayerId };

export type GameEvent =
  | {
      readonly type: 'die-rolled';
      readonly sequence: number;
      readonly dieId: DieId;
      readonly faceIndex: number;
    }
  | {
      readonly type: 'die-placed';
      readonly sequence: number;
      readonly playerId: PlayerId;
      readonly dieId: DieId;
      readonly locationId: LocationId;
      readonly slotId: SlotId;
    }
  | {
      readonly type: 'player-passed';
      readonly sequence: number;
      readonly playerId: PlayerId;
    }
  | {
      readonly type: 'resource-gained';
      readonly sequence: number;
      readonly playerId: PlayerId;
      readonly resource: ResourceType;
      readonly amount: number;
    }
  | {
      readonly type: 'victory-points-gained';
      readonly sequence: number;
      readonly playerId: PlayerId;
      readonly amount: number;
    }
  | {
      readonly type: 'round-started';
      readonly sequence: number;
      readonly round: number;
    }
  | {
      readonly type: 'match-completed';
      readonly sequence: number;
      readonly result: MatchResult;
    }
  | {
      readonly type: 'card-acquired';
      readonly sequence: number;
      readonly playerId: PlayerId;
      readonly cardId: CardId;
    }
  | {
      readonly type: 'card-played';
      readonly sequence: number;
      readonly playerId: PlayerId;
      readonly cardId: CardId;
    }
  | {
      readonly type: 'die-rerolled';
      readonly sequence: number;
      readonly dieId: DieId;
      readonly faceIndex: number;
    }
  | {
      readonly type: 'die-upgraded';
      readonly sequence: number;
      readonly playerId: PlayerId;
      readonly dieId: DieId;
      readonly faceIndex: number;
      readonly upgradeId: UpgradeId;
    };

export interface ScoreBreakdown {
  readonly source: string;
  readonly points: number;
}

export interface MatchResult {
  readonly winnerIds: readonly PlayerId[];
  readonly scores: Readonly<Record<PlayerId, readonly ScoreBreakdown[]>>;
}

export type ActionRejectionCode =
  | 'wrong-phase'
  | 'not-active-player'
  | 'entity-not-found'
  | 'die-unavailable'
  | 'already-passed'
  | 'slot-occupied'
  | 'location-inactive'
  | 'slot-unavailable'
  | 'requirement-not-met'
  | 'insufficient-resources'
  | 'card-not-in-hand'
  | 'invalid-target'
  | 'forge-required'
  | 'unsupported-action';

export type ActionValidation =
  | { readonly legal: true; readonly action: GameAction }
  | {
      readonly legal: false;
      readonly code: ActionRejectionCode;
      readonly message: string;
    };
