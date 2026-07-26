import { describe, expect, it } from 'vitest';

import { cards, factions, locations, objectives, upgrades } from './index.js';

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
    expect(cards).toHaveLength(26);
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
    expect(cards.filter((card) => card.marketCopies > 0)).toHaveLength(22);
    expect(cards.every((card) => card.effects.length > 0)).toBe(true);
  });

  it('offers cards that reach into combat and rivalry, not just income', () => {
    const market = cards.filter((card) => card.marketCopies > 0);
    const kinds = new Set(
      market.flatMap((card) => card.effects.map((effect) => effect.type)),
    );
    for (const kind of [
      'boost-die',
      'damage-raid',
      'steal-resource',
      'gain-victory-points-per-monster',
      'gain-victory-points-per-upgrade',
      'gain-resource-per-tag-placement',
    ])
      expect(kinds).toContain(kind);

    // A die boost has to name a die, and any card that only softens the raid
    // would be dead once the beast dies, so those pair with a second effect.
    for (const card of market) {
      const types = card.effects.map((effect) => effect.type);
      if (types.includes('boost-die')) expect(card.target).toBe('ready-die');
      if (types.includes('damage-raid'))
        expect(card.effects.length).toBeGreaterThan(1);
    }
  });

  it('defines twelve unique permanent face upgrades', () => {
    expect(upgrades).toHaveLength(12);
    expect(new Set(upgrades.map((upgrade) => upgrade.id)).size).toBe(12);
    expect(upgrades.every((upgrade) => upgrade.scoreValue > 0)).toBe(true);
  });

  it('stocks combat locations with monster hunts and a raid boss', () => {
    const hunts = locations.filter((location) => location.encounter);
    expect(hunts.length).toBeGreaterThanOrEqual(2);
    for (const location of hunts) {
      const encounter = location.encounter!;
      expect(location.tags).toContain('combat');
      expect(encounter.title.length).toBeGreaterThan(0);
      expect(encounter.beasts.length).toBeGreaterThan(0);
      if (encounter.health === undefined) {
        // A single-die hunt: every slot is its own beast with a crit bonus.
        expect(encounter.beasts).toHaveLength(location.slots.length);
        expect(encounter.criticalBonus).toBeGreaterThan(0);
      } else {
        // A raid boss: one shared beast, health pool, and a killing-blow bounty.
        expect(encounter.beasts).toHaveLength(1);
        expect(encounter.health).toBeGreaterThan(0);
        expect(encounter.bounty?.victoryPoints ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('defines a claimable objective pool with typed conditions', () => {
    expect(objectives.length).toBeGreaterThanOrEqual(3);
    expect(new Set(objectives.map((item) => item.id)).size).toBe(
      objectives.length,
    );
    expect(objectives.every((item) => item.victoryPoints > 0)).toBe(true);
    expect(
      objectives.every(
        (item) =>
          'amount' in item.condition &&
          (item.condition as { amount: number }).amount > 0,
      ),
    ).toBe(true);
  });
});
