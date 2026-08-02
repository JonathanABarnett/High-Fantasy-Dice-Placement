import { useEffect, useRef, useState } from 'react';

import { dieValue, raidDamageFor } from '@shattered-crown/game-engine';
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

import boardMapUrl from '../../../../assets/generated/rebuild-v2/shattered-realm-board-v2.webp';

const BOARD_WIDTH = 1200;
const BOARD_HEIGHT = 800;
const CARD_WIDTH = 250;
const CARD_HEIGHT = 220;
const SLOT_SIZE = 38;
const SLOT_Y = 164;
const SLOT_GAP = 48;
const SLOT_CENTER_Y = SLOT_Y + SLOT_SIZE / 2;

type AtlasView = 'overview' | 'north' | 'heart' | 'south';

interface BoardPoint {
  readonly x: number;
  readonly y: number;
}

interface CameraState extends BoardPoint {
  readonly scale: number;
}

const MIN_CAMERA_SCALE = 0.78;
const MAX_CAMERA_SCALE = 2.4;
const LOCATION_MARKER_BASE_SCALE = 0.82;

const ATLAS_VIEWS: readonly {
  readonly id: AtlasView;
  readonly label: string;
  readonly center: BoardPoint;
  readonly scale: number;
}[] = [
  { id: 'overview', label: 'Realm', center: { x: 600, y: 400 }, scale: 1 },
  { id: 'north', label: 'Highlands', center: { x: 600, y: 185 }, scale: 1.3 },
  { id: 'heart', label: 'Heartlands', center: { x: 600, y: 400 }, scale: 1.34 },
  { id: 'south', label: 'Frontier', center: { x: 600, y: 650 }, scale: 1.3 },
];

const LOCATION_POINTS: readonly BoardPoint[] = [
  { x: 34, y: 22 },
  { x: 326, y: 22 },
  { x: 618, y: 22 },
  { x: 910, y: 22 },
  { x: 34, y: 288 },
  { x: 326, y: 288 },
  { x: 618, y: 288 },
  { x: 910, y: 288 },
  { x: 34, y: 554 },
  { x: 326, y: 554 },
  { x: 618, y: 554 },
  { x: 910, y: 554 },
];

function tutorialHotspotStyle(point: BoardPoint) {
  return {
    left: `${(point.x / BOARD_WIDTH) * 100}%`,
    top: `${(point.y / BOARD_HEIGHT) * 100}%`,
    width: `${(CARD_WIDTH / BOARD_WIDTH) * 100}%`,
    height: `${(CARD_HEIGHT / BOARD_HEIGHT) * 100}%`,
  };
}

function cameraHotspotStyle(point: BoardPoint, cameraScale: number) {
  return {
    ...tutorialHotspotStyle(point),
    transform: `scale(${locationMarkerScale(cameraScale)})`,
    transformOrigin: 'center',
  };
}

