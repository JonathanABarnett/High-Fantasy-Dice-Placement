import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  chooseCpuAction,
  CPU_DIFFICULTIES,
  type CpuDifficulty,
} from '@shattered-crown/game-ai';
import {
  cards,
  factions,
  locations,
  objectives,
  upgrades,
} from '@shattered-crown/game-content';
import {
  applyAction,
  chainBonusFor,
  createGame,
  deserializeGame,
  dieValue,
  enumerateLegalActions,
  extendChain,
  raidBountyFor,
  raidDamageFor,
  scoreTotal,
  serializeGame,
  validateAction,
} from '@shattered-crown/game-engine';
import type {
  CardId,
  CardCategory,
  DieFace,
  DieId,
  FactionId,
  PlayerId,
  GameAction,
  GameEvent,
  GameState,
  LocationId,
  PlayerState,
  PlacementRequirement,
  ResourceType,
} from '@shattered-crown/shared-types';

import { BoardRenderer } from './board/board-renderer';
import {
  AffinityToken,
  CategoryToken,
  ResourceList,
  ResourceToken,
} from './components/RulesToken';
import { GameIcon } from './components/GameIcon';
import { AFFINITY_INFO, RESOURCE_INFO } from './components/rules-info';
import { useInterfaceStore } from './stores/interface-store';
import { TutorialOverlay } from './tutorial/TutorialOverlay';
import allyCardArt from '../../../assets/generated/cards/category-ally-v1.webp';
import relicCardArt from '../../../assets/generated/cards/category-relic-v1.webp';
import tacticCardArt from '../../../assets/generated/cards/category-tactic-v1.webp';
import elderDragonArt from '../../../assets/generated/encounters/elder-dragon-v1.webp';
import monsterHuntArt from '../../../assets/generated/encounters/monster-hunt-v1.webp';
import arcanumPortrait from '../../../assets/generated/factions/arcanum-conclave-v1.webp';
import emberPortrait from '../../../assets/generated/factions/ember-dominion-v1.webp';
import stoneboundPortrait from '../../../assets/generated/factions/stonebound-league-v1.webp';
import verdantPortrait from '../../../assets/generated/factions/verdant-covenant-v1.webp';
import titleHeroArt from '../../../assets/generated/setup/title-hero-v1.webp';
import cardMarketArt from '../../../assets/generated/ui/card-market-v1.webp';
import forgeUpgradeArt from '../../../assets/generated/ui/forge-upgrade-v1.webp';
import shatteredCrownQuestArt from '../../../assets/generated/ui/shattered-crown-quest-v1.webp';
import tabletopFrameArt from '../../../assets/generated/ui/tabletop-frame-v1.webp';
import atlasOrnamentArt from '../../../assets/generated/ui/atlas-ornament-v1.webp';
import diceTrayArt from '../../../assets/generated/ui/dice-tray-v1.webp';
import victoryScoringArt from '../../../assets/generated/ui/victory-scoring-v1.webp';
import arcaneCardFaceV2 from '../../../assets/generated/rebuild-v2/arcane-card-face-v2.webp';
import fantasyDiceAtlasV1 from '../../../assets/generated/rebuild-v2/fantasy-dice-atlas-v1.webp';
import playerTableauV2 from '../../../assets/generated/rebuild-v2/player-tableau-v2.webp';
import tableSurfaceV2 from '../../../assets/generated/rebuild-v2/table-surface-v2.webp';

const SAVE_KEY = 'shattered-crown.debug-match.v4';
const TUTORIAL_KEY = 'shattered-crown.tutorial-complete.v2';
const SOUND_KEY = 'shattered-crown.sound-enabled.v1';
const SAVE_ENVELOPE_VERSION = 1;
const FACTION_PORTRAITS: Readonly<Record<string, string>> = {
  'arcanum-conclave': arcanumPortrait,
  'ember-dominion': emberPortrait,
  'verdant-covenant': verdantPortrait,
  'stonebound-league': stoneboundPortrait,
};
const CARD_CATEGORY_ART: Readonly<Record<CardCategory, string>> = {
  tactic: tacticCardArt,
  ally: allyCardArt,
  relic: relicCardArt,
};
const ENCOUNTER_ART = {
  hunt: monsterHuntArt,
  raid: elderDragonArt,
} as const;
const RESOURCE_TYPES: readonly ResourceType[] = [
  'gold',
  'mana',
  'knowledge',
  'materials',
  'influence',
];

interface SavedMatchEnvelope {
  readonly envelopeVersion: typeof SAVE_ENVELOPE_VERSION;
  readonly game: GameState;
  readonly difficulty: CpuDifficulty;
}

function isCpuDifficulty(value: unknown): value is CpuDifficulty {
  return (
    typeof value === 'string' &&
    CPU_DIFFICULTIES.some((tier) => tier.id === value)
  );
}

function parseSavedMatch(serialized: string): {
  readonly game: GameState;
  readonly difficulty: CpuDifficulty | null;
} {
  const parsed: unknown = JSON.parse(serialized);
  if (
    parsed &&
    typeof parsed === 'object' &&
    'game' in parsed &&
    'difficulty' in parsed
  ) {
    const envelope = parsed as Partial<SavedMatchEnvelope>;
    return {
      game: deserializeGame(JSON.stringify(envelope.game)),
      difficulty: isCpuDifficulty(envelope.difficulty)
        ? envelope.difficulty
        : null,
    };
  }
  return { game: deserializeGame(serialized), difficulty: null };
}

function cardArtStyle(category: CardCategory): CSSProperties {
  return {
    '--card-art': `url(${CARD_CATEGORY_ART[category]})`,
  } as CSSProperties;
}

function encounterArtStyle(kind: keyof typeof ENCOUNTER_ART): CSSProperties {
  return {
    '--encounter-art': `url(${ENCOUNTER_ART[kind]})`,
  } as CSSProperties;
}

function panelArtStyle(asset: string): CSSProperties {
  return {
    '--panel-art': `url(${asset})`,
  } as CSSProperties;
}

function tableArtStyle(): CSSProperties {
  return {
    '--tabletop-frame': `url(${tabletopFrameArt})`,
    '--atlas-ornament': `url(${atlasOrnamentArt})`,
    '--rebuild-table': `url(${tableSurfaceV2})`,
    '--player-tableau': `url(${playerTableauV2})`,
    '--card-face-v2': `url(${arcaneCardFaceV2})`,
  } as CSSProperties;
}

function diceTrayStyle(): CSSProperties {
  return { '--dice-tray': `url(${diceTrayArt})` } as CSSProperties;
}

function describeEvent(event: GameEvent, state: GameState): string {
  if (event.type === 'round-started') {
    const activeRegions = state.locations.filter(
      (location) => location.isActive !== false,
    ).length;
    const openSlots = state.locations.reduce(
      (total, location) =>
        total + location.slots.filter((slot) => slot.isOpen !== false).length,
      0,
    );
    return `Round ${event.round} began: ${activeRegions} regions and ${openSlots} contested slots are open.`;
  }
  if (event.type === 'match-completed') return 'The match is complete.';
  if (event.type === 'die-rolled')
    return `Die ${event.dieId.split('-').at(-1)} rolled ${event.faceIndex + 1}.`;
  if (event.type === 'die-rerolled')
    return `Die ${event.dieId.split('-').at(-1)} rerolled ${event.faceIndex + 1}.`;
  if (event.type === 'raid-enraged') {
    const healed =
      event.regenerated > 0
        ? ` and regenerated ${event.regenerated} health (${event.remaining}/${event.health})`
        : '';
    return `🐉 The ${event.beast} survived round ${event.roundsSurvived}${healed}. Its hoard is now worth ${event.bountyVictoryPoints}★.`;
  }
  const player =
    state.players.find((item) => item.id === event.playerId)?.name ?? 'Player';
  if (event.type === 'player-passed') return `${player} passed.`;
  if (event.type === 'die-placed') {
    const location =
      state.locations.find((item) => item.id === event.locationId)?.name ??
      event.locationId;
    return `${player} placed a die at ${location}.`;
  }
  if (event.type === 'monster-slain') {
    const flourish = event.critical ? ' with a CRITICAL STRIKE' : '';
    const spoils =
      event.overkill > 0 ? `, looting ${event.overkill} extra` : '';
    return `⚔ ${player} slew the ${event.beast}${flourish} for ${event.bonusVictoryPoints} VP${spoils}!`;
  }
  if (event.type === 'raid-damaged') {
    return `⚔ ${player} hit the ${event.beast} for ${event.damage} — ${event.remaining}/${event.health} health remains.`;
  }
  if (event.type === 'die-bumped') {
    const victim =
      state.players.find((item) => item.id === event.victimPlayerId)?.name ??
      'a rival';
    const location =
      state.locations.find((item) => item.id === event.locationId)?.name ??
      event.locationId;
    return `⚡ ${player} bumped ${victim}'s die off ${location}!`;
  }
  if (event.type === 'chain-extended') {
    return event.bonusVictoryPoints > 0
      ? `🔥 ${player} extended a ${event.tag} run to ${event.length} for +${event.bonusVictoryPoints} VP!`
      : `${player} began a ${event.tag} run (${event.length}).`;
  }
  if (event.type === 'die-boosted') {
    return `↑ ${player} empowered a die by +${event.amount} to value ${event.value}.`;
  }
  if (event.type === 'resource-stolen') {
    const victim =
      state.players.find((item) => item.id === event.victimPlayerId)?.name ??
      'a rival';
    return `⚡ ${player} stole ${event.amount} ${event.resource} from ${victim}.`;
  }
  if (event.type === 'objective-claimed') {
    const objective = state.objectives.find(
      (item) => item.id === event.objectiveId,
    );
    return `★ ${player} claimed "${objective?.name ?? event.objectiveId}" for ${event.victoryPoints} VP!`;
  }
  if (event.type === 'resource-gained')
    return `${player} gained ${event.amount} ${event.resource}.`;
  if (event.type === 'card-acquired') {
    const card = state.cards.find((item) => item.id === event.cardId);
    return `${player} acquired ${card?.name ?? event.cardId}.`;
  }
  if (event.type === 'card-played') {
    const card = state.cards.find((item) => item.id === event.cardId);
    return `${player} played ${card?.name ?? event.cardId}.`;
  }
  if (event.type === 'die-upgraded') {
    const upgrade = state.upgrades.find((item) => item.id === event.upgradeId);
    return `${player} forged ${upgrade?.name ?? event.upgradeId} onto die ${event.dieId.split('-').at(-1)}.`;
  }
  return `${player} gained ${event.amount} victory point${event.amount === 1 ? '' : 's'}.`;
}

interface Callout {
  readonly title: string;
  readonly detail: string;
  readonly tone: 'triumph' | 'blow' | 'quest' | 'chain';
  /** Highest-weight event in a batch becomes the headline. */
  readonly weight: number;
  readonly key?: number;
}

/**
 * Picks the one event in a batch worth interrupting the player for. Without
 * this, a killing blow and a resource tick read identically — a line of text in
 * a log panel that is usually collapsed.
 */
function calloutFor(event: GameEvent, state: GameState): Callout | null {
  const who = state.players.find(
    (item) => item.id === (event as { playerId?: string }).playerId,
  );
  const mine = who?.controller === 'human';
  const actor = mine ? 'You' : (who?.name ?? 'The CPU');
  if (event.type === 'monster-slain') {
    const killingBlow = event.overkill === 0 && !event.critical;
    return {
      title: event.critical ? 'CRITICAL STRIKE!' : 'SLAIN!',
      detail: `${actor} felled the ${event.beast} for ${event.bonusVictoryPoints}★${
        killingBlow ? ' and the hoard' : ''
      }.`,
      tone: 'triumph',
      weight: event.critical ? 100 : 90,
    };
  }
  if (event.type === 'objective-claimed') {
    const objective = state.objectives.find(
      (item) => item.id === event.objectiveId,
    );
    return {
      title: 'QUEST CLAIMED',
      detail: `${actor} took "${objective?.name ?? 'a quest'}" for ${event.victoryPoints}★.`,
      tone: 'quest',
      weight: 80,
    };
  }
  if (event.type === 'chain-extended' && event.bonusVictoryPoints > 0) {
    return {
      title: `${event.tag.toUpperCase()} RUN ×${event.length}`,
      detail: `${actor} kept the run alive for +${event.bonusVictoryPoints}★.`,
      tone: 'chain',
      weight: 60 + event.length,
    };
  }
  if (event.type === 'die-bumped') {
    const victim = state.players.find(
      (item) => item.id === event.victimPlayerId,
    );
    return {
      title: 'BUMPED!',
      detail: `${actor} drove ${victim?.controller === 'human' ? 'your' : 'the rival'} die off the slot.`,
      tone: 'blow',
      weight: 70,
    };
  }
  if (event.type === 'raid-enraged') {
    return {
      title: event.regenerated > 0 ? 'THE BEAST RECOVERS' : 'THE HOARD GROWS',
      detail:
        event.regenerated > 0
          ? `Left alone, the ${event.beast} healed ${event.regenerated} — and its hoard is now ${event.bountyVictoryPoints}★.`
          : `The ${event.beast} still lives. Its hoard is now ${event.bountyVictoryPoints}★.`,
      tone: 'blow',
      weight: 85,
    };
  }
  if (event.type === 'raid-damaged') {
    return {
      title: `${event.damage} DAMAGE`,
      detail: `${actor} wounded the ${event.beast} — ${event.remaining} health left.`,
      tone: 'blow',
      weight: 40,
    };
  }
  return null;
}

