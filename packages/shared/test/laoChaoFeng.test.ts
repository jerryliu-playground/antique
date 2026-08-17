/** SPEC 第 9 节:老朝奉翻转(T-01 ~ T-07) */
import { describe, expect, it } from 'vitest';
import { P, logOf, makeGame, playRound, step, takeTurn } from './fixtures';

/** 老朝奉(p5)当前行动,actionIndex = 2(前面 p3、p4 已行动) */
function lcfAtIndex2() {
  return makeGame({ actedSeats: [3, 4, 5] });
}

describe('老朝奉翻转', () => {
  it('T-01 老朝奉在 index 2 发动,index 3 的许愿鉴定真品 → 看到 FAKE', () => {
    let s = lcfAtIndex2();
    s = takeTurn(s, P.LCF, { skill: {}, passTo: P.XU }); // 发动翻转,派给许愿(index 3)
    expect(s.rounds[0].laoChaoFengFlipAt).toBe(2);

    s = step(s, { type: 'APPRAISE', playerId: P.XU, beastIds: [0, 6] }); // 0 真、6 假
    expect(logOf(s, P.XU, 0, 0).shown).toBe('FAKE'); // 真品被翻成赝
    expect(logOf(s, P.XU, 0, 6).shown).toBe('REAL'); // 赝品被翻成真
  });

  it('T-02 老朝奉在 index 2 发动,index 1 的黄烟烟(已行动)不受影响', () => {
    let s = makeGame({ actedSeats: [3, 4] }); // 黄烟烟当前,index 1
    s = takeTurn(s, P.HUANG, { appraise: [0], passTo: P.LCF }); // 她先鉴定真品 0
    expect(logOf(s, P.HUANG, 0, 0).shown).toBe('REAL');

    s = takeTurn(s, P.LCF, { skill: {}, passTo: P.XU }); // 老朝奉 index 2 发动
    expect(logOf(s, P.HUANG, 0, 0).shown).toBe('REAL'); // 已有记录不变
  });

  it('T-03 index 2 发动后,之后行动的药不然(EVIL)鉴定真品 → 看到 REAL', () => {
    let s = lcfAtIndex2();
    s = takeTurn(s, P.LCF, { skill: {}, passTo: P.YBR });
    s = step(s, { type: 'APPRAISE', playerId: P.YBR, beastIds: [0] });
    expect(logOf(s, P.YBR, 0, 0).shown).toBe('REAL');
  });

  it('T-04 index 2 发动后,之后行动的郑国渠(EVIL)鉴定真品 → 看到 REAL(R-1)', () => {
    let s = lcfAtIndex2();
    s = takeTurn(s, P.LCF, { skill: {}, passTo: P.ZGQ });
    s = step(s, { type: 'APPRAISE', playerId: P.ZGQ, beastIds: [0] });
    expect(logOf(s, P.ZGQ, 0, 0).shown).toBe('REAL');
  });

  it('T-05 index 2 发动后,之后行动的姬云浮鉴定真品 → 看到 REAL(免疫)', () => {
    let s = lcfAtIndex2();
    s = takeTurn(s, P.LCF, { skill: {}, passTo: P.JI });
    s = step(s, { type: 'APPRAISE', playerId: P.JI, beastIds: [0] });
    expect(logOf(s, P.JI, 0, 0).shown).toBe('REAL');
  });

  it('T-06 老朝奉不发动 → 所有人看到真实结果', () => {
    let s = lcfAtIndex2();
    s = takeTurn(s, P.LCF, { passTo: P.XU }); // 不发动
    expect(s.rounds[0].laoChaoFengFlipAt).toBeNull();
    s = step(s, { type: 'APPRAISE', playerId: P.XU, beastIds: [0, 6] });
    expect(logOf(s, P.XU, 0, 0).shown).toBe('REAL');
    expect(logOf(s, P.XU, 0, 6).shown).toBe('FAKE');
  });

  it('T-07 翻转不跨轮:第 1 轮发动,第 2 轮所有人看到真实结果', () => {
    let s = makeGame({ actedSeats: [5] }); // 老朝奉起始
    s = takeTurn(s, P.LCF, { skill: {} }); // index 0 发动,默认派给 p0
    s = playRound(s); // 走完第 1 轮 → 第 2 轮 ACTION

    expect(s.currentRound).toBe(1);
    expect(s.rounds[1].laoChaoFengFlipAt).toBeNull();

    // 第 2 轮起始是尾家(默认派票顺序下是 p7 郑国渠),让他走完,再由许愿鉴定
    const starter = s.rounds[1].actionOrder[0];
    s = takeTurn(s, starter, { passTo: P.XU });
    s = step(s, { type: 'APPRAISE', playerId: P.XU, beastIds: [2, 8] }); // 2 真、8 假
    expect(logOf(s, P.XU, 1, 2).shown).toBe('REAL');
    expect(logOf(s, P.XU, 1, 8).shown).toBe('FAKE');
  });
});
