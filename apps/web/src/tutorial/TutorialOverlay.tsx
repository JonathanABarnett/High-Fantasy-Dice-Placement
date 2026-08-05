import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

interface TutorialStep {
  readonly anchor: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly symbol: string;
  readonly body: string;
  readonly tip: string;
}

const STEPS: readonly TutorialStep[] = [
  {
    anchor: 'header',
    eyebrow: 'The match begins',
    title: 'Claim the Shattered Crown',
    symbol: '♛',
    body: 'You and your CPU rivals have six rounds to build the strongest realm. The compact header keeps the current round, active player, camera controls, and menu visible without shrinking the board. A brief action ribbon summarizes each handoff without stopping play.',
    tip: 'Most actions spend your turn. In a three-player match, the opening seat gets a small resource purse and initiative mirrors A–B–C–C–B–A across six rounds.',
  },
  {
    anchor: 'players',
    eyebrow: 'The score race',
    title: 'Track score and resources',
    symbol: '◈',
    body: 'The house strips show the live total score and each player’s resources. The large number answers who is winning; the smaller icons show what each player can afford right now.',
    tip: 'The displayed total already includes every scoring source the game can currently calculate.',
  },
  {
    anchor: 'tray',
    eyebrow: 'Your command surface',
    title: 'Start every turn in the tray',
    symbol: '◇',
    body: 'Your physical tray holds the pieces and controls that matter this turn: dice, momentum, the current action, system shortcuts, and Pass. It stays along the bottom edge so the realm remains the main surface.',
    tip: 'A glowing dot on a shortcut means a real action is waiting behind it.',
  },
  {
    anchor: 'dice',
    eyebrow: 'Your workers',
    title: 'Lift a die to plan',
    symbol: '⚄',
    body: 'Each die has a rolled value and affinity. Select or drag a ready die and the interface enters planning mode: legal landing slots illuminate and the best available routes replace your hand in the command rail.',
    tip: 'Select the same die again to clear your plan. A committed die remains on the board until the round ends.',
  },
  {
    anchor: 'board',
    eyebrow: 'Read the realm',
    title: 'Follow the highlighted slots',
    symbol: '⌖',
    body: 'The realm is always the main play surface. At rest, slot rails stay muted so the painted map can breathe; hover or keyboard-focus a location to bring its details forward. After choosing a die, only legal landing slots glow green while unavailable slots recede.',
    tip: 'Use the Atlas pills to jump between regions and the mouse wheel to zoom without leaving the table.',
  },
  {
    anchor: 'board',
    eyebrow: 'Plan before committing',
    title: 'Pin a location for full details',
    symbol: '☰',
    body: 'Click any location without placing to pin its contextual drawer. It first presents the reward and slot requirements at a glance; choose a die and those slots immediately resolve to playable, blocked, full, or bumpable.',
    tip: 'The pinned plaque and drawer replace oversized map effects. On compact tables, your armed-die summary stays in the command rail while the drawer handles slot details.',
  },
  {
    anchor: 'momentum',
    eyebrow: 'Sequence creates power',
    title: 'Chain placements into momentum',
    symbol: '⟡',
    body: 'Locations carry themes. Place into the same theme repeatedly during a round to build a run. The momentum meter advances inside your tray and begins awarding bonus points when the chain reaches three.',
    tip: 'The order of otherwise legal moves matters: break a theme and the run starts over.',
  },
  {
    anchor: 'hand',
    eyebrow: 'Schemes in reach',
    title: 'Play directly from your hand',
    symbol: '✦',
    body: 'On wider tables, your hand occupies the center bay of the command rail and becomes a compact route list when you select a die. On compact tables, Cards opens the same hand in a focused modal so the board and dice stay readable.',
    tip: 'Some cards require a ready die as their target. Select that die before opening Cards when you are ready to cast it.',
  },
  {
    anchor: 'drawers',
    eyebrow: 'Depth on demand',
    title: 'Open one system drawer at a time',
    symbol: '▾',
    body: 'Cards, Quests, Forge, Log, and Pressure are supporting systems, not permanent columns. Their tray shortcuts open one focused modal above the table and close it when selected again.',
    tip: 'Press Escape to close the focused system and return to the realm.',
  },
  {
    anchor: 'hunt-location',
    eyebrow: 'Blood and spoils',
    title: 'Hunt monsters for their spoils',
    symbol: '⚔',
    body: 'At a monster hunt, each slot is a beast whose minimum value is its threat. Beating that threat slays it — and every point you exceed it by loots one extra spoil.',
    tip: 'A natural 6, or a masterwork face you forged, lands a critical strike for bonus points. Here a high roll is a prize, not a waste.',
  },
  {
    anchor: 'raid-location',
    eyebrow: 'The great wyrm',
    title: 'Wound the Elder Dragon together',
    symbol: '🜂',
    body: 'Dragon Pass is a raid. The dragon keeps one pool of health across every round, and every player wounds the same pool — a critical hit bites twice as deep.',
    tip: 'The hoard grows each round the dragon survives, but if nobody wounds it that round, it regenerates. Only the killing blow claims the bounty.',
  },
  {
    anchor: 'board',
    eyebrow: 'Take what is held',
    title: 'Bump rivals off contested slots',
    symbol: '⚡',
    body: 'A slot your rival already holds is not closed to you. Send a die of strictly higher value and pay 1 influence to drive them off and seize the slot.',
    tip: 'Their die returns to them ready to use again, so bumping costs you influence and a strong die rather than destroying theirs.',
  },
  {
    anchor: 'forge-location',
    eyebrow: 'Permanent power',
    title: 'Unlock upgrades at Forge Hall',
    symbol: '⚒',
    body: 'When Forge Hall is open this round, place a die there to reveal the Forge panel. Then spend materials to permanently replace one face on any die with one of twelve upgrade faces.',
    tip: 'Cheap faces make bad rolls reliable, high faces reach harder slots, dual-symbol faces generate resources, and masterwork faces score when placed.',
  },
  {
    anchor: 'drawers',
    eyebrow: 'Race the realm',
    title: 'Claim the Crown Quests first',
    symbol: '★',
    body: 'Three shared quests are drawn each match and every player chases the same three. Quests can care about monsters, resources, upgrades, placements, cards played, or even ally and relic cards specifically.',
    tip: 'The moment someone meets a quest, its points are theirs forever. Check this drawer early, choose a race, then return to the board.',
  },
  {
    anchor: 'pass',
    eyebrow: 'Round tempo',
    title: 'Pass when your plans are complete',
    symbol: '⌛',
    body: 'Passing removes you from the rest of the current round. When every player has passed, all dice return, reroll, and the next round begins.',
    tip: 'You cannot act again after passing, even while one or more CPU rivals keep playing.',
  },
  {
    anchor: 'menu',
    eyebrow: 'Leave the table clean',
    title: 'Use the menu, log, and final reckoning',
    symbol: '♜',
    body: 'Menu keeps tutorial, motion, sound, save, and restart controls away from play. Use Log in the tray when you need to audit an event. After round six, the table gives way to a full-screen coronation and score breakdown.',
    tip: 'The same seed and the same choices always produce the same match, so saves and replays remain trustworthy.',
  },
];

