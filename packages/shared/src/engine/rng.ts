/**
 * 纯函数式 seeded RNG(mulberry32)。
 * seed 与 rngCursor 都存在 GameState 里,同一 seed + 同一 action 序列必然得到同一结果。
 * 引擎内禁止使用 Math.random() / Date.now()(CLAUDE.md 铁律 3)。
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从随机流第 cursor 个位置起取 count 个数,返回新游标(供需要续用随机流的调用方使用) */
export function drawAt(
  seed: number,
  cursor: number,
  count: number,
): { values: number[]; nextCursor: number } {
  const rng = mulberry32(seed);
  for (let i = 0; i < cursor; i++) rng();
  const values: number[] = [];
  for (let i = 0; i < count; i++) values.push(rng());
  return { values, nextCursor: cursor + count };
}

/** Fisher–Yates,不修改入参 */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 0..n-1 均匀取一个下标 */
export function pickIndex(rng: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}
