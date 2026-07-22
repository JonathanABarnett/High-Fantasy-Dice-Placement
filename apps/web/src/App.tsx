import { useEffect, useMemo, useState } from 'react';

import { chooseCpuAction } from '@shattered-crown/game-ai';
import {
  cards,
  factions,
  locations,
  upgrades,
} from '@shattered-crown/game-content';
import {
  applyAction,
  createGame,
  deserializeGame,
  enumerateLegalActions,
  serializeGame,
  validateAction,
} from '@shattered-crown/game-engine';
import type {
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
import arcanumPortrait from '../../../assets/generated/factions/arcanum-conclave-v1.png';
import emberPortrait from '../../../assets/generated/factions/ember-dominion-v1.png';
import stoneboundPortrait from '../../../assets/generated/factions/stonebound-league-v1.png';
import verdantPortrait from '../../../assets/generated/factions/verdant-covenant-v1.png';

const SAVE_KEY = 'shattered-crown.debug-match.v3';
const TUTORIAL_KEY = 'shattered-crown.tutorial-complete.v1';
const FACTION_PORTRAITS: Readonly<Record<string, string>> = {
  'arcanum-conclave': arcanumPortrait,
  'ember-dominion': emberPortrait,
  'verdant-covenant': verdantPortrait,
  'stonebound-league': stoneboundPortrait,
};

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
  const player =
    state.players.find((item) => item.id === event.playerId)?.name ?? 'Player';
  if (event.type === 'player-passed') return `${player} passed.`;
  if (event.type === 'die-placed') {
    const location =
      state.locations.find((item) => item.id === event.locationId)?.name ??
      event.locationId;
    return `${player} placed a die at ${location}.`;
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

export function App() {
  const [selectedFaction, setSelectedFaction] = useState<FactionId>(
    factions[0].id,
  );
  const [seed, setSeed] = useState('shattered-crown-001');
  const [game, setGame] = useState<GameState | null>(null);
  const [selectedDieId, setSelectedDieId] = useState<DieId | null>(null);
  const [upgradeDieId, setUpgradeDieId] = useState<DieId | null>(null);
  const [upgradeFaceIndex, setUpgradeFaceIndex] = useState(0);
  const [log, setLog] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inspectedLocationId, setInspectedLocationId] =
    useState<LocationId | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialCompleted, setTutorialCompleted] = useState(
    () => localStorage.getItem(TUTORIAL_KEY) === 'true',
  );
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
  const inspectedLocation = game?.locations.find(
    (location) => location.id === inspectedLocationId,
  );
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

  const appendEvents = (events: readonly GameEvent[], nextState: GameState) => {
    setLog((current) =>
      [
        ...events.map((event) => describeEvent(event, nextState)),
        ...current,
      ].slice(0, 80),
    );
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
      content: { factions, locations, cards, upgrades },
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
    const candidates = location.slots.map((slot): GameAction => ({
      type: 'place-die',
      playerId: human.id,
      dieId,
      locationId,
      slotId: slot.id,
    }));
    const legal = candidates.find(
      (candidate) => validateAction(game, candidate).legal,
    );
    if (legal) {
      submitHumanAction(legal);
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
      const result = applyAction(game, chooseCpuAction(game));
      setGame(result.state);
      appendEvents(result.events, result.state);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [activePlayer?.controller, game]);

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
          <p className="eyebrow">Milestone 1 · Headless match prototype</p>
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
          <p className="eyebrow">Deterministic debug board</p>
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
            {human && (
              <BoardRenderer
                game={game}
                humanPlayerId={human.id}
                legalActions={legalActions}
                onInspectLocation={setInspectedLocationId}
                onPlaceAtLocation={placeAtLocation}
                reducedMotion={reducedMotion}
                selectedDieId={selectedDieId}
              />
            )}
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
              <span>Board rendered with PixiJS</span>
            </div>
          </section>

          <aside className="sidebar">
            <section className="dice-panel">
              <h2>Your dice</h2>
              <p>Select a ready die, then choose a highlighted slot.</p>
              <div className="dice" data-tutorial="dice">
                {human?.dice.map((die) => {
                  const affinity = AFFINITY_INFO[die.affinity];
                  const value =
                    die.rolledFaceIndex === null
                      ? '—'
                      : die.faces[die.rolledFaceIndex]?.value;
                  return (
                    <button
                      className={
                        selectedDieId === die.id
                          ? `die die-${die.affinity} selected`
                          : `die die-${die.affinity}`
                      }
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
                        setSelectedDieId(die.id);
                      }}
                      key={die.id}
                      onClick={() => setSelectedDieId(die.id)}
                      type="button"
                    >
                      <span aria-hidden="true" className="die-glyph">
                        {affinity.icon}
                      </span>
                      <strong>{value}</strong>
                      <span className="die-affinity">{affinity.label}</span>
                    </button>
                  );
                })}
              </div>
              {pressure && (
                <section className="pressure-panel" aria-label="Round pressure">
                  <div className="panel-heading">
                    <h3>Round pressure</h3>
                    <span>
                      {pressure.remainingSlots}/{pressure.totalOpenSlots} slots
                      left
                    </span>
                  </div>
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
                </section>
              )}
              <section
                className="card-panel"
                aria-label="Card hand and market"
                data-tutorial="cards"
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
              </section>

              {human &&
                game.locations.some(
                  (location) =>
                    location.tags.includes('forge') &&
                    location.slots.some(
                      (slot) => slot.occupantPlayerId === human.id,
                    ),
                ) && (
                  <section className="forge-panel" aria-label="Forge upgrades">
                    <div className="panel-heading">
                      <h3>Forge Hall</h3>
                      <span>Permanent upgrades</span>
                    </div>
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
                              onClick={() =>
                                action && submitHumanAction(action)
                              }
                              type="button"
                            >
                              Forge
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
              <section
                className="location-preview"
                aria-live="polite"
                data-tutorial="preview"
              >
                <p className="eyebrow">Location preview</p>
                {inspectedLocation ? (
                  <>
                    <h3>{inspectedLocation.name}</h3>
                    <p>{inspectedLocation.description}</p>
                    {inspectedLocation.isActive === false ? (
                      <p className="sealed-notice">
                        ⛓ Sealed this round. It will rotate back into the realm
                        later in the match.
                      </p>
                    ) : (
                      <p className="open-notice">
                        {
                          inspectedLocation.slots.filter(
                            (slot) => slot.isOpen !== false,
                          ).length
                        }{' '}
                        contested slot
                        {inspectedLocation.slots.filter(
                          (slot) => slot.isOpen !== false,
                        ).length === 1
                          ? ''
                          : 's'}{' '}
                        open this round.
                      </p>
                    )}
                    <div className="preview-reward">
                      <span>Reward</span>
                      <ResourceList
                        includeVictoryPoints
                        values={inspectedLocation.reward}
                      />
                    </div>
                    <ul className="preview-slots">
                      {inspectedLocation.slots.map((slot, index) => {
                        const action: GameAction | null =
                          selectedDieId && human
                            ? {
                                type: 'place-die',
                                playerId: human.id,
                                dieId: selectedDieId,
                                locationId: inspectedLocation.id,
                                slotId: slot.id,
                              }
                            : null;
                        const validation = action
                          ? validateAction(game, action)
                          : null;
                        return (
                          <li
                            className={
                              validation
                                ? validation.legal
                                  ? 'slot-preview legal'
                                  : 'slot-preview blocked'
                                : 'slot-preview'
                            }
                            key={slot.id}
                          >
                            <strong>
                              {validation
                                ? validation.legal
                                  ? '✓ PLAYABLE'
                                  : '× BLOCKED'
                                : `SLOT ${index + 1}`}
                            </strong>
                            <span>
                              <RequirementTokens
                                requirement={slot.requirement}
                              />
                            </span>
                            {validation && (
                              <em>
                                {validation.legal
                                  ? 'Legal placement'
                                  : validation.message}
                              </em>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <p>
                    Hover or click a location to inspect its reward and
                    restrictions.
                  </p>
                )}
              </section>
              {selectedDieId && human && (
                <details className="accessible-actions">
                  <summary>Keyboard placement options</summary>
                  <div>
                    {game.locations.map((location) => {
                      const action = legalActions.find(
                        (candidate) =>
                          candidate.type === 'place-die' &&
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
              {error && (
                <p className="notice" role="status">
                  {error}
                </p>
              )}
            </section>
            <section className="log-panel" data-tutorial="log">
              <h2>Match log</h2>
              <ol>
                {log.map((entry, index) => (
                  <li key={`${entry}-${index}`}>{entry}</li>
                ))}
              </ol>
            </section>
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