function CalloutBanner({
  callout,
  reducedMotion,
  onDone,
}: {
  readonly callout: Callout;
  readonly reducedMotion: boolean;
  readonly onDone: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2200);
    return () => window.clearTimeout(timer);
  }, [callout.key, onDone]);
  return (
    <div
      className={`callout tone-${callout.tone} ${reducedMotion ? 'still' : ''}`}
      key={callout.key}
      role="status"
    >
      <strong>{callout.title}</strong>
      <span>{callout.detail}</span>
    </div>
  );
}

function totalScore(state: GameState, player: PlayerState): number {
  return (state.result?.scores[player.id] ?? []).reduce(
    (total, item) => total + item.points,
    0,
  );
}

function isLowRollFriendly(requirement: PlacementRequirement): boolean {
  return (
    (requirement.minimumValue ?? 1) <= 2 &&
    !requirement.affinities?.length &&
    Object.keys(requirement.cost ?? {}).length === 0
  );
}

interface MovePreview {
  readonly action: Extract<GameAction, { type: 'place-die' | 'bump-die' }>;
  readonly location: GameState['locations'][number];
  readonly slotNumber: number;
  readonly die: PlayerState['dice'][number];
  readonly score: number;
  readonly gained: Partial<Record<ResourceType, number>>;
  readonly victoryPoints: number;
  readonly objectivePoints: number;
  readonly chainLength: number | null;
  readonly chainBonus: number;
  readonly raidDamage: number;
  readonly raidRemaining: number | null;
  readonly bump: boolean;
  readonly headline: string;
  readonly stakes: readonly string[];
}

function addPreviewResource(
  gained: Partial<Record<ResourceType, number>>,
  resource: ResourceType,
  amount: number,
) {
  gained[resource] = (gained[resource] ?? 0) + amount;
}

function previewRewardLabel(values: Partial<Record<ResourceType, number>>) {
  return RESOURCE_TYPES.filter((resource) => (values[resource] ?? 0) > 0)
    .map((resource) => `+${values[resource]} ${RESOURCE_INFO[resource].label}`)
    .join(', ');
}

function isCriticalDie(die: PlayerState['dice'][number]) {
  const face =
    die.rolledFaceIndex === null ? null : die.faces[die.rolledFaceIndex];
  return dieValue(die) >= 6 || (face?.symbols.includes('masterwork') ?? false);
}

function raidDamageBreakdown(
  player: PlayerState,
  die: PlayerState['dice'][number],
) {
  const value = dieValue(die);
  const base = isCriticalDie(die) ? value * 2 : value;
  const factionBonus = raidDamageFor(player, die) - base;
  return { base, factionBonus, total: base + factionBonus };
}

function raidDamageLabel(
  player: PlayerState,
  die: PlayerState['dice'][number],
) {
  const breakdown = raidDamageBreakdown(player, die);
  const parts = [`${breakdown.base}`];
  if (breakdown.factionBonus > 0)
    parts.push(`Ember +${breakdown.factionBonus}`);
  return `${parts.join(' + ')} = ${breakdown.total}`;
}

function raidContributionRows(
  game: GameState,
  location: GameState['locations'][number],
  humanPlayerId: PlayerId | undefined,
) {
  return location.slots.flatMap((slot) => {
    if (!slot.occupantPlayerId || !slot.occupantDieId) return [];
    const player = game.players.find(
      (item) => item.id === slot.occupantPlayerId,
    );
    const die = player?.dice.find((item) => item.id === slot.occupantDieId);
    if (!player || !die) return [];
    const breakdown = raidDamageBreakdown(player, die);
    return [
      {
        breakdown,
        die,
        owner: player.id === humanPlayerId ? 'You' : player.name,
      },
    ];
  });
}

function previewMove(
  state: GameState,
  player: PlayerState,
  action: Extract<GameAction, { type: 'place-die' | 'bump-die' }>,
): MovePreview | null {
  const location = state.locations.find(
    (item) => item.id === action.locationId,
  );
  const die = player.dice.find((item) => item.id === action.dieId);
  if (!location || !die) return null;
  const slotIndex = location.slots.findIndex(
    (slot) => slot.id === action.slotId,
  );
  if (slotIndex < 0) return null;

  const result = applyAction(state, action);
  const gained: Partial<Record<ResourceType, number>> = {};
  let victoryPoints = 0;
  let objectivePoints = 0;
  let chainLength: number | null = null;
  let chainBonus = 0;
  let raidDamage = 0;
  let raidRemaining: number | null = null;
  let bump = action.type === 'bump-die';
  const stakes: string[] = [];

  for (const event of result.events) {
    if ('playerId' in event && event.playerId !== player.id) continue;
    if (event.type === 'resource-gained') {
      addPreviewResource(gained, event.resource, event.amount);
    }
    if (event.type === 'victory-points-gained') {
      victoryPoints += event.amount;
    }
    if (event.type === 'objective-claimed') {
      objectivePoints += event.victoryPoints;
      stakes.push(`Claims a crown quest for ${event.victoryPoints}★`);
    }
    if (event.type === 'chain-extended') {
      chainLength = event.length;
      chainBonus += event.bonusVictoryPoints;
      if (event.bonusVictoryPoints > 0) {
        stakes.push(
          `Extends your ${event.tag} run for +${event.bonusVictoryPoints}★`,
        );
      } else if (event.length > 1) {
        stakes.push(`Keeps your ${event.tag} run alive`);
      }
    }
    if (event.type === 'monster-slain') {
      stakes.push(
        event.critical
          ? `Critical hunt: ${event.beast} slain for +${event.bonusVictoryPoints}★`
          : `Slays ${event.beast}`,
      );
    }
    if (event.type === 'raid-damaged') {
      raidDamage += event.damage;
      raidRemaining = event.remaining;
      stakes.push(
        event.remaining === 0
          ? `Killing blow on ${event.beast}`
          : `${event.damage} damage to ${event.beast}`,
      );
    }
    if (event.type === 'die-bumped') {
      bump = true;
      stakes.push('Bumps a rival die off the board');
    }
  }

  const rewardText = previewRewardLabel(gained);
  const headline =
    stakes[0] ??
    (victoryPoints > 0
      ? `Scores ${victoryPoints}★ now`
      : rewardText
        ? `Builds economy: ${rewardText}`
        : 'Claims board position');
  const score =
    victoryPoints * 12 +
    objectivePoints * 10 +
    chainBonus * 9 +
    raidDamage * 2 +
    (bump ? 14 : 0) +
    RESOURCE_TYPES.reduce(
      (total, resource) => total + (gained[resource] ?? 0) * 3,
      0,
    ) +
    (chainLength ?? 0);

  return {
    action,
    location,
    slotNumber: slotIndex + 1,
    die,
    score,
    gained,
    victoryPoints,
    objectivePoints,
    chainLength,
    chainBonus,
    raidDamage,
    raidRemaining,
    bump,
    headline,
    stakes,
  };
}

