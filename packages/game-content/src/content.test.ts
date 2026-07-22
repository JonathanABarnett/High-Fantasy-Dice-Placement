import { describe, expect, it } from 'vitest';

import { cards, factions, locations, upgrades } from './index.js';

describe('Milestone 1 content', () => {
  it('defines four unique factions', () => {
    expect(factions).toHaveLength(4);
    expect(new Set(factions.map((faction) => faction.id)).size).toBe(4);
  });

  it('defines twelve unique two-slot locations', () => {
    expect(locations).toHaveLength(12);
    expect(new Set(locations.map((location) => location.id)).size).toBe(12);
    expect(locations.every((location) => location.slots.length === 2)).toBe(
      true,
    );
  });

  it('defines unique executable cards with a stocked market', () => {
    expect(cards).toHaveLength(14);
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
    expect(cards.filter((card) => card.marketCopies > 0)).toHaveLength(10);
    expect(cards.every((card) => card.effects.length > 0)).toBe(true);
  });

  it('defines six unique permanent face upgrades', () => {
    expect(upgrades).toHaveLength(6);
    expect(new Set(upgrades.map((upgrade) => upgrade.id)).size).toBe(6);
    expect(upgrades.every((upgrade) => upgrade.scoreValue > 0)).toBe(true);
  });
});
