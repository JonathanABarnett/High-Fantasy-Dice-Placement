import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
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
  serializeGame,
  validateAction,
} from '@shattered-crown/game-engine';
import type {
  CardCategory,
  DieId,
  FactionId,
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
import { AFFINITY_INFO } from './components/rules-info';
import { useInterfaceStore } from './stores/interface-store';
import { TutorialOverlay } from './tutorial/TutorialOverlay';
import allyCardArt from '../../../assets/generated/cards/category-ally-v1.webp';
import relicCardArt from '../../../assets/generated/cards/category-relic-v1.webp';
import tacticCardArt from '../../../assets/generated/cards/category-tactic-v1.webp';
import arcanumPortrait from '../../../assets/generated/factions/arcanum-conclave-v1.png';
import emberPortrait from '../../../assets/generated/factions/ember-dominion-v1.png';
import stoneboundPortrait from '../../../assets/generated/factions/stonebound-league-v1.png';
import verdantPortrait from '../../../assets/generated/factions/verdant-covenant-v1.png';

const SAVE_KEY = 'shattered-crown.debug-match.v4';
const TUTORIAL_KEY = 'shattered-crown.tutorial-complete.v1';
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

function cardArtStyle(category: CardCategory): CSSProperties {
  return {
    '--card-art': `url(${CARD_CATEGORY_ART[category]})`,
  } as CSSProperties;
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
            ⚄
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

type CollapsiblePanelId = 'pressure' | 'quests' | 'cards' | 'forge' | 'log';

type ActivePanelId = CollapsiblePanelId;

function CollapsiblePanel({
  ariaLabel,
  ariaLive,
  children,
  className,
  contentId,
  dataTutorial,
  open,
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
      <div className="encounter-strip hunt">
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
  const lethal = incoming >= remaining;
  const survived = game.raidRoundsSurvived?.[location.id] ?? 0;
  const bounty = raidBountyFor(location, survived);
  return (
    <div className={`encounter-strip raid ${lethal ? 'lethal' : ''}`}>
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
      <p>
        {incoming > 0
          ? lethal
            ? `Your die deals ${incoming} — the KILLING BLOW, claiming ${bounty}★ and the hoard.`
            : `Your die deals ${incoming}, leaving ${remaining - incoming}. Only the finisher takes the ${bounty}★ bounty.`
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
  const [activePanel, setActivePanel] = useState<ActivePanelId>('cards');
  const reducedMotion = useInterfaceStore((state) => state.reducedMotion);
  const toggleReducedMotion = useInterfaceStore(
    (state) => state.toggleReducedMotion,
  );

  const human = game?.players.find((player) => player.controller === 'human');
  const activePlayer = game?.players.find(
    (player) => player.id === game.turn.activePlayerId,
  );
  const legalActions = useMemo(
    () => (game ? enumerateLegalActions(game) : []),
    [game],
  );
  const inspectedLocationId = pinnedLocationId ?? hoveredLocationId;
  const inspectedLocation = game?.locations.find(
    (location) => location.id === inspectedLocationId,
  );
  const selectedDie =
    human?.dice.find((die) => die.id === selectedDieId) ?? null;
  const selectedDieRoutes = useMemo(() => {
    if (!game || !selectedDieId) return [];
    return legalActions.filter(
      (action) =>
        (action.type === 'place-die' || action.type === 'bump-die') &&
        action.dieId === selectedDieId,
    );
  }, [game, legalActions, selectedDieId]);
  const hoverLocation = (locationId: LocationId | null) => {
    setHoveredLocationId(locationId);
  };
  const pinLocation = (locationId: LocationId | null) => {
    setPinnedLocationId(locationId);
  };
  const selectDieForPlanning = (dieId: DieId) => {
    setSelectedDieId(dieId);
  };
  const showPanel = (panel: ActivePanelId) => setActivePanel(panel);
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

  const appendEvents = (events: readonly GameEvent[], nextState: GameState) => {
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
  };

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
    setSelectedDieId(null);
    setUpgradeDieId(created.state.players[0]?.dice[0]?.id ?? null);
    setError(null);
    setTutorialOpen(guided);
    setLog(
      created.events
        .map((event) => describeEvent(event, created.state))
        .reverse(),
    );
  };

  const submitHumanAction = (action: GameAction) => {
    if (!game) return;
    const validation = validateAction(game, action);
    if (!validation.legal) {
      setError(validation.message);
      return;
    }
    const result = applyAction(game, action);
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
      setError('The CPU is considering its move.');
      return;
    }
    const dieId = requestedDieId ?? selectedDieId;
    if (!dieId) {
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
  };

  useEffect(() => {
    if (!game || game.phase !== 'action' || activePlayer?.controller !== 'cpu')
      return;
    const matchId = game.id;
    const turnNumber = game.turn.turnNumber;
    const timer = window.setTimeout(() => {
      if (game.id !== matchId || game.turn.turnNumber !== turnNumber) return;
      const result = applyAction(game, chooseCpuAction(game, difficulty));
      setGame(result.state);
      appendEvents(result.events, result.state);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [activePlayer?.controller, difficulty, game]);

  const saveMatch = () => {
    if (!game) return;
    localStorage.setItem(SAVE_KEY, serializeGame(game));
    setError('Match saved locally.');
  };

  const resumeMatch = () => {
    const saved = localStorage.getItem(SAVE_KEY);
    if (!saved) {
      setError('No saved debug match was found.');
      return;
    }
    try {
      const restored = deserializeGame(saved);
      setGame(restored);
      setSelectedDieId(null);
      setUpgradeDieId(
        restored.players.find((player) => player.controller === 'human')
          ?.dice[0]?.id ?? null,
      );
      setLog(['Saved match restored.']);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The save could not be restored.',
      );
    }
  };

  if (!game) {
    return (
      <main className="setup-shell">
        <section className="setup-card">
          <p className="eyebrow">A high-fantasy dice-placement duel</p>
          <h1>Realms of the Shattered Crown</h1>
          <p className="lede">
            Choose a faction, then play a deterministic six-round match against
            the CPU.
          </p>
          <img
            alt=""
            className="setup-portrait"
            src={FACTION_PORTRAITS[selectedFaction]}
          />
          <label>
            Faction
            <select
              value={selectedFaction}
              onChange={(event) =>
                setSelectedFaction(event.target.value as FactionId)
              }
            >
              {factions.map((faction) => (
                <option key={faction.id} value={faction.id}>
                  {faction.name}
                </option>
              ))}
            </select>
          </label>
          <p className="ability">
            {
              factions.find((faction) => faction.id === selectedFaction)
                ?.passiveAbility
            }
          </p>
          <p className="ability scoring">
            <strong>Scores:</strong>{' '}
            {
              factions.find((faction) => faction.id === selectedFaction)
                ?.scoringRule
            }
          </p>
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
          <p className="ability scoring">
            {
              CPU_DIFFICULTIES.find((tier) => tier.id === difficulty)
                ?.description
            }
          </p>
          <label>
            Match seed
            <input
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
            />
          </label>
          <div className="button-row">
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
        </section>
      </main>
    );
  }

  return (
    <main className="game-shell">
      <header className="game-header" data-tutorial="header">
        <div>
          <p className="eyebrow">Six rounds to claim the crown</p>
          <h1>Shattered Crown</h1>
        </div>
        <div className="round-block">
          <strong>
            Round {game.round.number} / {game.round.maximum}
          </strong>
          <span>
            {game.phase === 'complete'
              ? 'Final scoring'
              : `${activePlayer?.name ?? '—'} to act`}
          </span>
        </div>
        <div className="button-row compact">
          <button type="button" onClick={() => setTutorialOpen(true)}>
            How to play
          </button>
          <button type="button" onClick={toggleReducedMotion}>
            Motion {reducedMotion ? 'off' : 'on'}
          </button>
          <button type="button" onClick={saveMatch}>
            Save
          </button>
          <button type="button" onClick={() => setGame(null)}>
            Restart
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
          >
            <img
              alt=""
              className="faction-portrait"
              src={FACTION_PORTRAITS[player.factionId]}
            />
            <div>
              <strong>{player.name}</strong>
              <span>
                {
                  factions.find((faction) => faction.id === player.factionId)
                    ?.name
                }
              </span>
            </div>
            <div className="resources">
              {(Object.keys(player.resources) as ResourceType[]).map(
                (resource) => (
                  <ResourceToken
                    key={resource}
                    resource={resource}
                    value={player.resources[resource]}
                  />
                ),
              )}
              <ResourceToken
                resource="victoryPoints"
                value={player.victoryPoints}
              />
            </div>
          </article>
        ))}
      </section>

      {game.phase === 'complete' ? (
        <section className="score-panel">
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
            className="board-stage"
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

          <aside className="sidebar" data-tutorial="war-table">
            <section className="dice-panel">
              <h2>Your dice</h2>
              <p>Select a ready die, then choose a highlighted slot.</p>
              <div className="dice" data-tutorial="dice">
                {human?.dice.map((die) => {
                  const affinity = AFFINITY_INFO[die.affinity];
                  const boost = die.valueBonus ?? 0;
                  const value =
                    die.rolledFaceIndex === null ? '—' : dieValue(die);
                  const classes = [
                    'die',
                    `die-${die.affinity}`,
                    selectedDieId === die.id ? 'selected' : '',
                    boost > 0 ? 'boosted' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <button
                      className={classes}
                      data-tooltip={`${affinity.label}: ${affinity.description}`}
                      disabled={
                        die.status !== 'ready' ||
                        activePlayer?.controller !== 'human'
                      }
                      draggable={
                        die.status === 'ready' &&
                        activePlayer?.controller === 'human'
                      }
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          'application/x-shattered-die',
                          die.id,
                        );
                        selectDieForPlanning(die.id);
                      }}
                      key={die.id}
                      onClick={() => selectDieForPlanning(die.id)}
                      type="button"
                    >
                      <span aria-hidden="true" className="die-glyph">
                        {affinity.icon}
                      </span>
                      <strong>{value}</strong>
                      {boost > 0 && <span className="die-boost">+{boost}</span>}
                      <span className="die-affinity">{affinity.label}</span>
                    </button>
                  );
                })}
              </div>
              {human && <MomentumMeter player={human} />}
              <section className="turn-summary" aria-label="Current turn plan">
                <div>
                  <strong>
                    {selectedDie
                      ? `${AFFINITY_INFO[selectedDie.affinity].icon} Value ${dieValue(selectedDie)} ${AFFINITY_INFO[selectedDie.affinity].label}`
                      : activePlayer?.controller === 'human'
                        ? 'Choose a die or card'
                        : 'CPU is planning'}
                  </strong>
                  <span>
                    {selectedDie
                      ? `${selectedDieRoutes.length} legal route${selectedDieRoutes.length === 1 ? '' : 's'} available`
                      : inspectedLocation
                        ? `Inspecting ${inspectedLocation.name}`
                        : 'Select a die to light up playable spaces.'}
                  </span>
                </div>
                {inspectedLocation && (
                  <div>
                    <strong>{inspectedLocation.name}</strong>
                    <span>
                      Reward:{' '}
                      <ResourceList
                        includeVictoryPoints
                        values={inspectedLocation.reward}
                      />
                    </span>
                  </div>
                )}
                <div className="panel-shortcuts" aria-label="Open info panels">
                  <button
                    className={
                      activePanel === 'cards'
                        ? 'panel-shortcut is-open'
                        : 'panel-shortcut'
                    }
                    onClick={() => showPanel('cards')}
                    type="button"
                  >
                    Cards
                  </button>
                  <button
                    className={
                      activePanel === 'quests'
                        ? 'panel-shortcut is-open'
                        : 'panel-shortcut'
                    }
                    onClick={() => showPanel('quests')}
                    type="button"
                  >
                    Quests
                  </button>
                  <button
                    className={
                      activePanel === 'forge'
                        ? 'panel-shortcut is-open'
                        : 'panel-shortcut'
                    }
                    disabled={!forgeUnlocked}
                    onClick={() => showPanel('forge')}
                    type="button"
                  >
                    Forge
                  </button>
                  <button
                    className={
                      activePanel === 'log'
                        ? 'panel-shortcut is-open'
                        : 'panel-shortcut'
                    }
                    onClick={() => showPanel('log')}
                    type="button"
                  >
                    Log
                  </button>
                  <button
                    className={
                      activePanel === 'pressure'
                        ? 'panel-shortcut is-open'
                        : 'panel-shortcut'
                    }
                    onClick={() => showPanel('pressure')}
                    type="button"
                  >
                    Pressure
                  </button>
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
                        game.objectives.filter(
                          (item) => item.claimedBy === null,
                        ).length
                      }{' '}
                      unclaimed
                    </>
                  }
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
                      return (
                        <button
                          disabled={!action}
                          key={location.id}
                          onClick={() =>
                            placeAtLocation(location.id, selectedDieId)
                          }
                          type="button"
                        >
                          {location.name}
                        </button>
                      );
                    })}
                  </div>
                </details>
              )}
            </section>
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