function MoveAdvisor({
  previews,
  selectedDie,
  onCommit,
}: {
  readonly previews: readonly MovePreview[];
  readonly selectedDie: PlayerState['dice'][number] | null;
  readonly onCommit: (action: MovePreview['action']) => void;
}) {
  if (previews.length === 0) {
    return (
      <section className="move-advisor empty" aria-label="Move advisor">
        <strong>
          {selectedDie ? 'No legal route' : 'Choose a die to plan'}
        </strong>
        <span>
          {selectedDie
            ? 'This die cannot reach an open square right now. Try a card, another die, or pass.'
            : 'Select a die to reveal the moves that actually matter this turn.'}
        </span>
      </section>
    );
  }

  return (
    <section className="move-advisor" aria-label="Move advisor">
      <div className="move-advisor-head">
        <strong>
          {selectedDie ? 'Best routes for this die' : 'Most tempting moves'}
        </strong>
        <span>Preview the payoff before committing.</span>
      </div>
      <div className="move-list">
        {previews.slice(0, 3).map((preview, index) => (
          <button
            className={`move-preview ${index === 0 ? 'recommended' : ''} ${
              preview.bump ? 'bump' : ''
            }`}
            key={`${preview.action.type}-${preview.location.id}-${preview.action.slotId}-${preview.die.id}`}
            onClick={() => onCommit(preview.action)}
            type="button"
          >
            <span className="move-rank">
              {index === 0 ? 'Best' : `#${index + 1}`}
            </span>
            <span className="move-copy">
              <strong>
                {preview.location.name} · slot {preview.slotNumber}
              </strong>
              <span>{preview.headline}</span>
              <em>
                {preview.stakes.slice(1, 3).join(' · ') ||
                  previewRewardLabel(preview.gained) ||
                  (preview.raidRemaining !== null
                    ? `${preview.raidRemaining} health left`
                    : 'Safe tempo play')}
              </em>
            </span>
            <span className="move-yield">
              {preview.victoryPoints + preview.objectivePoints > 0 && (
                <b>+{preview.victoryPoints + preview.objectivePoints}★</b>
              )}
              {RESOURCE_TYPES.some(
                (resource) => (preview.gained[resource] ?? 0) > 0,
              ) && <ResourceList values={preview.gained} />}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function RivalThreats({
  previews,
  onInspect,
}: {
  readonly previews: readonly MovePreview[];
  readonly onInspect: (locationId: LocationId) => void;
}) {
  if (previews.length === 0) {
    return (
      <section className="rival-threats calm" aria-label="Rival threats">
        <strong>Rival pressure</strong>
        <span>
          The CPU has no obvious placement route if the board froze here.
        </span>
      </section>
    );
  }
  const primary = previews[0]!;
  const others = previews.slice(1);
  return (
    <section className="rival-threats" aria-label="Rival threats">
      <div className="rival-threats-head">
        <strong>CPU wants next</strong>
        <span>If you leave the board open.</span>
      </div>
      <button
        className={`rival-threat primary-threat ${primary.bump ? 'bump' : ''}`}
        onClick={() => onInspect(primary.location.id)}
        type="button"
      >
        <span className="threat-mark">!</span>
        <span>
          <strong>{primary.location.name}</strong>
          <em>{primary.headline}</em>
        </span>
      </button>
      {others.slice(0, 2).map((preview) => (
        <button
          className="rival-threat"
          key={`${preview.action.type}-${preview.location.id}-${preview.action.slotId}-${preview.die.id}`}
          onClick={() => onInspect(preview.location.id)}
          type="button"
        >
          <span className="threat-mark small">?</span>
          <span>
            <strong>{preview.location.name}</strong>
            <em>{preview.headline}</em>
          </span>
        </button>
      ))}
    </section>
  );
}

function RequirementTokens({
  requirement,
}: {
  readonly requirement: PlacementRequirement;
}) {
  const hasMinimum = requirement.minimumValue !== undefined;
  const hasAffinities = Boolean(requirement.affinities?.length);
  const hasCost = Object.keys(requirement.cost ?? {}).length > 0;
  if (!hasMinimum && !hasAffinities && !hasCost)
    return <span className="cost-free">Any ready die</span>;

  return (
    <span className="requirement-tokens">
      {hasMinimum && (
        <span
          aria-label={`Minimum value ${requirement.minimumValue}. The rolled die value must be this number or higher.`}
          className="info-token value-token compact-token"
          data-tooltip={`Minimum value: die must roll ${requirement.minimumValue}+.`}
          tabIndex={0}
        >
          <span aria-hidden="true" className="token-icon">
            <GameIcon name="value" />
          </span>
          <strong>{requirement.minimumValue}+</strong>
        </span>
      )}
      {requirement.affinities?.map((affinity) => (
        <AffinityToken affinity={affinity} compact key={affinity} />
      ))}
      {hasCost && (
        <>
          <span className="requirement-cost-label">Pay</span>
          <ResourceList values={requirement.cost ?? {}} />
        </>
      )}
    </span>
  );
}

function symbolIcon(symbol: string) {
  if (symbol === 'masterwork') return 'masterwork';
  return RESOURCE_INFO[symbol as ResourceType]?.icon ?? 'neutral';
}

function symbolLabel(symbol: string): string {
  if (symbol === 'masterwork') return 'Masterwork';
  return RESOURCE_INFO[symbol as ResourceType]?.label ?? symbol;
}

function DieFacePreview({
  face,
  label,
  tone = 'plain',
}: {
  readonly face: DieFace;
  readonly label: string;
  readonly tone?: 'plain' | 'upgrade' | 'current';
}) {
  return (
    <span className={`face-preview face-preview-${tone}`}>
      <span className="face-preview-label">{label}</span>
      <span className="face-preview-die">
        <strong>{face.value}</strong>
        <span className="face-preview-symbols">
          {face.symbols.length ? (
            face.symbols.map((symbol, index) => (
              <span
                aria-label={symbolLabel(symbol)}
                className={`face-symbol face-symbol-${symbol}`}
                data-tooltip={symbolLabel(symbol)}
                key={`${symbol}-${index}`}
                tabIndex={0}
              >
                <GameIcon name={symbolIcon(symbol)} />
              </span>
            ))
          ) : (
            <span className="face-empty">Base</span>
          )}
        </span>
      </span>
    </span>
  );
}

function ForgeFacePreview({
  currentFace,
  replacement,
}: {
  readonly currentFace: DieFace | undefined;
  readonly replacement: DieFace;
}) {
  return (
    <div className="forge-face-preview" aria-label="Forge face preview">
      {currentFace ? (
        <DieFacePreview face={currentFace} label="Replace" tone="current" />
      ) : (
        <span className="face-preview face-preview-current">
          <span className="face-preview-label">Replace</span>
          <span className="face-preview-die missing">Choose die</span>
        </span>
      )}
      <span aria-hidden="true" className="forge-arrow">
        →
      </span>
      <DieFacePreview face={replacement} label="Forge" tone="upgrade" />
    </div>
  );
}

const FLIGHT_MS = 420;
const RESOURCE_FLIGHT_SYMBOLS: Readonly<Record<ResourceType, string>> = {
  gold: '◉',
  mana: '♦',
  knowledge: '▣',
  materials: '⚒',
  influence: '✦',
};

/**
 * Throws a copy of a die from the tray to the board slot it was committed to.
 *
 * Kept outside React on purpose. This is fire-and-forget decoration with no
 * bearing on state, and the CPU's turn timer re-renders this tree every few
 * hundred milliseconds; a detached node owns its own lifetime and cannot be
 * torn down mid-flight by an unrelated render. It removes itself when done.
 */
function throwPiece(
  sourceSelector: string,
  targetSelector: string,
  label: string,
  className: string,
): void {
  const source = document.querySelector<HTMLElement>(sourceSelector);
  const target = document.querySelector<HTMLElement>(targetSelector);
  if (!source || !target) return;
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const fromX = from.left + from.width / 2;
  const fromY = from.top + from.height / 2;
  const toX = to.left + to.width / 2;
  const toY = to.top + to.height / 2;
  const midX = fromX + (toX - fromX) * 0.52;
  const midY = fromY + (toY - fromY) * 0.52 - 52;
  const node = document.createElement('div');
  node.className = className;
  node.setAttribute('aria-hidden', 'true');
  node.textContent = label;
  document.body.appendChild(node);
  const animation = node.animate(
    [
      {
        transform: `translate(${fromX}px, ${fromY}px) translate(-50%, -50%) scale(0.72) rotate(-18deg)`,
        opacity: 0.25,
      },
      {
        transform: `translate(${midX}px, ${midY}px) translate(-50%, -50%) scale(1.18) rotate(14deg)`,
        opacity: 1,
        offset: 0.52,
      },
      {
        transform: `translate(${toX}px, ${toY}px) translate(-50%, -50%) scale(1.06) rotate(2deg)`,
        opacity: 0,
      },
    ],
    { duration: FLIGHT_MS, easing: 'cubic-bezier(0.3, 0.9, 0.3, 1)' },
  );
  animation.onfinish = () => node.remove();
  animation.oncancel = () => node.remove();
  target.classList.add('placement-impact');
  window.setTimeout(
    () => target.classList.remove('placement-impact'),
    FLIGHT_MS,
  );
}

function throwDieToBoard(
  dieId: DieId,
  locationId: LocationId,
  label: string,
  affinity: string,
): void {
  throwPiece(
    `[data-die-id="${dieId}"]`,
    `[data-testid="location-hotspot-${locationId}"]`,
    label,
    `die-flight die-${affinity}`,
  );
}

function throwRewardToPlayer(
  locationId: LocationId,
  playerId: PlayerId,
  resource: ResourceType,
  amount: number,
): void {
  throwPiece(
    `[data-testid="location-hotspot-${locationId}"]`,
    `[data-player-id="${playerId}"] .resource-${resource}`,
    `+${amount} ${RESOURCE_FLIGHT_SYMBOLS[resource]}`,
    `reward-flight reward-${resource}`,
  );
}

function pulseElement(selector: string, className: string, duration = 720) {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return;
  target.classList.remove(className);
  void target.offsetWidth;
  target.classList.add(className);
  window.setTimeout(() => target.classList.remove(className), duration);
}

function burstAt(selector: string, glyph: string, className: string) {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return;
  const bounds = target.getBoundingClientRect();
  const burst = document.createElement('div');
  burst.className = `impact-burst ${className}`;
  burst.setAttribute('aria-hidden', 'true');
  burst.textContent = glyph;
  burst.style.left = `${bounds.left + bounds.width / 2}px`;
  burst.style.top = `${bounds.top + bounds.height / 2}px`;
  document.body.appendChild(burst);
  const animation = burst.animate(
    [
      {
        transform: 'translate(-50%, -50%) scale(0.45) rotate(-12deg)',
        opacity: 0,
      },
      {
        transform: 'translate(-50%, -50%) scale(1.25) rotate(6deg)',
        opacity: 1,
        offset: 0.38,
      },
      {
        transform: 'translate(-50%, -72%) scale(1.05) rotate(0deg)',
        opacity: 0,
      },
    ],
    { duration: 760, easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)' },
  );
  animation.onfinish = () => burst.remove();
  animation.oncancel = () => burst.remove();
}

function throwCardToPlayer(cardId: CardId, playerId: PlayerId) {
  throwPiece(
    `[data-card-id="${cardId}"]`,
    `[data-player-id="${playerId}"]`,
    '✦',
    'card-flight',
  );
}

/**
 * Counts a number toward its new value instead of snapping to it, so a gain
 * reads as something that happened rather than a figure that was always there.
 * Falls back to the exact value immediately under reduced motion.
 */
function CountUp({
  value,
  reducedMotion,
}: {
  readonly value: number;
  readonly reducedMotion: boolean;
}) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (reducedMotion) {
      setShown(value);
      return;
    }
    let current = shown;
    if (current === value) return;
    const step = current < value ? 1 : -1;
    const timer = window.setInterval(() => {
      current += step;
      setShown(current);
      if (current === value) window.clearInterval(timer);
    }, 55);
    return () => window.clearInterval(timer);
    // Chasing `value` only; `shown` is the animation's own cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reducedMotion]);
  return <>{shown}</>;
}

/** How long dice tumble before settling on the value the engine rolled. */
const ROLL_DURATION_MS = 620;
const ROLL_TICK_MS = 60;

type GameSoundCue =
  | 'acquire'
  | 'bump'
  | 'card'
  | 'combat'
  | 'dice'
  | 'error'
  | 'forge'
  | 'panel'
  | 'pass'
  | 'place'
  | 'quest'
  | 'resource'
  | 'select'
  | 'turn'
  | 'victory';

function cueForEvents(events: readonly GameEvent[]): GameSoundCue {
  if (events.some((event) => event.type === 'match-completed'))
    return 'victory';
  if (events.some((event) => event.type === 'objective-claimed'))
    return 'quest';
  if (events.some((event) => event.type === 'monster-slain')) return 'combat';
  if (events.some((event) => event.type === 'raid-damaged')) return 'combat';
  if (events.some((event) => event.type === 'die-bumped')) return 'bump';
  if (events.some((event) => event.type === 'die-upgraded')) return 'forge';
  if (events.some((event) => event.type === 'card-played')) return 'card';
  if (events.some((event) => event.type === 'card-acquired')) return 'acquire';
  if (events.some((event) => event.type === 'die-placed')) return 'place';
  if (events.some((event) => event.type === 'player-passed')) return 'pass';
  if (events.some((event) => event.type === 'round-started')) return 'turn';
  return 'resource';
}

/**
 * A tiny procedural score for moment-to-moment feedback. It deliberately uses
 * Web Audio rather than bundled files, so the game gains tactile sound now and
 * every cue can later be swapped for a licensed sample without changing the
 * engine or action flow.
 */
function useGameAudio(enabled: boolean) {
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(
    () => () => {
      const context = contextRef.current;
      contextRef.current = null;
      if (context && context.state !== 'closed') void context.close();
    },
    [],
  );

  return useCallback(
    (cue: GameSoundCue, force = false) => {
      if (!enabled && !force) return;
      const AudioContextConstructor =
        window.AudioContext ??
        (
          window as typeof window & {
            readonly webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const context =
        contextRef.current ??
        (contextRef.current = new AudioContextConstructor());

      const score = () => {
        const now = context.currentTime;
        const tone = (
          frequency: number,
          duration: number,
          delay = 0,
          type: OscillatorType = 'sine',
          volume = 0.028,
          endFrequency?: number,
        ) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const start = now + delay;
          const end = start + duration;
          oscillator.type = type;
          oscillator.frequency.setValueAtTime(frequency, start);
          if (endFrequency) {
            oscillator.frequency.exponentialRampToValueAtTime(
              Math.max(20, endFrequency),
              end,
            );
          }
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, end);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(start);
          oscillator.stop(end + 0.02);
        };

        if (cue === 'dice') {
          [240, 310, 270, 360, 420].forEach((frequency, index) =>
            tone(frequency, 0.055, index * 0.055, 'square', 0.014),
          );
          tone(120, 0.19, 0.28, 'sine', 0.035, 70);
        } else if (cue === 'place') {
          tone(105, 0.2, 0, 'sine', 0.042, 48);
          tone(460, 0.14, 0.055, 'triangle', 0.018, 620);
        } else if (cue === 'select') {
          tone(520, 0.075, 0, 'triangle', 0.018, 680);
        } else if (cue === 'panel') {
          tone(330, 0.08, 0, 'triangle', 0.012, 410);
        } else if (cue === 'card') {
          [440, 660, 880].forEach((frequency, index) =>
            tone(frequency, 0.18, index * 0.045, 'triangle', 0.022),
          );
        } else if (cue === 'acquire' || cue === 'resource') {
          tone(760, 0.11, 0, 'sine', 0.024);
          tone(cue === 'acquire' ? 1180 : 960, 0.18, 0.07, 'sine', 0.025);
        } else if (cue === 'combat') {
          tone(125, 0.28, 0, 'sawtooth', 0.044, 42);
          tone(58, 0.32, 0.025, 'square', 0.026, 34);
        } else if (cue === 'bump') {
          tone(170, 0.16, 0, 'sawtooth', 0.036, 68);
          tone(540, 0.09, 0.1, 'square', 0.017, 340);
        } else if (cue === 'forge') {
          tone(170, 0.1, 0, 'square', 0.025, 120);
          tone(240, 0.11, 0.105, 'square', 0.025, 160);
          tone(740, 0.28, 0.2, 'triangle', 0.025);
        } else if (cue === 'quest' || cue === 'victory') {
          const notes =
            cue === 'victory' ? [392, 523, 659, 784] : [392, 523, 659];
          notes.forEach((frequency, index) =>
            tone(frequency, 0.42, index * 0.09, 'triangle', 0.026),
          );
        } else if (cue === 'turn') {
          tone(520, 0.2, 0, 'sine', 0.018);
          tone(780, 0.28, 0.09, 'sine', 0.022);
        } else if (cue === 'pass') {
          tone(300, 0.2, 0, 'triangle', 0.02, 180);
        } else {
          tone(145, 0.2, 0, 'square', 0.022, 92);
        }
      };

      if (context.state === 'suspended') {
        void context
          .resume()
          .then(score)
          .catch(() => undefined);
      } else {
        score();
      }
    },
    [enabled],
  );
}

/**
 * Cosmetic tumbling for the dice tray. This is a dice game in which the player
 * had never actually seen a die roll — values simply changed between rounds.
 * The faces shown mid-tumble are decoration only and are never read back into
 * game state, so determinism and replays are untouched.
 */
function useDiceRoll(
  dice: readonly PlayerState['dice'][number][] | undefined,
  reducedMotion: boolean,
): {
  readonly rolling: boolean;
  readonly rollKey: number;
  readonly faceFor: (dieId: DieId) => number;
} {
  // Signature of the engine's rolled values; a change means fresh dice.
  const signature = (dice ?? [])
    .map((die) => `${die.id}:${die.rolledFaceIndex ?? 'x'}`)
    .join('|');
  const [rolling, setRolling] = useState(false);
  const [tick, setTick] = useState(0);
  const [rollKey, setRollKey] = useState(0);

  useEffect(() => {
    if (reducedMotion || signature === '') return;
    setRollKey((current) => current + 1);
    setRolling(true);
    const spin = window.setInterval(
      () => setTick((current) => current + 1),
      ROLL_TICK_MS,
    );
    const stop = window.setTimeout(() => {
      window.clearInterval(spin);
      setRolling(false);
    }, ROLL_DURATION_MS);
    return () => {
      window.clearInterval(spin);
      window.clearTimeout(stop);
      setRolling(false);
    };
  }, [reducedMotion, signature]);

  const faceFor = (dieId: DieId) => {
    // Vary per die so they do not tumble in lockstep.
    let hash = tick * 31;
    for (let index = 0; index < dieId.length; index += 1)
      hash = (hash * 33 + dieId.charCodeAt(index)) >>> 0;
    return (hash % 6) + 1;
  };
  return { rolling, rollKey, faceFor };
}

/**
 * Sidebar tabs, with a predicate for whether a turn can still be spent there.
 * Keeping this as data means the five buttons stay identical in behaviour and
 * the "where should I look?" signal is defined in one place.
 */
const PANEL_SHORTCUTS: readonly {
  readonly id: CollapsiblePanelId;
  readonly label: string;
  readonly hasAction: (actions: readonly GameAction[]) => boolean;
}[] = [
  {
    id: 'cards',
    label: 'Cards',
    hasAction: (actions) =>
      actions.some(
        (action) =>
          action.type === 'play-card' || action.type === 'acquire-card',
      ),
  },
  { id: 'quests', label: 'Quests', hasAction: () => false },
  {
    id: 'forge',
    label: 'Forge',
    hasAction: (actions) =>
      actions.some((action) => action.type === 'upgrade-die'),
  },
  { id: 'log', label: 'Log', hasAction: () => false },
  { id: 'pressure', label: 'Pressure', hasAction: () => false },
];

type CollapsiblePanelId = 'pressure' | 'quests' | 'cards' | 'forge' | 'log';

type ActivePanelId = CollapsiblePanelId | null;

function CollapsiblePanel({
  ariaLabel,
  ariaLive,
  children,
  className,
  contentId,
  dataTutorial,
  open,
  style,
  summary,
  title,
  titleLevel = 3,
  onToggle,
}: {
  readonly ariaLabel?: string;
  readonly ariaLive?: 'off' | 'polite' | 'assertive';
  readonly children: ReactNode;
  readonly className: string;
  readonly contentId: string;
  readonly dataTutorial?: string;
  readonly open: boolean;
  readonly summary?: ReactNode;
  readonly style?: CSSProperties;
  readonly title: ReactNode;
  readonly titleLevel?: 2 | 3;
  readonly onToggle: () => void;
}) {
  const Heading = titleLevel === 2 ? 'h2' : 'h3';
  return (
    <section
      aria-label={ariaLabel}
      aria-live={ariaLive}
      className={`${className} collapsible-panel ${open ? 'is-open' : 'is-collapsed'}`}
      data-tutorial={dataTutorial}
      style={style}
    >
      <div className="panel-heading collapsible-heading">
        <Heading>{title}</Heading>
        <span className="panel-summary">{summary}</span>
        {!open && (
          <button
            aria-controls={contentId}
            aria-expanded={open}
            className="panel-toggle"
            onClick={onToggle}
            type="button"
          >
            Open
          </button>
        )}
      </div>
      {open && (
        <div className="collapsible-content" id={contentId}>
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * Makes a location's monster read as a monster. Without this the Elder Dragon
 * shows only its printed reward — one influence — which hides the raid, its
 * health, and the bounty that is the whole reason to go there.
 */
function EncounterSummary({
  game,
  human,
  location,
  selectedDie,
}: {
  readonly game: GameState;
  readonly human: PlayerState | undefined;
  readonly location: GameState['locations'][number];
  readonly selectedDie: PlayerState['dice'][number] | null;
}) {
  const encounter = location.encounter;
  if (!encounter) return null;

  if (encounter.health === undefined) {
    return (
      <div className="encounter-strip hunt" style={encounterArtStyle('hunt')}>
        <div className="encounter-title">
          <strong>⚔ {encounter.beasts.join(' · ')}</strong>
          <span>Monster hunt</span>
        </div>
        <p>
          Beat a beast&apos;s threat to slay it. Every point over loots +1{' '}
          {encounter.loot}; a 6 or a masterwork face crits for +
          {encounter.criticalBonus}★.
        </p>
      </div>
    );
  }

  const health = encounter.health;
  const remaining = Math.max(0, health - (game.raidDamage[location.id] ?? 0));
  const beast = encounter.beasts[0] ?? location.name;
  if (remaining === 0) {
    return (
      <div className="encounter-strip slain">
        <div className="encounter-title">
          <strong>☠ {beast} slain</strong>
          <span>The hoard is claimed</span>
        </div>
      </div>
    );
  }
  const incoming = human && selectedDie ? raidDamageFor(human, selectedDie) : 0;
  const incomingLabel =
    human && selectedDie ? raidDamageLabel(human, selectedDie) : '';
  const contributions = raidContributionRows(game, location, human?.id);
  const dealt = health - remaining;
  const lethal = incoming >= remaining;
  const survived = game.raidRoundsSurvived?.[location.id] ?? 0;
  const bounty = raidBountyFor(location, survived);
  return (
    <div
      className={`encounter-strip raid ${lethal ? 'lethal' : ''}`}
      style={encounterArtStyle('raid')}
    >
      <div className="encounter-title">
        <strong>⚔ {beast}</strong>
        <span>
          {remaining}/{health} health · {bounty}★ hoard
          {survived > 0 ? ` · survived ${survived}` : ''}
        </span>
      </div>
      <div
        className="encounter-health"
        role="img"
        aria-label={`${beast} has ${remaining} of ${health} health remaining`}
      >
        <span style={{ width: `${(remaining / health) * 100}%` }} />
      </div>
      <div className="raid-breakdown" aria-label="Raid damage breakdown">
        <strong>{dealt} damage already dealt</strong>
        {contributions.length > 0 ? (
          contributions.map((row) => (
            <span key={`${row.owner}-${row.die.id}`}>
              {row.owner}: die {dieValue(row.die)} →{' '}
              {row.breakdown.factionBonus > 0
                ? `${row.breakdown.base} + ${row.breakdown.factionBonus} faction`
                : row.breakdown.base}{' '}
              = {row.breakdown.total}
            </span>
          ))
        ) : (
          <span>No dice have wounded this raid yet.</span>
        )}
      </div>
      <p>
        {incoming > 0
          ? lethal
            ? `Selected die damage: ${incomingLabel}. That is the KILLING BLOW, claiming ${bounty}★ and the hoard.`
            : `Selected die damage: ${incomingLabel}, leaving ${remaining - incoming}. Only the finisher takes the ${bounty}★ bounty.`
          : `Any die wounds it by its value, doubled on a 6 or masterwork face. The finisher takes ${bounty}★ — and the hoard grows every round it lives.`}
      </p>
    </div>
  );
}

/**
 * Shows the themed run being built this round and what the next link pays, so
 * the sequencing decision is visible instead of buried in the rules.
 */
function MomentumMeter({ player }: { readonly player: PlayerState }) {
  const length = player.chain?.length ?? 0;
  const nextBonus = chainBonusFor(length + 1);
  const theme = player.chain?.tags[0];
  return (
    <section
      className={`momentum ${length >= 3 ? 'is-hot' : ''}`}
      aria-label="Momentum"
      data-tutorial="momentum"
    >
      <div className="momentum-head">
        <strong>
          {length === 0 ? 'No run yet' : `${theme ?? 'themed'} run · ${length}`}
        </strong>
        <span>
          {nextBonus > 0
            ? `Next link +${nextBonus}★`
            : 'Chain 3 in a theme to score'}
        </span>
      </div>
      <div className="momentum-pips" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => (
          <i
            className={
              step <= length
                ? chainBonusFor(step) > 0
                  ? 'lit scoring'
                  : 'lit'
                : ''
            }
            key={step}
          />
        ))}
      </div>
    </section>
  );
}

function LocationDecisionDock({
  game,
  human,
  inspectedLocation,
  isPinned,
  selectedDie,
  selectedDieId,
  onClearPin,
}: {
  readonly game: GameState;
  readonly human: PlayerState | undefined;
  readonly inspectedLocation: GameState['locations'][number] | undefined;
  readonly isPinned: boolean;
  readonly selectedDie: PlayerState['dice'][number] | null;
  readonly selectedDieId: DieId | null;
  readonly onClearPin: () => void;
}) {
  if (!inspectedLocation) {
    return (
      <section className="decision-dock" aria-live="polite">
        <div>
          <p className="eyebrow">Location decision</p>
          <h2>Hover or click a region</h2>
        </div>
        <p>
          Pick a die, then use this dock to compare rewards and see exactly why
          each square is playable or blocked.
        </p>
      </section>
    );
  }

  const openSlots = inspectedLocation.slots.filter(
    (slot) => slot.isOpen !== false,
  );
  return (
    <section
      className={`decision-dock ${isPinned ? 'is-pinned' : ''}`}
      aria-live="polite"
      data-tutorial="preview"
    >
      <div className="decision-dock-header">
        <div>
          <p className="eyebrow">
            {isPinned ? 'Pinned location' : 'Hovered location'}
          </p>
          <h2>{inspectedLocation.name}</h2>
        </div>
        {isPinned && (
          <button type="button" onClick={onClearPin}>
            Clear pin
          </button>
        )}
      </div>
      <p>{inspectedLocation.description}</p>
      {human &&
        (() => {
          const next = extendChain(human.chain, inspectedLocation.tags);
          const bonus = chainBonusFor(next.length);
          const continues = next.length > 1;
          return (
            <p
              className={`chain-hint ${continues ? 'continues' : 'breaks'} ${bonus > 0 ? 'scores' : ''}`}
            >
              {continues
                ? `🔥 Continues your run → ${next.length}${bonus > 0 ? ` for +${bonus}★` : ''}`
                : (human.chain?.length ?? 0) > 0
                  ? `Breaks your run and starts a new ${inspectedLocation.tags[0] ?? 'themed'} one`
                  : `Starts a ${inspectedLocation.tags[0] ?? 'themed'} run`}
            </p>
          );
        })()}
      <EncounterSummary
        game={game}
        human={human}
        location={inspectedLocation}
        selectedDie={selectedDie}
      />
      <div className="decision-dock-reward">
        <span>Reward</span>
        <ResourceList includeVictoryPoints values={inspectedLocation.reward} />
        <span>
          {inspectedLocation.isActive === false
            ? 'Sealed this round'
            : `${openSlots.length} open slot${openSlots.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <ul className="decision-slot-list">
        {inspectedLocation.slots.map((slot, index) => {
          const placement: GameAction | null =
            selectedDieId && human
              ? {
                  type: 'place-die',
                  playerId: human.id,
                  dieId: selectedDieId,
                  locationId: inspectedLocation.id,
                  slotId: slot.id,
                }
              : null;
          let validation = placement ? validateAction(game, placement) : null;
          let isBump = false;
          if (
            validation &&
            !validation.legal &&
            selectedDieId &&
            human &&
            slot.occupantDieId !== null &&
            slot.occupantPlayerId !== human.id
          ) {
            const bump = validateAction(game, {
              type: 'bump-die',
              playerId: human.id,
              dieId: selectedDieId,
              locationId: inspectedLocation.id,
              slotId: slot.id,
            });
            if (bump.legal) {
              validation = bump;
              isBump = true;
            }
          }
          const status = !selectedDie
            ? 'Inspect'
            : validation?.legal
              ? isBump
                ? 'Bump'
                : 'Playable'
              : 'Blocked';
          return (
            <li
              className={`decision-slot ${status.toLowerCase()}`}
              key={slot.id}
            >
              <strong>{index + 1}</strong>
              <span className="decision-slot-main">
                <RequirementTokens requirement={slot.requirement} />
                <b>{status}</b>
              </span>
              <em>
                {!selectedDie
                  ? 'Select a die to test this square.'
                  : validation?.legal
                    ? isBump
                      ? 'Can bump the rival die here.'
                      : 'This die can be placed here.'
                    : (validation?.message ?? 'No legal placement here.')}
              </em>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function App() {
  const [selectedFaction, setSelectedFaction] = useState<FactionId>(
    factions[0].id,
  );
  // Chosen so Forge Hall opens in round one, keeping the tutorial's Forge step
  // demonstrable on a first run.
  const [seed, setSeed] = useState('shattered-crown-008');
  const [difficulty, setDifficulty] = useState<CpuDifficulty>('knight');
  const [game, setGame] = useState<GameState | null>(null);
  const [selectedDieId, setSelectedDieId] = useState<DieId | null>(null);
  const [draggingDieId, setDraggingDieId] = useState<DieId | null>(null);
  const [upgradeDieId, setUpgradeDieId] = useState<DieId | null>(null);
  const [upgradeFaceIndex, setUpgradeFaceIndex] = useState(0);
  const [log, setLog] = useState<readonly string[]>([]);
  const [callout, setCallout] = useState<Callout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredLocationId, setHoveredLocationId] = useState<LocationId | null>(
    null,
  );
  const [pinnedLocationId, setPinnedLocationId] = useState<LocationId | null>(
    null,
  );
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialCompleted, setTutorialCompleted] = useState(
    () => localStorage.getItem(TUTORIAL_KEY) === 'true',
  );
  // The realm is the game. Start with the optional information trays closed
  // so a new turn reads as a board game, not as a dashboard of competing panes.
  const [activePanel, setActivePanel] = useState<ActivePanelId>(null);
  const [marketExpanded, setMarketExpanded] = useState(false);
  const [utilitiesOpen, setUtilitiesOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem(SOUND_KEY) !== 'false',
  );
  const reducedMotion = useInterfaceStore((state) => state.reducedMotion);
  const toggleReducedMotion = useInterfaceStore(
    (state) => state.toggleReducedMotion,
  );

  const human = game?.players.find((player) => player.controller === 'human');
  const cpu = game?.players.find((player) => player.controller === 'cpu');
  const activePlayer = game?.players.find(
    (player) => player.id === game.turn.activePlayerId,
  );
  const legalActions = useMemo(
    () => (game ? enumerateLegalActions(game) : []),
    [game],
  );
  const diceRoll = useDiceRoll(human?.dice, reducedMotion);
  const playSound = useGameAudio(soundEnabled);
  /** Who is ahead on the real scoring rules, and by how much. */
  const leader = useMemo(() => {
    if (!game) return { id: null as PlayerId | null, margin: 0 };
    const totals = game.players.map((player) => ({
      id: player.id,
      score: scoreTotal(game, player.id),
    }));
    const sorted = [...totals].sort((left, right) => right.score - left.score);
    const top = sorted[0];
    const chaser = sorted[1];
    if (!top) return { id: null as PlayerId | null, margin: 0 };
    return {
      id: top.id,
      margin: top.score - (chaser?.score ?? top.score),
    };
  }, [game]);
  const inspectedLocationId = pinnedLocationId ?? hoveredLocationId;
  const inspectedLocation = game?.locations.find(
    (location) => location.id === inspectedLocationId,
  );
  const selectedDie =
    human?.dice.find((die) => die.id === selectedDieId) ?? null;
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSelectedDieId(null);
      setPinnedLocationId(null);
      setHoveredLocationId(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);
  const selectedDieRoutes = useMemo(() => {
    if (!game || !selectedDieId) return [];
    return legalActions.filter(
      (action) =>
        (action.type === 'place-die' || action.type === 'bump-die') &&
        action.dieId === selectedDieId,
    );
  }, [game, legalActions, selectedDieId]);
  const movePreviews = useMemo(() => {
    if (!game || !human || activePlayer?.controller !== 'human') return [];
    return legalActions
      .filter(
        (
          action,
        ): action is Extract<GameAction, { type: 'place-die' | 'bump-die' }> =>
          (action.type === 'place-die' || action.type === 'bump-die') &&
          action.playerId === human.id &&
          (!selectedDieId || action.dieId === selectedDieId),
      )
      .map((action) => previewMove(game, human, action))
      .filter((preview): preview is MovePreview => preview !== null)
      .sort((left, right) => right.score - left.score);
  }, [activePlayer?.controller, game, human, legalActions, selectedDieId]);
  const rivalPreviews = useMemo(() => {
    if (!game || !cpu || activePlayer?.controller !== 'human') return [];
    const hypothetical: GameState = {
      ...game,
      turn: { ...game.turn, activePlayerId: cpu.id },
    };
    return enumerateLegalActions(hypothetical)
      .filter(
        (
          action,
        ): action is Extract<GameAction, { type: 'place-die' | 'bump-die' }> =>
          (action.type === 'place-die' || action.type === 'bump-die') &&
          action.playerId === cpu.id,
      )
      .map((action) => previewMove(hypothetical, cpu, action))
      .filter((preview): preview is MovePreview => preview !== null)
      .sort((left, right) => right.score - left.score);
  }, [activePlayer?.controller, cpu, game]);
  const hoverLocation = (locationId: LocationId | null) => {
    setHoveredLocationId(locationId);
  };
  const pinLocation = (locationId: LocationId | null) => {
    setPinnedLocationId(locationId);
  };
  const selectDieForPlanning = (dieId: DieId) => {
    playSound('select');
    setSelectedDieId(dieId);
  };
  const showPanel = (panel: CollapsiblePanelId) => {
    playSound('panel');
    setActivePanel((current) => (current === panel ? null : panel));
  };
  const pressure = useMemo(() => {
    if (!game || !human) return null;
    const openLocations = game.locations.filter(
      (location) => location.isActive !== false,
    );
    const openSlots = openLocations.flatMap((location) =>
      location.slots
        .filter((slot) => slot.isOpen !== false)
        .map((slot) => ({ location, slot })),
    );
    const occupiedSlots = openSlots.filter(
      ({ slot }) => slot.occupantDieId !== null,
    );
    const placementActions = legalActions.filter(
      (action) => action.type === 'place-die',
    );
    const readyDice = human.dice.filter((die) => die.status === 'ready');
    const readyDiceWithRoutes = new Set(
      placementActions
        .filter((action) => action.playerId === human.id)
        .map((action) => (action.type === 'place-die' ? action.dieId : null)),
    );
    const lowDice = readyDice.filter((die) => {
      const face =
        die.rolledFaceIndex === null ? null : die.faces[die.rolledFaceIndex];
      return Boolean(face && face.value <= 2);
    });
    const lowDiceWithRoutes = lowDice.filter((die) =>
      readyDiceWithRoutes.has(die.id),
    );
    return {
      openLocations: openLocations.length,
      sealedLocations: game.locations.length - openLocations.length,
      remainingSlots: openSlots.length - occupiedSlots.length,
      totalOpenSlots: openSlots.length,
      lowRollRoutes: openSlots.filter(({ slot }) =>
        isLowRollFriendly(slot.requirement),
      ).length,
      readyDice: readyDice.length,
      readyDiceWithRoutes: readyDice.filter((die) =>
        readyDiceWithRoutes.has(die.id),
      ).length,
      lowDice: lowDice.length,
      lowDiceWithRoutes: lowDiceWithRoutes.length,
    };
  }, [game, human, legalActions]);
  const forgeUnlocked = Boolean(
    human &&
    game?.locations.some(
      (location) =>
        location.tags.includes('forge') &&
        location.slots.some((slot) => slot.occupantPlayerId === human.id),
    ),
  );

  const appendEvents = useCallback(
    (events: readonly GameEvent[], nextState: GameState) => {
      playSound(cueForEvents(events));
      setLog((current) =>
        [
          ...events.map((event) => describeEvent(event, nextState)),
          ...current,
        ].slice(0, 80),
      );
      const headline = events
        .map((event) => calloutFor(event, nextState))
        .filter((item): item is Callout => item !== null)
        .sort((left, right) => right.weight - left.weight)[0];
      if (headline) setCallout({ ...headline, key: nextState.eventSequence });
    },
    [playSound],
  );

  const launchActionFeedback = useCallback(
    (before: GameState, events: readonly GameEvent[]) => {
      if (reducedMotion) return;
      const placement = events.find(
        (event): event is Extract<GameEvent, { type: 'die-placed' }> =>
          event.type === 'die-placed',
      );
      if (placement) {
        const actor = before.players.find(
          (player) => player.id === placement.playerId,
        );
        const die = actor?.dice.find((item) => item.id === placement.dieId);
        if (actor?.controller === 'human') {
          throwDieToBoard(
            placement.dieId,
            placement.locationId,
            die ? String(dieValue(die)) : '',
            die?.affinity ?? 'neutral',
          );
        } else {
          throwPiece(
            `[data-player-id="${placement.playerId}"] .faction-portrait`,
            `[data-testid="location-hotspot-${placement.locationId}"]`,
            die ? String(dieValue(die)) : '◆',
            `die-flight die-${die?.affinity ?? 'martial'} rival-flight`,
          );
        }
        window.setTimeout(
          () => {
            for (const event of events) {
              if (
                event.type === 'resource-gained' &&
                event.playerId === placement.playerId
              ) {
                throwRewardToPlayer(
                  placement.locationId,
                  event.playerId,
                  event.resource,
                  event.amount,
                );
              }
            }
          },
          Math.round(FLIGHT_MS * 0.55),
        );
      }

      for (const event of events) {
        if (event.type === 'monster-slain' || event.type === 'raid-damaged') {
          const selector = `[data-testid="location-hotspot-${event.locationId}"]`;
          pulseElement(selector, 'combat-impact', 900);
          burstAt(
            selector,
            event.type === 'monster-slain' ? '⚔' : '✦',
            event.type === 'monster-slain'
              ? 'combat-burst victory-burst'
              : 'combat-burst',
          );
        }
        if (event.type === 'die-bumped') {
          const selector = `[data-testid="location-hotspot-${event.locationId}"]`;
          pulseElement(selector, 'bump-impact', 850);
          burstAt(selector, '↯', 'bump-burst');
        }
        if (event.type === 'card-acquired' || event.type === 'card-played') {
          throwCardToPlayer(event.cardId, event.playerId);
          pulseElement(
            `[data-player-id="${event.playerId}"]`,
            'card-impact',
            720,
          );
        }
      }
    },
    [reducedMotion],
  );

  const startMatch = (guided = false) => {
    const selectedIndex = factions.findIndex(
      (faction) => faction.id === selectedFaction,
    );
    const cpuFaction =
      factions[(selectedIndex + 1) % factions.length] ?? factions[1];
    const created = createGame({
      seed: seed.trim() || 'shattered-crown-001',
      humanFactionId: selectedFaction,
      cpuFactionId: cpuFaction.id,
      content: { factions, locations, cards, upgrades, objectives },
    });
    setGame(created.state);
    playSound('dice');
    setSelectedDieId(null);
    setUpgradeDieId(created.state.players[0]?.dice[0]?.id ?? null);
    setError(null);
    setTutorialOpen(guided);
    setLog(
      created.events
        .map((event) => describeEvent(event, created.state))
        .reverse(),
    );
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' }),
    );
  };

  const submitHumanAction = (action: GameAction) => {
    if (!game) return;
    const validation = validateAction(game, action);
    if (!validation.legal) {
      playSound('error');
      setError(validation.message);
      return;
    }
    const result = applyAction(game, action);
    launchActionFeedback(game, result.events);
    setGame(result.state);
    appendEvents(result.events, result.state);
    setSelectedDieId(null);
    setError(null);
  };

  const placeAtLocation = (
    locationId: LocationId,
    requestedDieId: DieId | null,
  ) => {
    if (!game || !human) return;
    if (activePlayer?.controller !== 'human') {
      playSound('error');
      setError('The CPU is considering its move.');
      return;
    }
    const dieId = requestedDieId ?? selectedDieId;
    if (!dieId) {
      playSound('error');
      setError('Select or drag a ready die before choosing a location.');
      return;
    }
    const location = game.locations.find((item) => item.id === locationId);
    if (!location) return;
    // Prefer a free slot; fall back to contesting an enemy-held one.
    const candidates: GameAction[] = [
      ...location.slots.map((slot): GameAction => ({
        type: 'place-die',
        playerId: human.id,
        dieId,
        locationId,
        slotId: slot.id,
      })),
      ...location.slots.map((slot): GameAction => ({
        type: 'bump-die',
        playerId: human.id,
        dieId,
        locationId,
        slotId: slot.id,
      })),
    ];
    const legal = candidates.find(
      (candidate) => validateAction(game, candidate).legal,
    );
    if (legal) {
      submitHumanAction(legal);
      if (
        legal.type === 'place-die' &&
        location.tags.includes('forge') &&
        human.id === legal.playerId
      ) {
        setActivePanel('forge');
      }
      return;
    }
    const rejection = candidates
      .map((candidate) => validateAction(game, candidate))
      .find((result) => !result.legal);
    setError(
      rejection && !rejection.legal
        ? rejection.message
        : 'No legal slot is available at that location.',
    );
    playSound('error');
  };

  useEffect(() => {
    if (!game || game.phase !== 'action' || activePlayer?.controller !== 'cpu')
      return;
    const matchId = game.id;
    const turnNumber = game.turn.turnNumber;
    const timer = window.setTimeout(() => {
      if (game.id !== matchId || game.turn.turnNumber !== turnNumber) return;
      const result = applyAction(game, chooseCpuAction(game, difficulty));
      launchActionFeedback(game, result.events);
      setGame(result.state);
      appendEvents(result.events, result.state);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [
    activePlayer?.controller,
    appendEvents,
    difficulty,
    game,
    launchActionFeedback,
  ]);

  const saveMatch = () => {
    if (!game) return;
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        envelopeVersion: SAVE_ENVELOPE_VERSION,
        game: JSON.parse(serializeGame(game)),
        difficulty,
      } satisfies SavedMatchEnvelope),
    );
    setError('Match saved locally.');
  };

  const resumeMatch = () => {
    const saved = localStorage.getItem(SAVE_KEY);
    if (!saved) {
      setError('No saved debug match was found.');
      return;
    }
    try {
      const restored = parseSavedMatch(saved);
      setGame(restored.game);
      if (restored.difficulty) setDifficulty(restored.difficulty);
      setSelectedDieId(null);
      setUpgradeDieId(
        restored.game.players.find((player) => player.controller === 'human')
          ?.dice[0]?.id ?? null,
      );
      setLog(['Saved match restored.']);
      setError(null);
      requestAnimationFrame(() =>
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The save could not be restored.',
      );
    }
  };

  if (!game) {
    const selectedFactionDetails = factions.find(
      (faction) => faction.id === selectedFaction,
    );
    return (
      <main className="setup-shell" style={panelArtStyle(titleHeroArt)}>
        <section className="setup-card">
          <header className="setup-intro">
            <p className="eyebrow">A high-fantasy dice-placement duel</p>
            <h1>Realms of the Shattered Crown</h1>
            <p className="lede">
              Roll your house dice. Claim the realm. Build an engine worthy of
              the crown before six rounds run out.
            </p>
            <div className="setup-promise" aria-label="Match summary">
              <span>
                <strong>6</strong> rounds
              </span>
              <span>
                <strong>5</strong> dice
              </span>
              <span>
                <strong>1</strong> crown
              </span>
            </div>
          </header>

          <div className="setup-config">
            <fieldset className="faction-picker">
              <legend>Choose your house</legend>
              <div className="faction-options">
                {factions.map((faction) => (
                  <button
                    aria-pressed={selectedFaction === faction.id}
                    className={
                      selectedFaction === faction.id ? 'is-selected' : ''
                    }
                    key={faction.id}
                    onClick={() => setSelectedFaction(faction.id)}
                    type="button"
                  >
                    <img alt="" src={FACTION_PORTRAITS[faction.id]} />
                    <span>{faction.name}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <article className="setup-selection">
              <img
                alt=""
                className="setup-portrait"
                src={FACTION_PORTRAITS[selectedFaction]}
              />
              <div>
                <span className="eyebrow">Your house</span>
                <h2>{selectedFactionDetails?.name}</h2>
                <p className="ability">
                  {selectedFactionDetails?.passiveAbility}
                </p>
                <p className="ability scoring">
                  <strong>Legacy:</strong> {selectedFactionDetails?.scoringRule}
                </p>
              </div>
            </article>

            <div className="setup-options">
              <label>
                Opponent
                <select
                  value={difficulty}
                  onChange={(event) =>
                    setDifficulty(event.target.value as CpuDifficulty)
                  }
                >
                  {CPU_DIFFICULTIES.map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Match seed
                <input
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                />
              </label>
            </div>
            <p className="setup-difficulty">
              {
                CPU_DIFFICULTIES.find((tier) => tier.id === difficulty)
                  ?.description
              }
            </p>
            <div className="button-row setup-actions">
              <button
                className="primary"
                type="button"
                onClick={() => startMatch()}
              >
                Start match
              </button>
              <button type="button" onClick={() => startMatch(true)}>
                {tutorialCompleted ? 'Replay guided tutorial' : 'Learn to play'}
              </button>
              <button type="button" onClick={resumeMatch}>
                Resume saved match
              </button>
            </div>
            {error && (
              <p className="notice" role="status">
                {error}
              </p>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`game-shell phase-${game.phase} ${reducedMotion ? 'reduced-motion' : ''} ${selectedDieId ? 'is-planning' : ''} ${pinnedLocationId ? 'is-inspecting' : ''} ${activePlayer?.controller === 'cpu' ? 'is-cpu-turn' : 'is-human-turn'} ${callout ? `event-active event-${callout.tone}` : ''}`}
      style={tableArtStyle()}
    >
      {callout && (
        <div
          aria-hidden="true"
          className={`event-flare event-flare-${callout.tone}`}
          key={callout.key}
        />
      )}
      <header className="game-header" data-tutorial="header">
        <div>
          <p className="eyebrow">Six rounds to claim the crown</p>
          <h1>Shattered Crown</h1>
        </div>
        <div className="round-block">
          <span
            className={`phase-badge phase-${game.phase === 'complete' ? 'complete' : 'action'}`}
          >
            {game.phase === 'complete' ? 'Final scoring' : 'Action phase'}
          </span>
          <strong>
            Round {game.round.number} / {game.round.maximum}
          </strong>
          <span>
            {game.phase === 'complete'
              ? 'Final scoring'
              : `${activePlayer?.name ?? '—'} to act`}
          </span>
          <span
            className="round-pips"
            aria-label={`Round ${game.round.number}`}
          >
            {Array.from({ length: game.round.maximum }, (_, index) => {
              const round = index + 1;
              return (
                <i
                  className={
                    round < game.round.number
                      ? 'is-complete'
                      : round === game.round.number
                        ? 'is-current'
                        : ''
                  }
                  key={round}
                />
              );
            })}
          </span>
        </div>
        <div
          aria-label="Game menu"
          className={`button-row compact ${utilitiesOpen ? 'is-open' : ''}`}
          data-tutorial="menu"
        >
          <button
            className="utility-secondary"
            type="button"
            onClick={() => setTutorialOpen(true)}
          >
            How to play
          </button>
          <button
            className="utility-secondary"
            type="button"
            onClick={toggleReducedMotion}
          >
            Motion {reducedMotion ? 'off' : 'on'}
          </button>
          <button
            className="utility-secondary"
            aria-pressed={soundEnabled}
            type="button"
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              localStorage.setItem(SOUND_KEY, String(next));
              if (next) playSound('turn', true);
            }}
          >
            Sound {soundEnabled ? 'on' : 'off'}
          </button>
          <button
            className="utility-secondary"
            type="button"
            onClick={saveMatch}
          >
            Save
          </button>
          <button
            className="utility-secondary"
            type="button"
            onClick={() => setGame(null)}
          >
            Restart
          </button>
          <button
            aria-expanded={utilitiesOpen}
            className="utility-menu"
            type="button"
            onClick={() => setUtilitiesOpen((current) => !current)}
          >
            <span aria-hidden="true">☰</span>
            {utilitiesOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>

      <section className="player-strip" data-tutorial="players">
        {game.players.map((player) => (
          <article
            className={
              player.id === game.turn.activePlayerId && game.phase === 'action'
                ? 'player active'
                : 'player'
            }
            key={player.id}
            data-player-id={player.id}
          >
            {player.id === game.turn.activePlayerId &&
              game.phase === 'action' && (
                <span className="active-turn-badge">
                  <i aria-hidden="true" /> Active
                </span>
              )}
            <img
              alt=""
              className="faction-portrait"
              src={FACTION_PORTRAITS[player.factionId]}
            />
            <div className="player-identity">
              <strong>{player.name}</strong>
              <span>
                {
                  factions.find((faction) => faction.id === player.factionId)
                    ?.name
                }
              </span>
              {/* Resources are inputs, not goals: icon and count only, with
                  the full explanation still on hover and for screen readers. */}
              <div className="resources">
                {(Object.keys(player.resources) as ResourceType[]).map(
                  (resource) => (
                    <ResourceToken
                      compact
                      key={resource}
                      resource={resource}
                      value={player.resources[resource]}
                    />
                  ),
                )}
              </div>
            </div>
            {/* The standing is the loudest thing on screen, because "am I
                winning?" is the question the old layout could not answer. */}
            <div className="player-score">
              <strong>
                <CountUp
                  reducedMotion={reducedMotion}
                  value={scoreTotal(game, player.id)}
                />
              </strong>
              <span>
                {leader.margin === 0
                  ? 'tied'
                  : leader.id === player.id
                    ? `ahead by ${leader.margin}`
                    : `behind by ${leader.margin}`}
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="crown-track" aria-label="Score track">
        <div className="track-line" aria-hidden="true">
          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45].map((mark) => (
            <span className="track-mark" key={mark}>
              <i>{mark}</i>
            </span>
          ))}
        </div>
        {game.players.map((player) => {
          const score = scoreTotal(game, player.id);
          const capped = Math.max(0, Math.min(45, score));
          return (
            <span
              className={`track-token track-token-${player.controller}`}
              key={player.id}
              style={{ left: `${(capped / 45) * 100}%` }}
              title={`${player.name}: ${score}★`}
            >
              <img alt="" src={FACTION_PORTRAITS[player.factionId]} />
              <strong>{score}</strong>
            </span>
          );
        })}
      </section>

      {game.phase !== 'complete' && (
        <section
          className={`market-ribbon ${marketExpanded ? 'is-expanded' : 'is-collapsed'}`}
          aria-label="Royal card market"
        >
          <div className="market-ribbon-heading">
            <span className="eyebrow">Royal market</span>
            <strong>Available schemes</strong>
            <small>{game.cardDeck.length} cards remain</small>
            <button
              aria-expanded={marketExpanded}
              className="market-ribbon-toggle"
              type="button"
              onClick={() => setMarketExpanded((current) => !current)}
            >
              {marketExpanded ? 'Hide market' : 'Show market'}
            </button>
          </div>
          <div className="market-ribbon-cards">
            {game.cardMarket.map((cardId, index) => {
              const card = game.cards.find((item) => item.id === cardId);
              if (!card || !human) return null;
              const action: GameAction = {
                type: 'acquire-card',
                playerId: human.id,
                cardId,
              };
              const legal = validateAction(game, action).legal;
              return (
                <article
                  className={`market-ribbon-card market-ribbon-${card.category}`}
                  key={`${cardId}-${index}`}
                  style={cardArtStyle(card.category)}
                >
                  <div className="market-ribbon-art" aria-hidden="true" />
                  <div className="market-ribbon-copy">
                    <span>
                      <CategoryToken category={card.category} />
                      <small>Scheme {index + 1}</small>
                    </span>
                    <strong>{card.name}</strong>
                    <p>{card.rulesText}</p>
                  </div>
                  <button
                    disabled={!legal || activePlayer?.controller !== 'human'}
                    onClick={() => submitHumanAction(action)}
                    type="button"
                  >
                    <span>Acquire</span>
                    <ResourceList values={card.cost} />
                  </button>
                </article>
              );
            })}
          </div>
          <button
            className="market-ribbon-more"
            onClick={() => showPanel('cards')}
            type="button"
          >
            Hand &amp; market
          </button>
        </section>
      )}

      {game.phase === 'complete' ? (
        <section
          className="score-panel"
          style={panelArtStyle(victoryScoringArt)}
        >
          <p className="eyebrow">Match complete</p>
          <h2>
            {game.result?.winnerIds.includes(human?.id as never)
              ? 'The realm crowns you'
              : 'The CPU claims the crown'}
          </h2>
          <div className="score-grid">
            {game.players.map((player) => (
              <article key={player.id}>
                <h3>
                  {player.name}: {totalScore(game, player)}
                </h3>
                {game.result?.scores[player.id]?.map((item) => (
                  <p key={item.source}>
                    {item.source}
                    <strong>{item.points}</strong>
                  </p>
                ))}
              </article>
            ))}
          </div>
          <button
            className="primary"
            type="button"
            onClick={() => setGame(null)}
          >
            Play another match
          </button>
        </section>
      ) : (
        <div className="play-area">
          <section
            className={`board-stage ${selectedDieId ? 'is-targeting' : ''} ${pinnedLocationId ? 'has-inspection' : ''}`}
            aria-label="Fantasy board"
            data-tutorial="board"
          >
            {callout && (
              <CalloutBanner
                callout={callout}
                onDone={() => setCallout(null)}
                reducedMotion={reducedMotion}
              />
            )}
            {human && (
              <BoardRenderer
                game={game}
                humanPlayerId={human.id}
                legalActions={legalActions}
                onHoverLocation={hoverLocation}
                onPinLocation={pinLocation}
                onPlaceAtLocation={placeAtLocation}
                pinnedLocationId={pinnedLocationId}
                recommendedAction={
                  selectedDieId ? (movePreviews[0]?.action ?? null) : null
                }
                reducedMotion={reducedMotion}
                selectedDieId={selectedDieId}
              />
            )}
            <LocationDecisionDock
              game={game}
              human={human}
              inspectedLocation={inspectedLocation}
              isPinned={Boolean(
                inspectedLocation && inspectedLocation.id === pinnedLocationId,
              )}
              onClearPin={() => pinLocation(null)}
              selectedDie={selectedDie}
              selectedDieId={selectedDieId}
            />
            <div className="board-caption">
              <span>
                {
                  game.locations.filter(
                    (location) => location.isActive !== false,
                  ).length
                }{' '}
                regions are open this round. Click a location to pin its
                details; select a die to place on glowing routes.
              </span>
            </div>
          </section>

          {human && (
            <aside className="kingdom-tableau" aria-label="Your realm tableau">
              <header>
                <span className="eyebrow">Your domain</span>
                <strong>
                  {
                    factions.find((faction) => faction.id === human.factionId)
                      ?.name
                  }
                </strong>
              </header>
              <div className="kingdom-stat-grid">
                <article>
                  <span>Arcane power</span>
                  <strong>{human.resources.mana}</strong>
                </article>
                <article>
                  <span>Great library</span>
                  <strong>{human.resources.knowledge}</strong>
                </article>
                <article>
                  <span>Forged faces</span>
                  <strong>
                    {human.dice.reduce(
                      (total, die) => total + die.enhancements.length,
                      0,
                    )}
                  </strong>
                </article>
                <article>
                  <span>Court favor</span>
                  <strong>{human.resources.influence}</strong>
                </article>
                <article>
                  <span>Royal treasury</span>
                  <strong>{human.resources.gold}</strong>
                </article>
                <article>
                  <span>Crown standing</span>
                  <strong>{scoreTotal(game, human.id)}</strong>
                </article>
              </div>
              <footer>
                <span>Relics &amp; claims</span>
                <div className="tableau-relics">
                  {[0, 1, 2, 3].map((index) => {
                    const claimed = game.objectives.filter(
                      (objective) => objective.claimedBy === human.id,
                    )[index];
                    return (
                      <i
                        className={claimed ? 'is-filled' : ''}
                        key={index}
                        title={claimed?.name ?? 'Empty relic socket'}
                      >
                        {claimed ? '◆' : ''}
                      </i>
                    );
                  })}
                </div>
              </footer>
            </aside>
          )}

          <aside className="sidebar" data-tutorial="war-table">
            <section
              className="dice-panel"
              data-tutorial="tray"
              style={diceTrayStyle()}
            >
              <h2>Your dice</h2>
              <p>Select a ready die, then choose a highlighted slot.</p>
              <div className="player-pieces">
                <div className="dice" data-tutorial="dice">
                  {human?.dice.map((die) => {
                    const affinity = AFFINITY_INFO[die.affinity];
                    const boost = die.valueBonus ?? 0;
                    const settled =
                      die.rolledFaceIndex === null ? '—' : dieValue(die);
                    // While tumbling, show throwaway faces so the roll reads as
                    // a roll. The settled value is what every rule uses.
                    const value =
                      diceRoll.rolling && die.rolledFaceIndex !== null
                        ? diceRoll.faceFor(die.id)
                        : settled;
                    const rolledFace =
                      die.rolledFaceIndex === null
                        ? null
                        : (die.faces[die.rolledFaceIndex] ?? null);
                    const symbolSummary = rolledFace?.symbols.length
                      ? ` Face grants ${rolledFace.symbols.map(symbolLabel).join(' and ')}.`
                      : '';
                    const forgedSummary = die.enhancements.length
                      ? ` ${die.enhancements.length} forged face${die.enhancements.length === 1 ? '' : 's'} installed.`
                      : '';
                    const classes = [
                      'die',
                      `die-${die.affinity}`,
                      selectedDieId === die.id ? 'selected' : '',
                      draggingDieId === die.id ? 'dragging' : '',
                      boost > 0 ? 'boosted' : '',
                      die.enhancements.length ? 'forged' : '',
                      diceRoll.rolling && die.rolledFaceIndex !== null
                        ? 'rolling'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <button
                        aria-label={`${affinity.label} die, value ${value}${
                          selectedDieId === die.id ? ', selected' : ''
                        }`}
                        aria-pressed={selectedDieId === die.id}
                        className={classes}
                        data-die-id={die.id}
                        data-tooltip={`${affinity.label}: ${affinity.description}${symbolSummary}${forgedSummary}`}
                        disabled={
                          die.status !== 'ready' ||
                          activePlayer?.controller !== 'human'
                        }
                        draggable={
                          die.status === 'ready' &&
                          activePlayer?.controller === 'human'
                        }
                        onDragStart={(event) => {
                          setDraggingDieId(die.id);
                          event.dataTransfer.setData(
                            'application/x-shattered-die',
                            die.id,
                          );
                          selectDieForPlanning(die.id);
                        }}
                        onDragEnd={() => setDraggingDieId(null)}
                        key={die.id}
                        onClick={() => selectDieForPlanning(die.id)}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className={`die-art die-art-${die.affinity}`}
                        >
                          <img alt="" src={fantasyDiceAtlasV1} />
                        </span>
                        {diceRoll.rolling && die.rolledFaceIndex !== null && (
                          <span aria-hidden="true" className="die-roll-flare" />
                        )}
                        <span aria-hidden="true" className="die-glyph">
                          <GameIcon name={affinity.icon} />
                        </span>
                        <strong>{value}</strong>
                        {boost > 0 && (
                          <span className="die-boost">+{boost}</span>
                        )}
                        {rolledFace?.symbols.length ? (
                          <span className="die-symbols" aria-hidden="true">
                            {rolledFace.symbols.map((symbol, index) => (
                              <span
                                className={`die-symbol die-symbol-${symbol}`}
                                key={`${symbol}-${index}`}
                              >
                                <GameIcon name={symbolIcon(symbol)} />
                              </span>
                            ))}
                          </span>
                        ) : null}
                        {die.enhancements.length ? (
                          <span
                            aria-label={`${die.enhancements.length} forged face${die.enhancements.length === 1 ? '' : 's'} installed`}
                            className="die-forged-badge"
                          >
                            {die.enhancements.length}
                          </span>
                        ) : null}
                        <span className="die-affinity">{affinity.label}</span>
                      </button>
                    );
                  })}
                </div>
                {human && <MomentumMeter player={human} />}
              </div>
              {human && human.hand.length > 0 && (
                <section
                  className="hand-dock"
                  aria-label="Your card hand"
                  data-tutorial="hand"
                >
                  <div className="hand-dock-heading">
                    <div>
                      <span className="eyebrow">Your hand</span>
                      <strong>
                        {human.hand.length}{' '}
                        {human.hand.length === 1 ? 'card' : 'cards'}
                      </strong>
                    </div>
                    <button
                      aria-label="View full hand and card market"
                      className="hand-dock-expand"
                      onClick={() => showPanel('cards')}
                      type="button"
                    >
                      Manage
                    </button>
                  </div>
                  <div className="hand-dock-cards">
                    {human.hand.map((cardId, index) => {
                      const card = game.cards.find(
                        (item) => item.id === cardId,
                      );
                      if (!card) return null;
                      const action: GameAction = {
                        type: 'play-card',
                        playerId: human.id,
                        cardId,
                        ...(card.target === 'ready-die' && selectedDieId
                          ? { targetDieId: selectedDieId }
                          : {}),
                      };
                      const legal = validateAction(game, action).legal;
                      return (
                        <article
                          className={`hand-dock-card hand-dock-${card.category}`}
                          data-card-id={card.id}
                          key={`${cardId}-${index}`}
                          style={cardArtStyle(card.category)}
                        >
                          <div className="hand-dock-art" aria-hidden="true" />
                          <div>
                            <span>
                              <CategoryToken category={card.category} />
                              <ResourceList values={card.cost} />
                            </span>
                            <strong>{card.name}</strong>
                            <p>{card.rulesText}</p>
                          </div>
                          <button
                            aria-label={`Play ${card.name}`}
                            disabled={
                              !legal || activePlayer?.controller !== 'human'
                            }
                            onClick={() => submitHumanAction(action)}
                            type="button"
                          >
                            {card.target === 'ready-die'
                              ? selectedDieId
                                ? 'Cast on die'
                                : 'Choose a die'
                              : 'Play'}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
              {human && activePlayer?.controller === 'human' && (
                <>
                  <MoveAdvisor
                    previews={movePreviews}
                    selectedDie={selectedDie}
                    onCommit={submitHumanAction}
                  />
                  <RivalThreats
                    previews={rivalPreviews}
                    onInspect={pinLocation}
                  />
                </>
              )}
              <section
                className={`turn-summary ${selectedDie ? 'is-armed' : 'is-ready'}`}
                aria-label="Current turn plan"
              >
                <span className="turn-summary-kicker">
                  {selectedDie ? 'Die armed' : 'Current action'}
                </span>
                <div>
                  <strong>
                    {selectedDie
                      ? `Value ${dieValue(selectedDie)} ${AFFINITY_INFO[selectedDie.affinity].label}`
                      : activePlayer?.controller === 'human'
                        ? 'Choose a die or card'
                        : 'CPU is planning'}
                  </strong>
                  <span>
                    {selectedDie
                      ? `${selectedDieRoutes.length} legal route${selectedDieRoutes.length === 1 ? '' : 's'} available`
                      : 'Select a die to light up playable spaces.'}
                  </span>
                </div>
                <div
                  className="panel-shortcuts"
                  aria-label="Open info panels"
                  data-tutorial="drawers"
                >
                  {PANEL_SHORTCUTS.map((shortcut) => {
                    // A dot means there is an action waiting behind that tab,
                    // so the player does not have to open all five to find out
                    // where their turn can actually be spent.
                    const waiting =
                      activePlayer?.controller === 'human' &&
                      shortcut.hasAction(legalActions);
                    return (
                      <button
                        className={[
                          'panel-shortcut',
                          activePanel === shortcut.id ? 'is-open' : '',
                          waiting ? 'has-action' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        disabled={shortcut.id === 'forge' && !forgeUnlocked}
                        key={shortcut.id}
                        onClick={() => showPanel(shortcut.id)}
                        type="button"
                      >
                        {shortcut.label}
                        {waiting && (
                          <i aria-label="action available" className="dot" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="pass"
                  data-tutorial="pass"
                  disabled={
                    activePlayer?.controller !== 'human' ||
                    !legalActions.some((action) => action.type === 'pass')
                  }
                  onClick={() =>
                    human &&
                    submitHumanAction({ type: 'pass', playerId: human.id })
                  }
                  type="button"
                >
                  Pass for this round
                </button>
              </section>
              {error && (
                <p className="notice" role="status">
                  {error}
                </p>
              )}
              {selectedDieId && human && (
                <details className="accessible-actions">
                  <summary>Keyboard placement options</summary>
                  <div>
                    {game.locations.map((location) => {
                      const action = legalActions.find(
                        (candidate) =>
                          (candidate.type === 'place-die' ||
                            candidate.type === 'bump-die') &&
                          candidate.dieId === selectedDieId &&
                          candidate.locationId === location.id,
                      );
                      const placementAction =
                        action &&
                        (action.type === 'place-die' ||
                          action.type === 'bump-die')
                          ? action
                          : null;
                      const slotNumber = placementAction
                        ? location.slots.findIndex(
                            (slot) => slot.id === placementAction.slotId,
                          ) + 1
                        : null;
                      return (
                        <button
                          aria-label={
                            placementAction
                              ? `${
                                  placementAction.type === 'bump-die'
                                    ? 'Bump at'
                                    : 'Place at'
                                } ${location.name}, slot ${slotNumber}`
                              : `${location.name}: no legal placement`
                          }
                          disabled={!placementAction}
                          key={location.id}
                          onClick={() =>
                            placeAtLocation(location.id, selectedDieId)
                          }
                          type="button"
                        >
                          {placementAction
                            ? `${
                                placementAction.type === 'bump-die'
                                  ? 'Bump'
                                  : 'Place'
                              } · ${location.name}`
                            : `${location.name} · unavailable`}
                        </button>
                      );
                    })}
                  </div>
                </details>
              )}
            </section>
            {pressure && (
              <CollapsiblePanel
                ariaLabel="Round pressure"
                className="pressure-panel"
                contentId="round-pressure-panel"
                open={activePanel === 'pressure'}
                summary={
                  <>
                    {pressure.remainingSlots}/{pressure.totalOpenSlots} slots
                    left
                  </>
                }
                title="Round pressure"
                onToggle={() => showPanel('pressure')}
              >
                <div className="pressure-grid">
                  <span>
                    <strong>{pressure.openLocations}</strong>
                    open regions
                  </span>
                  <span>
                    <strong>{pressure.sealedLocations}</strong>
                    sealed regions
                  </span>
                  <span>
                    <strong>{pressure.readyDiceWithRoutes}</strong>
                    playable dice
                  </span>
                  <span>
                    <strong>{pressure.lowRollRoutes}</strong>
                    low-roll routes
                  </span>
                </div>
                <p>
                  {pressure.lowDice > 0
                    ? `${pressure.lowDiceWithRoutes}/${pressure.lowDice} low dice still have a legal route.`
                    : 'No low dice rolled right now.'}
                </p>
              </CollapsiblePanel>
            )}
            {game.objectives.length > 0 && (
              <CollapsiblePanel
                ariaLabel="Crown quests"
                className="quest-panel"
                contentId="crown-quests-panel"
                dataTutorial="quests"
                open={activePanel === 'quests'}
                summary={
                  <>
                    {
                      game.objectives.filter((item) => item.claimedBy === null)
                        .length
                    }{' '}
                    unclaimed
                  </>
                }
                style={panelArtStyle(shatteredCrownQuestArt)}
                title="Crown Quests"
                onToggle={() => showPanel('quests')}
              >
                <ul className="quest-list">
                  {game.objectives.map((objective) => {
                    const claimant = game.players.find(
                      (player) => player.id === objective.claimedBy,
                    );
                    const mine = objective.claimedBy === human?.id;
                    return (
                      <li
                        className={
                          claimant
                            ? mine
                              ? 'quest claimed-by-you'
                              : 'quest claimed-by-rival'
                            : 'quest'
                        }
                        key={objective.id}
                      >
                        <div className="quest-title">
                          <strong>{objective.name}</strong>
                          <ResourceToken
                            compact
                            resource="victoryPoints"
                            value={objective.victoryPoints}
                          />
                        </div>
                        <p>{objective.description}</p>
                        <em>
                          {claimant
                            ? `${mine ? '✓ Claimed by you' : `Claimed by ${claimant.name}`}`
                            : 'Unclaimed — first to finish takes it'}
                        </em>
                      </li>
                    );
                  })}
                </ul>
              </CollapsiblePanel>
            )}
            <CollapsiblePanel
              className="card-panel"
              aria-label="Card hand and market"
              contentId="cards-market-panel"
              dataTutorial="cards"
              open={activePanel === 'cards'}
              summary={`${human?.hand.length ?? 0} hand · ${game.cardDeck.length} deck`}
              style={panelArtStyle(cardMarketArt)}
              title="Cards and market"
              onToggle={() => showPanel('cards')}
            >
              <div className="panel-heading">
                <h3>Your hand</h3>
                <span>{human?.hand.length ?? 0} cards</span>
              </div>
              <div className="card-list">
                {human?.hand.map((cardId, index) => {
                  const card = game.cards.find((item) => item.id === cardId);
                  if (!card) return null;
                  const action: GameAction = {
                    type: 'play-card',
                    playerId: human.id,
                    cardId,
                    ...(card.target === 'ready-die' && selectedDieId
                      ? { targetDieId: selectedDieId }
                      : {}),
                  };
                  const legal = validateAction(game, action).legal;
                  return (
                    <article
                      className="game-card hand-card"
                      data-card-id={card.id}
                      key={`${cardId}-${index}`}
                      style={cardArtStyle(card.category)}
                    >
                      <strong>{card.name}</strong>
                      <CategoryToken category={card.category} />
                      <p>{card.rulesText}</p>
                      <small className="card-cost">
                        <span>Cost</span>
                        <ResourceList values={card.cost} />
                      </small>
                      <button
                        disabled={
                          !legal || activePlayer?.controller !== 'human'
                        }
                        onClick={() => submitHumanAction(action)}
                        type="button"
                      >
                        {card.target === 'ready-die'
                          ? 'Play on selected die'
                          : 'Play card'}
                      </button>
                    </article>
                  );
                })}
                {!human?.hand.length && (
                  <p className="empty-state">No cards in hand.</p>
                )}
              </div>

              <div className="panel-heading market-heading">
                <h3>Market</h3>
                <span>{game.cardDeck.length} in deck</span>
              </div>
              <div className="card-list">
                {game.cardMarket.map((cardId, index) => {
                  const card = game.cards.find((item) => item.id === cardId);
                  if (!card || !human) return null;
                  const action: GameAction = {
                    type: 'acquire-card',
                    playerId: human.id,
                    cardId,
                  };
                  const legal = validateAction(game, action).legal;
                  return (
                    <article
                      className="game-card market-card"
                      data-card-id={card.id}
                      key={`${cardId}-${index}`}
                      style={cardArtStyle(card.category)}
                    >
                      <strong>{card.name}</strong>
                      <CategoryToken category={card.category} />
                      <p>{card.rulesText}</p>
                      <small className="card-cost">
                        <span>Cost</span>
                        <ResourceList values={card.cost} />
                      </small>
                      <button
                        disabled={
                          !legal || activePlayer?.controller !== 'human'
                        }
                        onClick={() => submitHumanAction(action)}
                        type="button"
                      >
                        Acquire
                      </button>
                    </article>
                  );
                })}
              </div>
            </CollapsiblePanel>

            {forgeUnlocked && human && (
              <CollapsiblePanel
                ariaLabel="Forge upgrades"
                className="forge-panel"
                contentId="forge-upgrades-panel"
                open={activePanel === 'forge'}
                summary="Permanent upgrades"
                style={panelArtStyle(forgeUpgradeArt)}
                title="Forge Hall"
                onToggle={() => showPanel('forge')}
              >
                <div className="forge-controls">
                  <label>
                    Die
                    <select
                      value={upgradeDieId ?? ''}
                      onChange={(event) =>
                        setUpgradeDieId(event.target.value as DieId)
                      }
                    >
                      {human.dice.map((die, index) => (
                        <option key={die.id} value={die.id}>
                          Die {index + 1} · {die.affinity}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Face to replace
                    <select
                      value={upgradeFaceIndex}
                      onChange={(event) =>
                        setUpgradeFaceIndex(Number(event.target.value))
                      }
                    >
                      {(
                        human.dice.find((die) => die.id === upgradeDieId)
                          ?.faces ??
                        human.dice[0]?.faces ??
                        []
                      ).map((face, index) => (
                        <option key={index} value={index}>
                          Face {index + 1}: value {face.value}
                          {face.symbols.length
                            ? ` · ${face.symbols.join(', ')}`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="upgrade-list">
                  {game.upgrades.map((upgrade) => {
                    const currentFace =
                      human.dice.find((die) => die.id === upgradeDieId)?.faces[
                        upgradeFaceIndex
                      ] ?? human.dice[0]?.faces[0];
                    const action: GameAction | null = upgradeDieId
                      ? {
                          type: 'upgrade-die',
                          playerId: human.id,
                          dieId: upgradeDieId,
                          faceIndex: upgradeFaceIndex,
                          upgradeId: upgrade.id,
                        }
                      : null;
                    const legal = action
                      ? validateAction(game, action).legal
                      : false;
                    return (
                      <article className="upgrade" key={upgrade.id}>
                        <ForgeFacePreview
                          currentFace={currentFace}
                          replacement={upgrade.replacement}
                        />
                        <div>
                          <strong>{upgrade.name}</strong>
                          <p>{upgrade.description}</p>
                          <small>
                            <span className="upgrade-meta">
                              <span>Cost</span>
                              <ResourceList values={upgrade.cost} />
                              <span>Scores</span>
                              <ResourceToken
                                compact
                                resource="victoryPoints"
                                value={upgrade.scoreValue}
                              />
                            </span>
                          </small>
                        </div>
                        <button
                          disabled={
                            !legal || activePlayer?.controller !== 'human'
                          }
                          onClick={() => action && submitHumanAction(action)}
                          type="button"
                        >
                          Forge
                        </button>
                      </article>
                    );
                  })}
                </div>
              </CollapsiblePanel>
            )}
            <CollapsiblePanel
              className="log-panel"
              contentId="match-log-panel"
              dataTutorial="log"
              open={activePanel === 'log'}
              summary={`${log.length} entries`}
              title="Match log"
              titleLevel={2}
              onToggle={() => showPanel('log')}
            >
              <ol>
                {log.map((entry, index) => (
                  <li key={`${entry}-${index}`}>{entry}</li>
                ))}
              </ol>
            </CollapsiblePanel>
          </aside>
        </div>
      )}
      {tutorialOpen && game.phase !== 'complete' && (
        <TutorialOverlay
          onClose={() => setTutorialOpen(false)}
          onFinish={() => {
            localStorage.setItem(TUTORIAL_KEY, 'true');
            setTutorialCompleted(true);
            setTutorialOpen(false);
          }}
          reducedMotion={reducedMotion}
        />
      )}
    </main>
  );
}