function tutorialLandmarkStyle(point: BoardPoint) {
  const width = CARD_WIDTH * 0.56;
  const height = CARD_HEIGHT * 0.5;
  return {
    left: `${((point.x + (CARD_WIDTH - width) / 2) / BOARD_WIDTH) * 100}%`,
    top: `${((point.y + 12) / BOARD_HEIGHT) * 100}%`,
    width: `${(width / BOARD_WIDTH) * 100}%`,
    height: `${(height / BOARD_HEIGHT) * 100}%`,
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
  influence: '⚑',
  neutral: '◆',
};

const RESOURCE_GLYPHS: Readonly<Record<string, string>> = {
  gold: '◉',
  mana: '♦',
  knowledge: '▣',
  materials: '⚒',
  influence: '✦',
  victoryPoints: '★',
};

export interface BoardRendererProps {
  readonly game: GameState;
  readonly humanPlayerId: PlayerId;
  readonly selectedDieId: DieId | null;
  readonly recommendedAction?: Extract<
    GameAction,
    { type: 'place-die' | 'bump-die' }
  > | null;
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

function pipPositions(value: number): readonly [number, number][] {
  const low = 0.28;
  const mid = 0.5;
  const high = 0.72;
  switch (Math.max(1, Math.min(6, value))) {
    case 1:
      return [[mid, mid]];
    case 2:
      return [
        [low, low],
        [high, high],
      ];
    case 3:
      return [
        [low, low],
        [mid, mid],
        [high, high],
      ];
    case 4:
      return [
        [low, low],
        [high, low],
        [low, high],
        [high, high],
      ];
    case 5:
      return [
        [low, low],
        [high, low],
        [mid, mid],
        [low, high],
        [high, high],
      ];
    default:
      return [
        [low, low],
        [high, low],
        [low, mid],
        [high, mid],
        [low, high],
        [high, high],
      ];
  }
}

function drawDiePips(
  target: Graphics,
  x: number,
  y: number,
  value: number,
  color: number,
) {
  for (const [ratioX, ratioY] of pipPositions(value)) {
    target
      .circle(x + SLOT_SIZE * ratioX, y + SLOT_SIZE * ratioY, 3.2)
      .fill({ color, alpha: 0.94 });
  }
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

function atlasTransform(viewId: AtlasView) {
  const view =
    ATLAS_VIEWS.find((item) => item.id === viewId) ?? ATLAS_VIEWS[0]!;
  return {
    scale: view.scale,
    x: BOARD_WIDTH / 2 - view.center.x * view.scale,
    y: BOARD_HEIGHT / 2 - view.center.y * view.scale,
  };
}

function constrainCamera(camera: CameraState): CameraState {
  const scale = Math.min(
    MAX_CAMERA_SCALE,
    Math.max(MIN_CAMERA_SCALE, camera.scale),
  );
  const scaledWidth = BOARD_WIDTH * scale;
  const scaledHeight = BOARD_HEIGHT * scale;
  return {
    scale,
    x:
      scaledWidth <= BOARD_WIDTH
        ? (BOARD_WIDTH - scaledWidth) / 2
        : Math.min(0, Math.max(BOARD_WIDTH - scaledWidth, camera.x)),
    y:
      scaledHeight <= BOARD_HEIGHT
        ? (BOARD_HEIGHT - scaledHeight) / 2
        : Math.min(0, Math.max(BOARD_HEIGHT - scaledHeight, camera.y)),
  };
}

function locationMarkerScale(cameraScale: number): number {
  // Board labels are interface, not terrain. Let them grow slightly as the
  // camera moves closer without allowing them to overwhelm the world art.
  return LOCATION_MARKER_BASE_SCALE / Math.sqrt(cameraScale);
}

export function BoardRenderer(props: BoardRendererProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const locationCardsRef = useRef<Container[]>([]);
  const mapTextureRef = useRef<Texture | null>(null);
  const pulseRef = useRef<(() => void) | null>(null);
  const hoverRef = useRef(props.onHoverLocation);
  const pinRef = useRef(props.onPinLocation);
  const placeRef = useRef(props.onPlaceAtLocation);
  const [ready, setReady] = useState(false);
  const [atlasView, setAtlasView] = useState<AtlasView | null>('overview');
  const initialCamera = atlasTransform('overview');
  const cameraRef = useRef<CameraState>(initialCamera);
  const [cameraState, setCameraState] = useState<CameraState>(initialCamera);
  const panRef = useRef({
    active: false,
    didMove: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    cameraX: 0,
    cameraY: 0,
  });
  const suppressClickRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  hoverRef.current = props.onHoverLocation;
  pinRef.current = props.onPinLocation;
  placeRef.current = props.onPlaceAtLocation;

  const applyCamera = (nextCamera: CameraState) => {
    const next = constrainCamera(nextCamera);
    cameraRef.current = next;
    setCameraState(next);
    const world = worldRef.current;
    if (world) {
      world.scale.set(next.scale);
      world.position.set(next.x, next.y);
    }
    const markerScale = locationMarkerScale(next.scale);
    for (const card of locationCardsRef.current) {
      card.scale.set(markerScale);
    }
  };

  const selectAtlasView = (viewId: AtlasView) => {
    setAtlasView(viewId);
    applyCamera(atlasTransform(viewId));
  };

  const focusLocation = (index: number) => {
    const point = LOCATION_POINTS[index];
    if (!point) return;
    const scale = 1.38;
    setAtlasView(null);
    applyCamera({
      scale,
      x: BOARD_WIDTH / 2 - (point.x + CARD_WIDTH / 2) * scale,
      y: BOARD_HEIGHT / 2 - (point.y + CARD_HEIGHT / 2) * scale,
    });
  };

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
    const world = new Container();
    const camera = cameraRef.current;
    world.scale.set(camera.scale);
    world.position.set(camera.x, camera.y);
    worldRef.current = world;
    locationCardsRef.current = [];
    app.stage.addChild(world);
    drawBackdrop(world, mapTexture);
    // A faint ley-line network gives the painted map a strategic skeleton.
    // It stays below every location and never participates in hit testing.
    const leyLines = new Graphics();
    const leyConnections: readonly (readonly [number, number])[] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [4, 5],
      [5, 6],
      [6, 7],
      [8, 9],
      [9, 10],
      [10, 11],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
      [4, 8],
      [5, 9],
      [6, 10],
      [7, 11],
      [1, 4],
      [2, 5],
      [5, 8],
      [6, 9],
    ];
    for (const [fromIndex, toIndex] of leyConnections) {
      const from = LOCATION_POINTS[fromIndex];
      const to = LOCATION_POINTS[toIndex];
      if (!from || !to) continue;
      leyLines
        .moveTo(from.x + CARD_WIDTH / 2, from.y + CARD_HEIGHT / 2)
        .lineTo(to.x + CARD_WIDTH / 2, to.y + CARD_HEIGHT / 2);
    }
    leyLines.stroke({ color: 0xd8b56b, width: 2, alpha: 0.16 });
    world.addChild(leyLines);
    // Small moving lights keep the realm feeling inhabited without changing
    // hit areas or making the board itself jump under the cursor.
    const motePoints: readonly (readonly [number, number, number])[] = [
      [178, 160, 0x75c6ff],
      [420, 118, 0xa86dff],
      [704, 218, 0xf1c66f],
      [1010, 172, 0xffd36d],
      [286, 410, 0xff9a5c],
      [620, 390, 0xf6d679],
      [908, 442, 0x72d6c5],
      [390, 646, 0x86d496],
      [776, 616, 0x7cb7ff],
    ];
    const motes = props.reducedMotion
      ? []
      : motePoints.map(([x, y, color], index) => {
          const mote = new Graphics()
            .circle(0, 0, 7 + (index % 3))
            .fill({ color, alpha: 0.12 })
            .circle(0, 0, 2.2)
            .fill({ color, alpha: 0.72 });
          mote.position.set(x, y);
          world.addChild(mote);
          return { mote, x, y, phase: index * 0.72 };
        });

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
    const diceById = new Map(
      props.game.players.flatMap((player) =>
        player.dice.map((die) => [die.id, die] as const),
      ),
    );
    const playerById = new Map(
      props.game.players.map((player) => [player.id, player] as const),
    );
    const pulseTargets: Graphics[] = [];

    if (
      props.selectedDieId &&
      props.recommendedAction?.locationId &&
      legalLocationIds.has(props.recommendedAction.locationId)
    ) {
      const index = props.game.locations.findIndex(
        (location) => location.id === props.recommendedAction?.locationId,
      );
      const point = LOCATION_POINTS[index];
      if (point) {
        const routeGlow = new Graphics()
          .moveTo(BOARD_WIDTH / 2, BOARD_HEIGHT / 2)
          .lineTo(point.x + CARD_WIDTH / 2, point.y + CARD_HEIGHT / 2)
          .stroke({ color: 0xffd36d, width: 4, alpha: 0.22 });
        world.addChild(routeGlow);
        pulseTargets.push(routeGlow);
      }
    }

    props.game.locations.forEach((location, index) => {
      const point = LOCATION_POINTS[index];
      if (!point) return;
      const isActive = location.isActive !== false;
      const openSlots = location.slots.filter((slot) => slot.isOpen !== false);
      const legal =
        props.selectedDieId !== null && legalLocationIds.has(location.id);
      const recommended = props.recommendedAction?.locationId === location.id;
      const pinned = props.pinnedLocationId === location.id;
      const occupied = location.slots.filter(
        (slot) => slot.occupantDieId,
      ).length;
      const full =
        isActive && openSlots.length > 0 && occupied >= openSlots.length;
      const card = new Container();
      card.pivot.set(CARD_WIDTH / 2, CARD_HEIGHT / 2);
      card.position.set(point.x + CARD_WIDTH / 2, point.y + CARD_HEIGHT / 2);
      card.scale.set(locationMarkerScale(camera.scale));
      card.eventMode = 'static';
      card.cursor =
        !isActive || full
          ? 'not-allowed'
          : props.selectedDieId
            ? legal
              ? 'pointer'
              : 'not-allowed'
            : 'pointer';
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
      card.on('pointerover', () => {
        hoverRef.current(location.id);
        if (!props.reducedMotion && isActive) {
          aura.alpha = Math.min(0.5, aura.alpha + 0.13);
        }
      });
      card.on('pointerout', () => {
        hoverRef.current(null);
        aura.alpha = !isActive
          ? 0.03
          : legal
            ? recommended
              ? 0.3
              : 0.07
            : pinned
              ? 0.16
              : 0.1;
      });

      const aura = new Graphics()
        .ellipse(CARD_WIDTH / 2, CARD_HEIGHT / 2, CARD_WIDTH * 0.52, 96)
        .fill({
          color: locationColor(location.tags),
          alpha: !isActive
            ? 0.03
            : legal
              ? recommended
                ? 0.3
                : 0.07
              : pinned
                ? 0.16
                : 0.1,
        })
        .stroke({
          color: legal
            ? recommended
              ? 0x8bffc0
              : 0x4e9b75
            : pinned
              ? 0xf1c66f
              : 0xd0a65d,
          width: legal ? (recommended ? 3 : 1) : pinned ? 2 : 1,
          alpha: isActive ? 0.42 : 0.2,
        });
      card.addChild(aura);

      const highlight = new Graphics()
        .ellipse(CARD_WIDTH / 2, CARD_HEIGHT / 2, 92, 76)
        .fill({
          color: locationColor(location.tags),
          alpha: !isActive ? 0.004 : legal ? 0.025 : 0.008,
        })
        .stroke({
          color: !isActive
            ? 0x5d5d5d
            : legal
              ? recommended
                ? 0x78efac
                : 0x4e9b75
              : 0xc9a66a,
          width: legal ? (recommended ? 4 : 1) : pinned ? 3 : 1,
          alpha: recommended
            ? 1
            : legal
              ? 0.52
              : pinned
                ? 0.95
                : isActive
                  ? 0.12
                  : 0.35,
        });
      if (legal && recommended) pulseTargets.push(highlight);
      card.addChild(highlight);
      if (recommended) {
        card.addChild(
          new Graphics()
            .ellipse(CARD_WIDTH / 2, CARD_HEIGHT / 2, 101, 84)
            .stroke({ color: 0xffd36d, width: 5, alpha: 0.98 }),
        );
        const bestBadge = new Graphics()
          .roundRect(12, 44, 92, 25, 12)
          .fill({ color: 0x6a3f10, alpha: 0.98 })
          .stroke({ color: 0xffd36d, width: 2, alpha: 1 });
        const bestText = new Text({
          text: '★ BEST ROUTE',
          style: {
            fill: 0xffedc7,
            fontFamily: 'Arial',
            fontSize: 10,
            fontWeight: 'bold',
          },
        });
        bestText.anchor.set(0.5);
        bestText.position.set(58, 56.5);
        card.addChild(bestBadge, bestText);
      }
      if (pinned) {
        card.addChild(
          new Graphics()
            .ellipse(CARD_WIDTH / 2, CARD_HEIGHT / 2, 98, 80)
            .stroke({ color: 0xf1c66f, width: 4, alpha: 0.96 }),
        );
      }
      if (!isActive || (props.selectedDieId && !legal)) {
        card.addChild(
          new Graphics()
            .ellipse(CARD_WIDTH / 2, CARD_HEIGHT / 2, 94, 78)
            .fill({ color: 0x080706, alpha: 0.3 }),
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
            ? `⚔ ${health - damage}/${health} · ${damage} DMG`
            : '⚔ MONSTER HUNT';
        const hunt = new Graphics()
          .roundRect(10, 10, health !== undefined ? 148 : 132, 22, 11)
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
            fontSize: health !== undefined ? 9.5 : 10,
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
              .roundRect(10, 34, 148, 7, 4)
              .fill({ color: 0x1d1512, alpha: 0.95 })
              .stroke({ color: 0x7a4a30, width: 1, alpha: 0.9 }),
          );
          if (remaining > 0) {
            card.addChild(
              new Graphics()
                .roundRect(11, 35, Math.max(2, 146 * remaining), 5, 3)
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
          .roundRect(149, 8, 78, 24, 12)
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
        badgeText.position.set(188, 20);
        card.addChild(badge, badgeText);
      }

      const plaque = new Graphics()
        .roundRect(41, 116, 168, 38, 10)
        .fill({ color: 0x130f0d, alpha: 0.88 })
        .stroke({
          color: legal ? 0x78efac : 0xd0a65d,
          width: legal ? 3 : 2,
          alpha: legal ? 0.95 : 0.76,
        });
      card.addChild(plaque);

      const name = new Text({
        text: location.name,
        style: {
          fill: 0xffedc7,
          fontFamily: 'Georgia',
          fontSize: 13,
          fontWeight: 'bold',
          stroke: { color: 0x160f09, width: 3 },
          wordWrap: true,
          wordWrapWidth: 146,
        },
      });
      name.position.set(50, 120);
      card.addChild(name);

      const rewards = new Text({
        text: rewardLabel(location.reward),
        style: {
          fill: 0xe4bd72,
          fontFamily: 'Arial',
          fontSize: 8,
          fontWeight: 'bold',
        },
      });
      rewards.position.set(50, 138);
      card.addChild(rewards);

      location.slots.forEach((slot, slotIndex) => {
        const slotRowWidth = (location.slots.length - 1) * SLOT_GAP + SLOT_SIZE;
        const x = (CARD_WIDTH - slotRowWidth) / 2 + slotIndex * SLOT_GAP;
        const slotOpen = slot.isOpen !== false;
        const slotLegal = slotOpen && legalSlotIds.has(slot.id);
        const slotBumpable = bumpableSlotIds.has(slot.id);
        const slotRecommended =
          recommended && props.recommendedAction?.slotId === slot.id;
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
          const occupantPlayer = slot.occupantPlayerId
            ? playerById.get(slot.occupantPlayerId)
            : undefined;
          const occupantDie = diceById.get(slot.occupantDieId);
          const occupantValue = occupantDie
            ? String(dieValue(occupantDie))
            : '?';
          const occupantRaidDamage =
            location.encounter?.health !== undefined &&
            occupantPlayer &&
            occupantDie
              ? raidDamageFor(occupantPlayer, occupantDie)
              : null;
          const landingRing = new Graphics()
            .roundRect(x - 5, SLOT_Y - 5, SLOT_SIZE + 10, SLOT_SIZE + 10, 11)
            .stroke({
              color: slotBumpable ? 0xffd24a : human ? 0xa9ffd0 : 0xffb29f,
              width: slotBumpable ? 3 : 2,
              alpha: 0.58,
            });
          card.addChild(landingRing);
          if (slotBumpable || occupantRaidDamage !== null) {
            pulseTargets.push(landingRing);
          }
          die
            .fill({ color: human ? 0x397f5a : 0x9a4b3f })
            .stroke({
              color: slotBumpable ? 0xffd24a : human ? 0xa9ffd0 : 0xffb29f,
              width: slotBumpable ? 4 : 2,
            })
            .roundRect(x + 3, SLOT_Y + 3, SLOT_SIZE - 6, SLOT_SIZE - 6, 6)
            .stroke({
              color: human ? 0xd8ffe4 : 0xffd7cd,
              width: 1,
              alpha: 0.22,
            });
          if (occupantDie && dieValue(occupantDie) <= 6) {
            drawDiePips(
              die,
              x,
              SLOT_Y,
              dieValue(occupantDie),
              human ? 0xf2fff5 : 0xffede8,
            );
          }
          const valueBadge = new Graphics()
            .roundRect(x + SLOT_SIZE - 15, SLOT_Y - 5, 19, 15, 6)
            .fill({ color: 0x120e0b, alpha: 0.92 })
            .stroke({
              color: slotBumpable ? 0xffd24a : human ? 0xa9ffd0 : 0xffb29f,
              width: 1.5,
              alpha: 0.95,
            });
          const valueBadgeText = new Text({
            text: occupantValue,
            style: {
              fill: 0xfff0c8,
              fontFamily: 'Arial',
              fontSize: 9,
              fontWeight: 'bold',
            },
          });
          valueBadgeText.anchor.set(0.5);
          valueBadgeText.position.set(x + SLOT_SIZE - 5.5, SLOT_Y + 2.5);
          const pipFallbackValue = new Text({
            text: occupantDie && dieValue(occupantDie) > 6 ? occupantValue : '',
            style: {
              fill: 0xffffff,
              fontFamily: 'Georgia',
              fontSize: 18,
              fontWeight: 'bold',
              stroke: { color: 0x120d0b, width: 3 },
            },
          });
          pipFallbackValue.anchor.set(0.5);
          pipFallbackValue.position.set(x + SLOT_SIZE / 2, SLOT_CENTER_Y - 4);
          const owner = new Text({
            text:
              occupantRaidDamage !== null
                ? `${occupantRaidDamage} DMG`
                : slotBumpable
                  ? 'BUMP'
                  : human
                    ? 'YOU'
                    : 'CPU',
            style: {
              fill: slotBumpable ? 0xffe89a : 0xf1eadc,
              fontFamily: 'Arial',
              fontSize: occupantRaidDamage !== null ? 6.5 : 7,
              fontWeight: 'bold',
              letterSpacing: 0.4,
            },
          });
          owner.anchor.set(0.5);
          owner.position.set(x + SLOT_SIZE / 2, SLOT_CENTER_Y + 13);
          card.addChild(
            die,
            pipFallbackValue,
            valueBadge,
            valueBadgeText,
            owner,
          );
          if (slotBumpable) pulseTargets.push(die);
        } else {
          if (slotLegal) {
            const targetRing = new Graphics()
              .roundRect(x - 6, SLOT_Y - 6, SLOT_SIZE + 12, SLOT_SIZE + 12, 11)
              .stroke({
                color: slotRecommended ? 0xffd36d : 0x78efac,
                width: slotRecommended ? 4 : 3,
                alpha: 0.76,
              });
            card.addChild(targetRing);
            pulseTargets.push(targetRing);
          }
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
                ? slotRecommended
                  ? 0xffd36d
                  : slotLegal
                    ? 0x78efac
                    : 0xa85e50
                : 0x8a7352,
              width: slotRecommended ? 5 : slotLegal ? 4 : 2,
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
          if (slotLegal) {
            const landCue = new Text({
              text: slotRecommended ? 'LAND ★' : 'LAND',
              style: {
                fill: slotRecommended ? 0xffedba : 0xbaffd3,
                fontFamily: 'Arial',
                fontSize: 7,
                fontWeight: 'bold',
                letterSpacing: 0.5,
                stroke: { color: 0x120d0b, width: 2 },
              },
            });
            landCue.anchor.set(0.5);
            landCue.position.set(x + SLOT_SIZE / 2, SLOT_Y - 11);
            card.addChild(landCue);
          }
        }
        if (slotRecommended) pulseTargets.push(die);
      });

      const occupancy = new Text({
        text: `${occupied}/${openSlots.length} slots`,
        style: { fill: 0xd6bd8f, fontFamily: 'Arial', fontSize: 10 },
      });
      occupancy.anchor.set(0.5);
      occupancy.position.set(CARD_WIDTH / 2, 211);
      card.addChild(occupancy);
      world.addChild(card);
      locationCardsRef.current.push(card);
    });

    const pulse = () => {
      if (props.reducedMotion) return;
      const now = performance.now();
      const alpha = 0.72 + Math.sin(now / 260) * 0.25;
      leyLines.alpha = 0.72 + Math.sin(now / 1900) * 0.18;
      for (const target of pulseTargets) target.alpha = alpha;
      for (const { mote, x, y, phase } of motes) {
        mote.alpha = 0.54 + Math.sin(now / 720 + phase) * 0.28;
        mote.position.set(x, y + Math.sin(now / 860 + phase) * 5);
      }
    };
    pulseRef.current = pulse;
    app.ticker.add(pulse);
    return () => {
      app.ticker.remove(pulse);
      if (worldRef.current === world) worldRef.current = null;
      if (worldRef.current === null) locationCardsRef.current = [];
    };
  }, [
    props.game,
    props.humanPlayerId,
    props.legalActions,
    props.pinnedLocationId,
    props.recommendedAction,
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
    const camera = cameraRef.current;
    const x =
      (((event.clientX - bounds.left) / bounds.width) * BOARD_WIDTH -
        camera.x) /
      camera.scale;
    const y =
      (((event.clientY - bounds.top) / bounds.height) * BOARD_HEIGHT -
        camera.y) /
      camera.scale;
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

  const zoomAt = (scale: number, clientX?: number, clientY?: number) => {
    const bounds = hostRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const camera = cameraRef.current;
    const localX =
      clientX === undefined
        ? BOARD_WIDTH / 2
        : ((clientX - bounds.left) / bounds.width) * BOARD_WIDTH;
    const localY =
      clientY === undefined
        ? BOARD_HEIGHT / 2
        : ((clientY - bounds.top) / bounds.height) * BOARD_HEIGHT;
    const worldX = (localX - camera.x) / camera.scale;
    const worldY = (localY - camera.y) / camera.scale;
    setAtlasView(null);
    applyCamera({
      scale,
      x: localX - worldX * scale,
      y: localY - worldY * scale,
    });
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0014);
    zoomAt(cameraRef.current.scale * factor, event.clientX, event.clientY);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        '.atlas-nav, .board-zoom-controls, .location-inspect-hotspot',
      )
    )
      return;
    const camera = cameraRef.current;
    panRef.current = {
      active: true,
      didMove: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan.active || pan.pointerId !== event.pointerId) return;
    const bounds = hostRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const dx = ((event.clientX - pan.startX) / bounds.width) * BOARD_WIDTH;
    const dy = ((event.clientY - pan.startY) / bounds.height) * BOARD_HEIGHT;
    if (Math.abs(dx) + Math.abs(dy) > 5) pan.didMove = true;
    if (!pan.didMove) return;
    setAtlasView(null);
    applyCamera({
      ...cameraRef.current,
      x: pan.cameraX + dx,
      y: pan.cameraY + dy,
    });
  };

  const finishPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan.active || pan.pointerId !== event.pointerId) return;
    suppressClickRef.current = pan.didMove;
    pan.active = false;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (pan.didMove)
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
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
      className={`pixi-board ${isPanning ? 'is-panning' : ''}`}
      data-ready={ready ? 'true' : 'false'}
      data-testid="pixi-board"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onPointerCancel={finishPan}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPan}
      onWheel={onWheel}
      ref={hostRef}
    >
      <div
        className="camera-hotspot-layer"
        style={{
          transform: `translate(${(cameraState.x / BOARD_WIDTH) * 100}%, ${(cameraState.y / BOARD_HEIGHT) * 100}%) scale(${cameraState.scale})`,
        }}
      >
        {forgePoint && (
          <div
            aria-hidden="true"
            className="tutorial-hotspot"
            data-tutorial="forge-location"
            style={tutorialLandmarkStyle(forgePoint)}
          />
        )}
        {huntPoint && (
          <div
            aria-hidden="true"
            className="tutorial-hotspot"
            data-tutorial="hunt-location"
            style={tutorialLandmarkStyle(huntPoint)}
          />
        )}
        {raidPoint && (
          <div
            aria-hidden="true"
            className="tutorial-hotspot"
            data-tutorial="raid-location"
            style={tutorialLandmarkStyle(raidPoint)}
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
                if (suppressClickRef.current) return;
                if (props.selectedDieId && canPlace) {
                  placeRef.current(location.id, props.selectedDieId);
                  return;
                }
                pinRef.current(location.id);
              }}
              onDoubleClick={() => focusLocation(index)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
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
              style={cameraHotspotStyle(point, cameraState.scale)}
              title={
                props.selectedDieId
                  ? `${canPlace ? 'Place at' : 'Inspect'} ${location.name}`
                  : `Inspect ${location.name}`
              }
              type="button"
            />
          );
        })}
      </div>
      <nav className="atlas-nav" aria-label="Realm camera">
        <span>Atlas</span>
        {ATLAS_VIEWS.map((view) => (
          <button
            aria-pressed={atlasView === view.id}
            className={atlasView === view.id ? 'is-active' : ''}
            key={view.id}
            onClick={() => selectAtlasView(view.id)}
            type="button"
          >
            {view.label}
          </button>
        ))}
      </nav>
      <div className="board-zoom-controls" aria-label="Board zoom controls">
        <button
          aria-label="Zoom out"
          onClick={() => zoomAt(cameraRef.current.scale / 1.22)}
          type="button"
        >
          −
        </button>
        <output aria-live="polite">
          {Math.round(cameraState.scale * 100)}%
        </output>
        <button
          aria-label="Zoom in"
          onClick={() => zoomAt(cameraRef.current.scale * 1.22)}
          type="button"
        >
          +
        </button>
        <button
          className="fit-realm"
          onClick={() => selectAtlasView('overview')}
          type="button"
        >
          Fit realm
        </button>
      </div>
      <div className="camera-gesture-hint" aria-hidden="true">
        Drag map · scroll to zoom
      </div>
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
