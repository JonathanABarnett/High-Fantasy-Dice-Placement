# Rebuild v2 asset kit

Generated with the built-in ImageGen tool for the board-game interface rebuild.

## Runtime assets

- `shattered-realm-board-v2.webp` — seamless 4 × 3 territory board, with twelve readable land regions and open overlays for dice-placement targets.
- `table-surface-v2.webp` — dark slate, carved wood, and antique-brass table surface used behind the full game shell.
- `arcane-card-face-v2.webp` — portrait observatory card face with an illustrated upper field and parchment rules field.
- `player-tableau-v2.webp` — six-building player domain in a 2 × 3 tableau with four relic sockets.
- `fantasy-dice-atlas-v1.webp` — transparent five-cell atlas of arcane, martial, nature, influence, and neutral dice bodies with blank value faces for live HTML overlays.

## Art direction

Painterly high-fantasy tabletop components; physically plausible materials; deep charcoal, aged gold, emerald, sapphire, and amethyst accents; strong silhouettes at gameplay scale; no baked-in copy, logos, dice, counters, or HUD controls.

## Integration rules

- Keep interaction labels and numbers in HTML/Pixi so they remain dynamic and accessible.
- Never bake dice, player ownership, score, or state into the illustrations.
- Use territory glow, borders, and slot rings sparingly so the world art remains visible.

## Dice atlas prompt

Built-in ImageGen prompt: premium painterly 3D tabletop dice bodies in a horizontal five-cell atlas, ordered sapphire arcane, crimson iron martial, emerald wood nature, ivory gold influence, and black obsidian neutral; identical three-quarter perspective; blank front facets; flat magenta chroma background; no text, numbers, pips, shadows, logos, or watermark. The chroma background was removed locally with a soft alpha matte and despill.
