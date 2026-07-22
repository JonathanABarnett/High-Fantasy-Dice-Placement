import { describe, expect, it } from 'vitest';

import { SeededRandom } from './seeded-random.js';

describe('SeededRandom', () => {
  it('produces the same sequence for the same string seed', () => {
    const first = new SeededRandom('shattered-crown');
    const second = new SeededRandom('shattered-crown');

    expect(Array.from({ length: 8 }, () => first.nextFloat())).toEqual(
      Array.from({ length: 8 }, () => second.nextFloat()),
    );
  });

  it('produces different sequences for different seeds', () => {
    const first = new SeededRandom('conclave');
    const second = new SeededRandom('dominion');

    expect(Array.from({ length: 4 }, () => first.nextFloat())).not.toEqual(
      Array.from({ length: 4 }, () => second.nextFloat()),
    );
  });

  it('restores a sequence from a snapshot', () => {
    const original = new SeededRandom(42);
    original.nextFloat();
    const restored = new SeededRandom(original.snapshot());

    expect(restored.nextFloat()).toBe(original.nextFloat());
  });

  it('returns integers inside a half-open range', () => {
    const random = new SeededRandom(7);
    const values = Array.from({ length: 100 }, () => random.nextInt(2, 6));

    expect(values.every((value) => value >= 2 && value < 6)).toBe(true);
  });

  it('does not mutate the source when shuffling', () => {
    const random = new SeededRandom(19);
    const source = [1, 2, 3, 4, 5];
    const shuffled = random.shuffle(source);

    expect(source).toEqual([1, 2, 3, 4, 5]);
    expect([...shuffled].sort()).toEqual(source);
  });

  it('rejects invalid ranges and empty choices', () => {
    const random = new SeededRandom(1);

    expect(() => random.nextInt(4, 4)).toThrow(RangeError);
    expect(() => random.pick([])).toThrow(RangeError);
  });
});
