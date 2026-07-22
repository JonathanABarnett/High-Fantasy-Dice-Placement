export interface RandomSnapshot {
  readonly algorithm: 'xorshift32';
  readonly state: number;
}

const NON_ZERO_FALLBACK = 0x6d2b79f5;

function hashString(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function normalizeSeed(seed: number | string): number {
  const value = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  return value === 0 ? NON_ZERO_FALLBACK : value;
}

/** A small, serializable PRNG for deterministic simulations and replays. */
export class SeededRandom {
  private state: number;

  public constructor(seed: number | string | RandomSnapshot) {
    this.state =
      typeof seed === 'object'
        ? normalizeSeed(seed.state)
        : normalizeSeed(seed);
  }

  public nextFloat(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }

  public nextInt(minInclusive: number, maxExclusive: number): number {
    if (
      !Number.isSafeInteger(minInclusive) ||
      !Number.isSafeInteger(maxExclusive)
    ) {
      throw new TypeError('Random integer bounds must be safe integers.');
    }

    if (maxExclusive <= minInclusive) {
      throw new RangeError('maxExclusive must be greater than minInclusive.');
    }

    return (
      Math.floor(this.nextFloat() * (maxExclusive - minInclusive)) +
      minInclusive
    );
  }

  public pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new RangeError('Cannot choose from an empty collection.');
    }

    return values[this.nextInt(0, values.length)] as T;
  }

  public shuffle<T>(values: readonly T[]): T[] {
    const shuffled = [...values];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = this.nextInt(0, index + 1);
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex] as T,
        shuffled[index] as T,
      ];
    }

    return shuffled;
  }

  public snapshot(): RandomSnapshot {
    return { algorithm: 'xorshift32', state: this.state };
  }
}
