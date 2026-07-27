import { useEffect, useRef, useState } from 'react';

import { dieValue } from '@shattered-crown/game-engine';
import type {
  DieId,
  GameAction,
  GameState,
  LocationId,
  PlacementRequirement,
  PlayerId,
} from '@shattered-crown/shared-types';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  type Texture,
} from 'pixi.js';

import boardMapUrl from '../../../../assets/generated/board/shattered-realms-map-v1.png';

const BOARD_WIDTH = 1200;
const BOARD_HEIGHT = 760;
const CARD_WIDTH = 250;
const CARD_HEIGHT = 184;
const SLOT_SIZE = 42;
const SLOT_Y = 132;
const SLOT_GAP = 52;
const SLOT_CENTER_Y = SLOT_Y + SLOT_SIZE / 2;

interface BoardPoint {
  readonly x: number;
  readonly y: number;
}

const LOCATION_POINTS: readonly BoardPoint[] = [
  { x: 56, y: 70 },
  { x: 340, y: 42 },
  { x: 628, y: 68 },
  { x: 914, y: 42 },
  { x: 70, y: 302 },
  { x: 350, y: 280 },
  { x: 628, y: 302 },
  { x: 904, y: 280 },
  { x: 52, y: 540 },
  { x: 340, y: 522 },
  { x: 628, y: 542 },
  { x: 914, y: 520 },
];

function tutorialHotspotStyle(point: BoardPoint) {
  return {
    left: `${(point.x / BOARD_WIDTH) * 100}%`,
    top: `${(point.y / BOARD_HEIGHT) * 100}%`,
    width: `${(CARD_WIDTH / BOARD_WIDTH) * 100}%`,
    height: `${(CARD_HEIGHT / BOARD_HEIGHT) * 100}%`,
  };
}

const REGION_COLORS: Readonly<Record<string, number>> = {
  arcane: 0x4f3a74,
  knowledge: 0x35516d,
  influence: 0x675335,
  craft: 0x624335,
  trade: 0x345f63,
  nature: 0x315b3c,
  martial: 0x713b32,
};

const AFFINITY_GLYPHS: Readonly<Record<string, string>> = {
  arcane: '✦',
  martial: '⚔',
  nature: '❧',
  influence: '♜',
  neutral: '◇',
};

const RESOURCE_GLYPHS: Readonly<Record<string, string>> = {
  gold: '●',
  mana: '◆',
  knowledge: '▤',
  materials: '⚒',
  influence: '♜',
  victoryPoints: '★',
};

export interface BoardRendererProps {
  readonly game: GameState;
  readonly humanPlayerId: PlayerId;
  readonly selectedDieId: DieId | null;
  readonly legalActions: readonly GameAction[];
  readonly reducedMotion: boolean;
  readonly pinnedLocationId?: LocationId | null;
  readonly onHoverLocation: (locationId: LocationId | null) => void;
  readonly onPinLocation: (locationId: LocationId | null) => void;
  readonly onPlaceAtLocation: (
    locationId: LocationId,
    dieId: DieId | null,
  ) => void;
}

function locationColor(tags: readonly string[]): number {
  for (const tag of tags) {
    if (REGION_COLORS[tag]) return REGION_COLORS[tag];
  }
  return 0x514735;
}

function requirementLabel(requirement: PlacementRequirement): string {
  const parts: string[] = [];
  if (requirement.minimumValue) parts.push(`${requirement.minimumValue}+`);
  if (requirement.affinities?.length)
    parts.push(
      requirement.affinities
        .map((affinity) => AFFINITY_GLYPHS[affinity] ?? affinity[0])
        .join('/'),
    );
  for (const [resource, amount] of Object.entries(requirement.cost ?? {}))
    parts.push(`${RESOURCE_GLYPHS[resource] ?? resource[0]}${amount}`);
  return parts.length ? parts.join(' ') : 'ANY';
}

function rewardLabel(
  reward: BoardRendererProps['game']['locations'][number]['reward'],
): string {
  return Object.entries(reward)
    .filter(([, amount]) => amount)
    .map(
      ([resource, amount]) =>
        `${RESOURCE_GLYPHS[resource] ?? resource[0]} ${amount}`,
    )
    .join('   ');
}

function drawBackdrop(stage: Container, texture: Texture): void {
  const map = Sprite.from(texture);
  map.width = BOARD_WIDTH;
  map.height = BOARD_HEIGHT;
  stage.addChild(map);
  stage.addChild(
    new Graphics()
      .roundRect(8, 8, BOARD_WIDTH - 16, BOARD_HEIGHT - 16, 28)
      .fill({ color: 0x08110e, alpha: 0.12 })
      .stroke({ color: 0x9c7540, width: 5, alpha: 0.75 }),
  );
}

