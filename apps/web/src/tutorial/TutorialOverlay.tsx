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
    title: 'Gather five resources',
    symbol: '◈',
    body: 'Gold, mana, knowledge, materials, and influence pay for locations, cards, and upgrades. Victory points are your main score.',
    tip: 'Unspent resources also provide up to 3 points at game end.',
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
    anchor: 'board',
    eyebrow: 'The realm',
    title: 'Place dice to gain rewards',
    symbol: '⌖',
    body: 'Choose a glowing location after selecting a die. Empty slots may demand a minimum value, affinity, or resource payment.',
    tip: 'You can also drag a die directly onto a location.',
  },
  {
    anchor: 'preview',
    eyebrow: 'Plan before committing',
    title: 'Inspect rewards and restrictions',
    symbol: '☰',
    body: 'Hover or focus a location to see its reward and both slot requirements. With a die selected, this panel explains why each slot is legal or blocked.',
    tip: 'The keyboard placement list offers the same validated choices.',
  },
  {
    anchor: 'cards',
    eyebrow: 'Schemes and allies',
    title: 'Play cards or visit the market',
    symbol: '✦',
    body: 'Your faction begins with a unique card. Playing or acquiring a card uses your turn. The three-card market refills from the seeded deck.',
    tip: 'Some cards need a ready die selected as their target.',
  },
  {
    anchor: 'board',
    eyebrow: 'Permanent power',
    title: 'Unlock upgrades at Forge Hall',
    symbol: '⚒',
    body: 'Place a die at Forge Hall to reveal the Forge panel for that round. Spend materials to permanently replace one face on any of your dice.',
    tip: 'New face symbols grant bonus resources—or a masterwork victory point—when placed.',
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
    body: 'The log records every resolved rule. After round six, victory points, reserves, faction scoring, played allies and relics, and die enhancements are totaled.',
    tip: 'Everything is deterministic: the same seed and choices produce the same match.',
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