interface TutorialOverlayProps {
  readonly onClose: () => void;
  readonly onFinish: () => void;
  readonly reducedMotion: boolean;
}

interface FocusRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export function TutorialOverlay({
  onClose,
  onFinish,
  reducedMotion,
}: TutorialOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [focusRect, setFocusRect] = useState<FocusRect | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const step = STEPS[stepIndex] as TutorialStep;

  useLayoutEffect(() => {
    const updateFocus = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-tutorial="${step.anchor}"]`,
      );
      if (!target) {
        setFocusRect(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        setFocusRect(null);
        return;
      }
      const padding = 8;
      const width = Math.min(window.innerWidth - 16, rect.width + padding * 2);
      const height = Math.min(
        window.innerHeight - 16,
        rect.height + padding * 2,
      );
      setFocusRect({
        top: Math.min(
          Math.max(8, rect.top - padding),
          window.innerHeight - height - 8,
        ),
        left: Math.min(
          Math.max(8, rect.left - padding),
          window.innerWidth - width - 8,
        ),
        width,
        height,
      });
      target.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    };
    updateFocus();
    const timer = window.setTimeout(updateFocus, 260);
    window.addEventListener('resize', updateFocus);
    window.addEventListener('scroll', updateFocus, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', updateFocus);
      window.removeEventListener('scroll', updateFocus, true);
    };
  }, [reducedMotion, step.anchor]);

  useEffect(() => {
    nextButtonRef.current?.focus();
  }, [stepIndex]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight')
        setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
      if (event.key === 'ArrowLeft')
        setStepIndex((current) => Math.max(0, current - 1));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const focusStyle = focusRect
    ? ({
        '--tutorial-top': `${focusRect.top}px`,
        '--tutorial-left': `${focusRect.left}px`,
        '--tutorial-width': `${focusRect.width}px`,
        '--tutorial-height': `${focusRect.height}px`,
      } as CSSProperties)
    : undefined;
  const dialogPlacement = focusRect
    ? `${focusRect.top + focusRect.height / 2 > window.innerHeight * 0.52 ? 'top' : 'bottom'}-${focusRect.left + focusRect.width / 2 > window.innerWidth / 2 ? 'left' : 'right'}`
    : 'bottom-right';
  return (
    <div className="tutorial-layer" data-testid="tutorial-overlay">
      {focusRect && (
        <div aria-hidden="true" className="tutorial-focus" style={focusStyle}>
          <span>{stepIndex + 1}</span>
        </div>
      )}
      <section
        aria-describedby="tutorial-description"
        aria-labelledby="tutorial-title"
        className={`tutorial-dialog place-${dialogPlacement}`}
        role="dialog"
      >
        <button
          aria-label="Close tutorial"
          className="tutorial-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <div
          className="tutorial-progress"
          style={{ gridTemplateColumns: `repeat(${STEPS.length}, 1fr)` }}
          aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}
        >
          {STEPS.map((item, index) => (
            <button
              aria-label={`Go to step ${index + 1}: ${item.title}`}
              aria-current={index === stepIndex ? 'step' : undefined}
              className={
                index === stepIndex
                  ? 'current'
                  : index < stepIndex
                    ? 'visited'
                    : ''
              }
              key={item.title}
              onClick={() => setStepIndex(index)}
              type="button"
            />
          ))}
        </div>
        <div className="tutorial-content">
          <div className="tutorial-symbol" aria-hidden="true">
            {step.symbol}
          </div>
          <div>
            <p className="eyebrow">{step.eyebrow}</p>
            <h2 id="tutorial-title">{step.title}</h2>
          </div>
        </div>
        <p id="tutorial-description">{step.body}</p>
        <p className="tutorial-tip">
          <strong>Field note:</strong> {step.tip}
        </p>
        <div className="tutorial-actions">
          <button
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((current) => current - 1)}
            type="button"
          >
            Back
          </button>
          <span>
            {stepIndex + 1} / {STEPS.length}
          </span>
          {stepIndex === STEPS.length - 1 ? (
            <button
              className="primary"
              onClick={onFinish}
              ref={nextButtonRef}
              type="button"
            >
              Begin playing
            </button>
          ) : (
            <button
              className="primary"
              onClick={() => setStepIndex((current) => current + 1)}
              ref={nextButtonRef}
              type="button"
            >
              Next
            </button>
          )}
        </div>
        <p className="tutorial-keys">← → navigate · Esc closes</p>
      </section>
    </div>
  );
}