export function BoardRenderer(props: BoardRendererProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const mapTextureRef = useRef<Texture | null>(null);
  const pulseRef = useRef<(() => void) | null>(null);
  const hoverRef = useRef(props.onHoverLocation);
  const pinRef = useRef(props.onPinLocation);
  const placeRef = useRef(props.onPlaceAtLocation);
  const [ready, setReady] = useState(false);
  hoverRef.current = props.onHoverLocation;
  pinRef.current = props.onPinLocation;
  placeRef.current = props.onPlaceAtLocation;

  useEffect(() => {
    let cancelled = false;
    const app = new Application();
    void Promise.all([
      app.init({
        width: BOARD_WIDTH,
        height: BOARD_HEIGHT,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        backgroundAlpha: 0,
      }),
      Assets.load<Texture>(boardMapUrl),
    ]).then(([, texture]) => {
      if (cancelled) {
        app.ticker.stop();
        app.canvas.remove();
        return;
      }
      mapTextureRef.current = texture;
      app.canvas.setAttribute('role', 'img');
      app.canvas.setAttribute(
        'aria-label',
        'Fantasy board map with twelve interactive locations',
      );
      app.canvas.style.width = '100%';
      app.canvas.style.height = 'auto';
      hostRef.current?.appendChild(app.canvas);
      appRef.current = app;
      setReady(true);
    });
    return () => {
      cancelled = true;
      if (appRef.current) {
        appRef.current.ticker.stop();
        appRef.current.canvas.remove();
      }
      appRef.current = null;
      mapTextureRef.current = null;
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    const mapTexture = mapTextureRef.current;
    if (!app || !mapTexture || !ready) return;
    if (pulseRef.current) app.ticker.remove(pulseRef.current);
    for (const child of app.stage.removeChildren())
      child.destroy({ children: true });
    drawBackdrop(app.stage, mapTexture);

    const legalLocationIds = new Set(
      props.legalActions
        .filter(
          (
            action,
          ): action is Extract<
            GameAction,
            { type: 'place-die' | 'bump-die' }
          > =>
            (action.type === 'place-die' || action.type === 'bump-die') &&
            action.dieId === props.selectedDieId,
        )
        .map((action) => action.locationId),
    );
    const legalSlotIds = new Set(
      props.legalActions
        .filter(
          (action): action is Extract<GameAction, { type: 'place-die' }> =>
            action.type === 'place-die' && action.dieId === props.selectedDieId,
        )
        .map((action) => action.slotId),
    );
    const bumpableSlotIds = new Set(
      props.legalActions
        .filter(
          (action): action is Extract<GameAction, { type: 'bump-die' }> =>
            action.type === 'bump-die' && action.dieId === props.selectedDieId,
        )
        .map((action) => action.slotId),
    );
    const pulseTargets: Graphics[] = [];

    props.game.locations.forEach((location, index) => {
      const point = LOCATION_POINTS[index];
      if (!point) return;
      const isActive = location.isActive !== false;
      const openSlots = location.slots.filter((slot) => slot.isOpen !== false);
      const legal =
        props.selectedDieId !== null && legalLocationIds.has(location.id);
      const pinned = props.pinnedLocationId === location.id;
      const occupied = location.slots.filter(
        (slot) => slot.occupantDieId,
      ).length;
      const full =
        isActive && openSlots.length > 0 && occupied >= openSlots.length;
      const card = new Container();
      card.position.set(point.x, point.y);
      card.eventMode = 'static';
      card.cursor =
        !isActive || full
          ? 'not-allowed'
          : props.selectedDieId
            ? legal
              ? 'pointer'
              : 'not-allowed'
            : 'help';
      card.hitArea = {
        contains: (x: number, y: number) =>
          x >= 0 && y >= 0 && x <= CARD_WIDTH && y <= CARD_HEIGHT,
      };
      card.on('pointertap', () => {
        if (props.selectedDieId) {
          placeRef.current(location.id, props.selectedDieId);
          return;
        }
        pinRef.current(location.id);
      });
      card.on('pointerover', () => hoverRef.current(location.id));

      const highlight = new Graphics()
        .roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 18)
        .fill({
          color: locationColor(location.tags),
          alpha: !isActive
            ? 0.02
            : legal
              ? 0.3
              : props.selectedDieId
                ? 0.1
                : 0.08,
        })
        .stroke({
          color: !isActive ? 0x5d5d5d : legal ? 0x78efac : 0xc9a66a,
          width: legal ? 5 : pinned ? 4 : isActive ? 1 : 2,
          alpha: legal ? 1 : pinned ? 0.95 : isActive ? 0.22 : 0.7,
        });
      if (legal) pulseTargets.push(highlight);
      card.addChild(highlight);
      if (pinned) {
        card.addChild(
          new Graphics()
            .roundRect(-5, -5, CARD_WIDTH + 10, CARD_HEIGHT + 10, 22)
            .stroke({ color: 0xf1c66f, width: 4, alpha: 0.96 }),
        );
      }
      if (!isActive || (props.selectedDieId && !legal)) {
        card.addChild(
          new Graphics()
            .roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 18)
            .fill({ color: 0x080706, alpha: 0.5 }),
        );
      }

      if (location.encounter && isActive) {
        const encounter = location.encounter;
        const health = encounter.health;
        const damage = props.game.raidDamage[location.id] ?? 0;
        const dead = health !== undefined && damage >= health;
        const label = dead
          ? '☠ BEAST SLAIN'
          : health !== undefined
            ? `⚔ RAID · ${health - damage}/${health}`
            : '⚔ MONSTER HUNT';
        const hunt = new Graphics()
          .roundRect(10, 10, 132, 22, 11)
          .fill({ color: dead ? 0x2f2a26 : 0x571a16, alpha: 0.96 })
          .stroke({
            color: dead ? 0x8d8578 : 0xe8874a,
            width: 2,
            alpha: 1,
          });
        const huntText = new Text({
          text: label,
          style: {
            fill: dead ? 0xcfc7ba : 0xffd7b0,
            fontFamily: 'Arial',
            fontSize: 10,
            fontWeight: 'bold',
          },
        });
        huntText.position.set(18, 15);
        card.addChild(hunt, huntText);

        // A health bar makes the multi-round raid readable at a glance.
        if (health !== undefined && !dead) {
          const remaining = Math.max(0, 1 - damage / health);
          card.addChild(
            new Graphics()
              .roundRect(10, 34, 132, 7, 4)
              .fill({ color: 0x1d1512, alpha: 0.95 })
              .stroke({ color: 0x7a4a30, width: 1, alpha: 0.9 }),
          );
          if (remaining > 0) {
            card.addChild(
              new Graphics()
                .roundRect(11, 35, Math.max(2, 130 * remaining), 5, 3)
                .fill({ color: 0xd6483c, alpha: 0.95 }),
            );
          }
        }
      }

      if (props.selectedDieId || !isActive || full) {
        const badgeState = !isActive
          ? {
              text: '⛓ SEALED',
              fill: 0x2b2b2b,
              stroke: 0x818181,
              textFill: 0xd0d0d0,
            }
          : full
            ? {
                text: '● FULL',
                fill: 0x423426,
                stroke: 0xd9ad67,
                textFill: 0xffe0ae,
              }
            : legal
              ? {
                  text: '✓ PLAYABLE',
                  fill: 0x174b32,
                  stroke: 0x8bffc0,
                  textFill: 0xcaffdf,
                }
              : {
                  text: '× BLOCKED',
                  fill: 0x431f1c,
                  stroke: 0xd07868,
                  textFill: 0xf0b1a6,
                };
        const badge = new Graphics()
          .roundRect(151, 8, 91, 24, 12)
          .fill({ color: badgeState.fill, alpha: 0.96 })
          .stroke({
            color: badgeState.stroke,
            width: 2,
            alpha: 1,
          });
        const badgeText = new Text({
          text: badgeState.text,
          style: {
            fill: badgeState.textFill,
            fontFamily: 'Arial',
            fontSize: 11,
            fontWeight: 'bold',
          },
        });
        badgeText.anchor.set(0.5);
        badgeText.position.set(196, 20);
        card.addChild(badge, badgeText);
      }

      const plaque = new Graphics()
        .roundRect(0, 82, CARD_WIDTH, 96, 13)
        .fill({ color: 0x130f0d, alpha: 0.86 })
        .stroke({
          color: legal ? 0x78efac : 0xd0a65d,
          width: legal ? 3 : 2,
          alpha: 0.9,
        });
      card.addChild(plaque);

      const name = new Text({
        text: location.name,
        style: {
          fill: 0xffedc7,
          fontFamily: 'Georgia',
          fontSize: 16,
          fontWeight: 'bold',
          stroke: { color: 0x160f09, width: 3 },
          wordWrap: true,
          wordWrapWidth: 225,
        },
      });
      name.position.set(12, 91);
      card.addChild(name);

      const rewards = new Text({
        text: rewardLabel(location.reward),
        style: {
          fill: 0xe4bd72,
          fontFamily: 'Arial',
          fontSize: 10,
          fontWeight: 'bold',
        },
      });
      rewards.position.set(12, 114);
      card.addChild(rewards);

      location.slots.forEach((slot, slotIndex) => {
        const x = 15 + slotIndex * SLOT_GAP;
        const slotOpen = slot.isOpen !== false;
        const slotLegal = slotOpen && legalSlotIds.has(slot.id);
        const slotBumpable = bumpableSlotIds.has(slot.id);
        const die = new Graphics().roundRect(
          x,
          SLOT_Y,
          SLOT_SIZE,
          SLOT_SIZE,
          7,
        );
        if (!slotOpen) {
          die
            .fill({ color: 0x0c0b0a, alpha: 0.9 })
            .stroke({ color: 0x77736b, width: 2, alpha: 0.92 });
          const sealed = new Text({
            text: 'SEALED',
            style: {
              fill: 0xa9a39a,
              fontFamily: 'Arial',
              fontSize: 6.5,
              fontWeight: 'bold',
            },
          });
          sealed.anchor.set(0.5);
          sealed.position.set(x + SLOT_SIZE / 2, SLOT_CENTER_Y);
          card.addChild(die, sealed);
        } else if (slot.occupantDieId) {
          const human = slot.occupantPlayerId === props.humanPlayerId;
          die.fill({ color: human ? 0x397f5a : 0x9a4b3f }).stroke({
            color: slotBumpable ? 0xffd24a : human ? 0xa9ffd0 : 0xffb29f,
            width: slotBumpable ? 4 : 2,
          });
          const owner = new Text({
            text: slotBumpable ? '⚡' : human ? 'YOU' : 'CPU',
            style: {
              fill: slotBumpable ? 0xffe89a : 0xffffff,
              fontFamily: 'Arial',
              fontSize: slotBumpable ? 16 : 11,
              fontWeight: 'bold',
            },
          });
          owner.anchor.set(0.5);
          owner.position.set(x + SLOT_SIZE / 2, SLOT_CENTER_Y);
          card.addChild(die, owner);
          if (slotBumpable) pulseTargets.push(die);
        } else {
          die
            .fill({
              color: props.selectedDieId
                ? slotLegal
                  ? 0x123f2b
                  : 0x331a17
                : 0x171511,
              alpha: props.selectedDieId ? 0.94 : 0.78,
            })
            .stroke({
              color: props.selectedDieId
                ? slotLegal
                  ? 0x78efac
                  : 0xa85e50
                : 0x8a7352,
              width: slotLegal ? 4 : 2,
              alpha: 1,
            });
          const requirement = new Text({
            text: `${props.selectedDieId ? (slotLegal ? '✓ ' : '× ') : ''}${requirementLabel(slot.requirement)}`,
            style: {
              fill: props.selectedDieId
                ? slotLegal
                  ? 0xbaffd3
                  : 0xd99588
                : 0xd6bd8f,
              fontFamily: 'Arial',
              fontSize: 9,
              fontWeight: 'bold',
            },
          });
          requirement.anchor.set(0.5);
          requirement.position.set(x + SLOT_SIZE / 2, SLOT_CENTER_Y);
          card.addChild(die, requirement);
        }
      });

      const occupancy = new Text({
        text: `${occupied}/${openSlots.length} slots`,
        style: { fill: 0xd6bd8f, fontFamily: 'Arial', fontSize: 10 },
      });
      occupancy.position.set(190, 150);
      card.addChild(occupancy);
      app.stage.addChild(card);
    });

    const pulse = () => {
      if (props.reducedMotion) return;
      const alpha = 0.72 + Math.sin(performance.now() / 260) * 0.25;
      for (const target of pulseTargets) target.alpha = alpha;
    };
    pulseRef.current = pulse;
    app.ticker.add(pulse);
    return () => {
      app.ticker.remove(pulse);
    };
  }, [
    props.game,
    props.humanPlayerId,
    props.legalActions,
    props.pinnedLocationId,
    props.reducedMotion,
    props.selectedDieId,
    ready,
  ]);

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const dieId = event.dataTransfer.getData(
      'application/x-shattered-die',
    ) as DieId;
    const canvas = appRef.current?.canvas;
    if (!dieId || !canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * BOARD_WIDTH;
    const y = ((event.clientY - bounds.top) / bounds.height) * BOARD_HEIGHT;
    const index = LOCATION_POINTS.findIndex(
      (point) =>
        x >= point.x &&
        x <= point.x + CARD_WIDTH &&
        y >= point.y &&
        y <= point.y + CARD_HEIGHT,
    );
    const location = props.game.locations[index];
    if (location) placeRef.current(location.id, dieId);
  };

  const selectedDie = props.game.players
    .find((player) => player.id === props.humanPlayerId)
    ?.dice.find((die) => die.id === props.selectedDieId);
  const legalLocationsForSelected = new Set(
    props.legalActions
      .filter(
        (action) =>
          (action.type === 'place-die' || action.type === 'bump-die') &&
          action.dieId === props.selectedDieId,
      )
      .map((action) =>
        action.type === 'place-die' || action.type === 'bump-die'
          ? action.locationId
          : null,
      ),
  );
  const legalLocationCount = legalLocationsForSelected.size;
  const activeLocationCount = props.game.locations.filter(
    (location) => location.isActive !== false,
  ).length;
  const openSlotCount = props.game.locations.reduce(
    (total, location) =>
      total + location.slots.filter((slot) => slot.isOpen !== false).length,
    0,
  );
  const forgeIndex = props.game.locations.findIndex((location) =>
    location.tags.includes('forge'),
  );
  const forgePoint = LOCATION_POINTS[forgeIndex];
  const huntIndex = props.game.locations.findIndex(
    (location) => location.encounter && location.encounter.health === undefined,
  );
  const huntPoint = LOCATION_POINTS[huntIndex];
  const raidIndex = props.game.locations.findIndex(
    (location) => location.encounter?.health !== undefined,
  );
  const raidPoint = LOCATION_POINTS[raidIndex];

  return (
    <div
      className="pixi-board"
      data-ready={ready ? 'true' : 'false'}
      data-testid="pixi-board"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      ref={hostRef}
    >
      {forgePoint && (
        <div
          aria-hidden="true"
          className="tutorial-hotspot"
          data-tutorial="forge-location"
          style={tutorialHotspotStyle(forgePoint)}
        />
      )}
      {huntPoint && (
        <div
          aria-hidden="true"
          className="tutorial-hotspot"
          data-tutorial="hunt-location"
          style={tutorialHotspotStyle(huntPoint)}
        />
      )}
      {raidPoint && (
        <div
          aria-hidden="true"
          className="tutorial-hotspot"
          data-tutorial="raid-location"
          style={tutorialHotspotStyle(raidPoint)}
        />
      )}
      {props.game.locations.map((location, index) => {
        const point = LOCATION_POINTS[index];
        if (!point) return null;
        const canPlace =
          props.selectedDieId !== null &&
          legalLocationsForSelected.has(location.id);
        return (
          <button
            aria-label={
              props.selectedDieId
                ? `${canPlace ? 'Place at' : 'Inspect'} ${location.name}`
                : `Inspect ${location.name}`
            }
            className="location-inspect-hotspot"
            data-testid={`location-hotspot-${location.id}`}
            key={location.id}
            onClick={() => {
              if (props.selectedDieId && canPlace) {
                placeRef.current(location.id, props.selectedDieId);
                return;
              }
              pinRef.current(location.id);
            }}
            onBlur={() => hoverRef.current(null)}
            onFocus={() => hoverRef.current(location.id)}
            onMouseEnter={() => hoverRef.current(location.id)}
            onMouseLeave={() => hoverRef.current(null)}
            style={tutorialHotspotStyle(point)}
            title={
              props.selectedDieId
                ? `${canPlace ? 'Place at' : 'Inspect'} ${location.name}`
                : `Inspect ${location.name}`
            }
            type="button"
          />
        );
      })}
      <div className="placement-guide" aria-live="polite">
        {selectedDie ? (
          <>
            <strong>
              {AFFINITY_GLYPHS[selectedDie.affinity]} Value{' '}
              {selectedDie.rolledFaceIndex === null
                ? '—'
                : dieValue(selectedDie)}
              {(selectedDie.valueBonus ?? 0) > 0
                ? ` (+${selectedDie.valueBonus})`
                : ''}{' '}
              {selectedDie.affinity} die selected
            </strong>
            <span>{legalLocationCount} glowing locations can accept it</span>
            <span className="placement-legend">
              <i className="legend-legal">✓ Playable</i>
              <i className="legend-blocked">× Blocked</i>
            </span>
          </>
        ) : (
          <>
            <strong>
              {activeLocationCount} active regions · {openSlotCount} contested
              slots
            </strong>
            <span>Hover or click a location to inspect it</span>
          </>
        )}
      </div>
      {!ready && (
        <p className="board-loading">Charting the shattered realms…</p>
      )}
    </div>
  );
}
