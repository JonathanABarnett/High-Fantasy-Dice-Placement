export type GameIconName =
  | 'ally'
  | 'arcane'
  | 'gold'
  | 'influence'
  | 'knowledge'
  | 'mana'
  | 'martial'
  | 'materials'
  | 'nature'
  | 'neutral'
  | 'relic'
  | 'tactic'
  | 'value'
  | 'victoryPoints';

const COMMON_ICON_PROPS = {
  'aria-hidden': true,
  focusable: false,
  viewBox: '0 0 24 24',
} as const;

export function GameIcon({ name }: { readonly name: GameIconName }) {
  switch (name) {
    case 'gold':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.4" />
          <path d="M12 5.8v12.4M5.8 12h12.4" />
        </svg>
      );
    case 'mana':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <path d="M12 2.5 20 12l-8 9.5L4 12 12 2.5Z" />
          <path d="M12 2.5 9.2 12 12 21.5 14.8 12 12 2.5Z" />
          <path d="M4 12h16" />
        </svg>
      );
    case 'knowledge':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <path d="M5 5.2c2.4-.7 4.6-.4 7 1.1v13c-2.4-1.5-4.6-1.8-7-1.1V5.2Z" />
          <path d="M19 5.2c-2.4-.7-4.6-.4-7 1.1v13c2.4-1.5 4.6-1.8 7-1.1V5.2Z" />
          <path d="M8 8.3h1.7M8 11h1.7M14.3 8.3H16M14.3 11H16" />
        </svg>
      );
    case 'materials':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <path d="m7.4 15.6 8.7-8.7 2.4 2.4-8.7 8.7a2 2 0 0 1-2.8 0 1.7 1.7 0 0 1 .4-2.4Z" />
          <path d="m14.8 4.5 4.7 4.7M6.2 6.2l2.5-2.5 2.8 2.8-2.5 2.5L6.2 6.2Z" />
          <path d="m9.6 8.5 2.3 2.3" />
        </svg>
      );
    case 'influence':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <path d="M7 20V5.5" />
          <path d="M7 5.8c3-2.1 6-.6 9-2.2v9c-3 1.6-6 .1-9 2.2v-9Z" />
          <path d="M5 20h8" />
          <path d="M10 7.3h3.6M10 10h3" />
        </svg>
      );
    case 'victoryPoints':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <path d="m12 2.7 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17l-5.6 2.9 1.1-6.2L3 9.3l6.2-.9L12 2.7Z" />
          <path d="m12 7.4.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1L9 9.6l2.1-.3.9-1.9Z" />
        </svg>
      );
    case 'arcane':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <path d="M12 2.5 14 10l7.5 2-7.5 2-2 7.5-2-7.5-7.5-2 7.5-2L12 2.5Z" />
          <path d="m5.2 5.2 2 2M16.8 16.8l2 2M18.8 5.2l-2 2M7.2 16.8l-2 2" />
        </svg>
      );
    case 'martial':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <path d="m4 20 6.7-6.7M13.3 10.7 20 4M14.7 4H20v5.3" />
          <path d="m20 20-6.7-6.7M10.7 10.7 4 4M4 4h5.3" />
          <path d="M8.5 15.5 6.2 17.8M15.5 15.5l2.3 2.3" />
        </svg>
      );
    case 'nature':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <path d="M20 4.5C11.5 4 6.2 8.6 6.7 16c6.9.6 11.8-4.5 13.3-11.5Z" />
          <path d="M6.7 16C9 12.3 12.6 9.6 17.4 7.7" />
          <path d="M7.7 13.8c-2.8.2-4.6 1.8-5.2 4.7 2.4.6 4.4-.1 6-2.1" />
        </svg>
      );
    case 'neutral':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="M12 7.2 16.3 9.6v4.8L12 16.8l-4.3-2.4V9.6L12 7.2Z" />
        </svg>
      );
    case 'value':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <circle cx="8.3" cy="8.3" r="1.1" />
          <circle cx="15.7" cy="8.3" r="1.1" />
          <circle cx="12" cy="12" r="1.1" />
          <circle cx="8.3" cy="15.7" r="1.1" />
          <circle cx="15.7" cy="15.7" r="1.1" />
        </svg>
      );
    case 'tactic':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <path d="m13 2.8-8 10h5.3L9 21.2l8.2-10.3h-5.4L13 2.8Z" />
        </svg>
      );
    case 'ally':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <path d="M12 4a3.2 3.2 0 1 1 0 6.4A3.2 3.2 0 0 1 12 4Z" />
          <path d="M5.5 20c.7-4.6 3-7 6.5-7s5.8 2.4 6.5 7H5.5Z" />
          <path d="M8.7 16.8h6.6" />
        </svg>
      );
    case 'relic':
      return (
        <svg {...COMMON_ICON_PROPS} className="game-icon" data-icon={name}>
          <path d="M12 2.8 18.5 7v7.7L12 21.2l-6.5-6.5V7L12 2.8Z" />
          <path d="M12 6.5 15 9v4.2L12 16.4 9 13.2V9l3-2.5Z" />
          <path d="M12 2.8v3.7M12 16.4v4.8" />
        </svg>
      );
  }
}
