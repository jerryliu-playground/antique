/**
 * SPEC Phase 1 验收第 2 条:
 * 给定 seed 与随机 action 序列,跑完整局 1000 次不抛异常、不进入非法状态。
 * (6/7/8 人局轮换;1/4 的对局附带 PersonalView 泄密走查。)
 */
import { describe, expect, it } from 'vitest';
import { runFuzz, runFuzzGame } from '../src/testing/index';

describe('随机对局 fuzz', () => {
  it('1000 局完整随机对局:无异常、无非法状态、无泄密', () => {
    const report = runFuzz(1000);
    expect(report.games).toBe(1000);
    expect(report.totalActions).toBeGreaterThan(0);
  });

  it('确定性重放:同一 seed 的整局结果完全一致', () => {
    const a = runFuzzGame(424242, 8, false);
    const b = runFuzzGame(424242, 8, false);
    expect(a.actions).toBe(b.actions);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
