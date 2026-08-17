/** SPEC 第 9 节:郑国渠覆盖(T-20 ~ T-25) */
import { describe, expect, it } from 'vitest';
import { toPersonalView } from '../src/index';
import { P, logOf, makeGame, playRound, step, takeTurn } from './fixtures';

describe('郑国渠覆盖', () => {
  it('T-20 郑国渠在 index 2 覆盖兽首 0,index 3 玩家鉴 0 → BLOCKED', () => {
    let s = makeGame({ actedSeats: [0, 1, 7] }); // 郑国渠当前,index 2
    s = takeTurn(s, P.ZGQ, { appraise: [1], skill: { targetBeastId: 0 }, passTo: P.MU });
    expect(s.rounds[0].covered).toEqual({ beastId: 0, atIndex: 2 });

    s = step(s, { type: 'APPRAISE', playerId: P.MU, beastIds: [0] });
    expect(logOf(s, P.MU, 0, 0).shown).toBe('BLOCKED');
  });

  it('T-21 index 3 玩家鉴未被覆盖的件 → 正常结果', () => {
    let s = makeGame({ actedSeats: [0, 1, 7] });
    s = takeTurn(s, P.ZGQ, { appraise: [1], skill: { targetBeastId: 0 }, passTo: P.MU });
    s = step(s, { type: 'APPRAISE', playerId: P.MU, beastIds: [6] }); // 6 是赝品
    expect(logOf(s, P.MU, 0, 6).shown).toBe('FAKE');
  });

  it('T-22 已在覆盖前行动的玩家不受影响', () => {
    let s = makeGame({ actedSeats: [0, 4] }); // 黄烟烟当前,index 1
    s = takeTurn(s, P.HUANG, { appraise: [0], passTo: P.ZGQ });
    expect(logOf(s, P.HUANG, 0, 0).shown).toBe('REAL');

    s = takeTurn(s, P.ZGQ, { skill: { targetBeastId: 0 }, passTo: P.MU }); // index 2 覆盖 0
    expect(logOf(s, P.HUANG, 0, 0).shown).toBe('REAL'); // 记录不变

    s = step(s, { type: 'APPRAISE', playerId: P.MU, beastIds: [0] }); // 之后的人被挡
    expect(logOf(s, P.MU, 0, 0).shown).toBe('BLOCKED');
  });

  it('T-23 覆盖 + 老朝奉翻转同时存在,鉴被覆盖件 → BLOCKED(覆盖优先)', () => {
    let s = makeGame({ actedSeats: [5] }); // 老朝奉起始
    s = takeTurn(s, P.LCF, { skill: {}, passTo: P.ZGQ }); // index 0 翻转
    s = takeTurn(s, P.ZGQ, { skill: { targetBeastId: 0 }, passTo: P.MU }); // index 1 覆盖 0
    s = step(s, { type: 'APPRAISE', playerId: P.MU, beastIds: [0] });
    expect(logOf(s, P.MU, 0, 0).shown).toBe('BLOCKED'); // 不是 FAKE
  });

  it('T-24 覆盖不跨轮', () => {
    let s = makeGame({ actedSeats: [7] }); // 郑国渠起始
    s = takeTurn(s, P.ZGQ, { skill: { targetBeastId: 0 } }); // 覆盖本轮的 0
    s = playRound(s); // → 第 2 轮

    expect(s.rounds[1].covered).toBeNull();
    const starter = s.rounds[1].actionOrder[0];
    s = takeTurn(s, starter, { passTo: P.MU });
    s = step(s, { type: 'APPRAISE', playerId: P.MU, beastIds: [2] }); // 第 2 轮的真品
    expect(logOf(s, P.MU, 1, 2).shown).toBe('REAL');
  });

  it('T-25 郑国渠自己的 knownTeammates 为空数组', () => {
    const v = toPersonalView(makeGame(), P.ZGQ);
    expect(v.me.knownTeammates).toEqual([]);
  });
});
