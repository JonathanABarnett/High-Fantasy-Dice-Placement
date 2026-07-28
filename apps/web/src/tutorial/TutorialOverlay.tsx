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
    eyebrow: 'Welcome, sovereign',
    title: 'Claim the Shattered Crown',
    symbol: '♛',
    body: 'You and the CPU compete across six rounds. Every action spends a turn, so timing matters as much as raw power.',
    tip: 'The first-player marker alternates each round.',
  },
  {
    anchor: 'players',
    eyebrow: 'Your realm',
    title: 'Read the live standing',
    symbol: '◈',
    body: 'The player strip shows the real current score, not just victory-point tokens. Gold, mana, knowledge, materials, and influence are inputs for locations, cards, and upgrades, and reserves can still matter at scoring.',
    tip: 'The loud number answers “am I winning?”; the small resource icons answer “what can I afford?”',
  },
  {
    anchor: 'dice',
    eyebrow: 'Your workers',
    title: 'Read and select your dice',
    symbol: '⚄',
    body: 'Each die has a rolled value and an affinity. Select a ready die here; the board will glow wherever that die can legally go.',
    tip: 'A placed die stays occupied until the round ends.',
  },
  {
    anchor: 'dice',
    eyebrow: 'Keep the table clear',
    title: 'Use the command center',
    symbol: '◇',
    body: 'Your dice, momentum, pass button, and drawer shortcuts live together because they are the controls you use every round. The drawer shows one support panel at a time.',
    tip: 'A glowing dot on Cards or Forge means a real turn-spending action is available there.',
  },
  {
    anchor: 'board',
    eyebrow: 'The realm',
    title: 'Place dice to gain rewards',
    symbol: '⌖',
    body: 'Choose a glowing location after selecting a die. Empty slots may demand a minimum value, affinity, or resource payment.',
    tip: 'Placements that share a theme build momentum. A three-link run starts scoring bonus points, so sequence matters.',
  },
  {
    anchor: 'preview',
    eyebrow: 'Plan before committing',
    title: 'Inspect rewards and restrictions',
    symbol: '☰',
    body: 'Hover or click a location to pin its reward and slot requirements near your dice. With a die selected, this panel explains why each slot is playable, blocked, full, or bumpable.',
    tip: 'The reward and requirement icons here have their own hover and keyboard-focus explanations, so you do not have to chase tiny symbols on the map.',
  },
  {
    anchor: 'preview',
    eyebrow: 'Keep the table clear',
    title: 'Open only the panels you need',
    symbol: '▾',
    body: 'Use the drawer shortcuts to switch between Cards, Quests, Forge, Pressure, and Log. The location decision dock stays near the board, so placement details do not disappear when you check another panel.',
    tip: 'The board, dice, and decision dock are your main loop. The drawer is supporting information.',
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
    body: 'Dragon Pass is a raid. The dragon keeps one pool of health across every round, and both players wound the same pool — a critical hit bites twice as deep.',
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
    anchor: 'cards',
    eyebrow: 'Schemes and allies',
    title: 'Play cards, buy engines',
    symbol: '✦',
    body: 'Your faction begins with a unique card. Playing or acquiring a card uses your turn. The market includes immediate tactics plus payoff cards that cash in monsters slain, combat placements, and forged die faces.',
    tip: 'Some cards need a ready die selected as their target. Use the Cards shortcut when it has a dot, then return to the board.',
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
    anchor: 'quests',
    eyebrow: 'Race the realm',
    title: 'Claim the Crown Quests first',
    symbol: '★',
    body: 'Three shared quests are drawn each match and both players chase the same three. Quests can care about monsters, resources, upgrades, placements, cards played, or even ally and relic cards specifically.',
    tip: 'The moment someone meets a quest, its points are theirs forever. Check this drawer early, choose a race, then return to the board.',
  },
  {
    anchor: 'pass',
    eyebrow: 'Round tempo',
    title: 'Pass when your plans are complete',
    symbol: '⌛',
    body: 'Passing removes you from the rest of the current round. When both players pass, all dice return, reroll, and the next round begins.',
    tip: 'You cannot act again after passing, even if the CPU keeps playing.',
  },
  {
    anchor: 'log',
    eyebrow: 'The final reckoning',
    title: 'Follow the log and build your score',
    symbol: '♜',
    body: 'Big swings appear as callouts over the board. Open the log when you want to verify exactly what resolved, then return to the current turn.',
    tip: 'After round six, victory points, reserves, faction scoring, played allies and relics, and die enhancements are totaled. Same seed and choices, same match.',
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
      const padding = 8;
      setFocusRect({
        top: Math.max(8, rect.top - padding),
        left: Math.max(8, rect.left - padding),
        width: Math.min(window.innerWidth - 16, rect.width + padding * 2),
        height: Math.min(window.innerHeight - 16, rect.height + padding * 2),
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
        className="tutorial-dialog"
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
