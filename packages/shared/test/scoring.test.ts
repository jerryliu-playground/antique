/**
 * SPEC 第 9 节:结算(T-60 ~ T-66)
 *
 * 计分控制手法:全员 0 票时,每轮保护的是池子里生肖序最小的 2 件。
 * 默认池 [0,1,6,7]/[2,3,8,9]/[4,5,10,11] → 被保护的恒为 {0,1,2,3,4,5},
 * 通过调整 realBeasts(哪些 id 是真品)精确控制 realProtected。
 */
import { describe, expect, it } from 'vitest';
import type { Role } from '../src/index';
import { P, expectEngineError, makeGame, playThreeRounds, step, submitGuesses } from './fixtures';

const ALL_WRONG_GOOD = { p0: P.YBR, p1: P.YBR, p2: P.YBR, p3: P.YBR, p4: P.YBR };

describe('结算', () => {
  it('T-60 6 件保护全为真 → instantWin,GOOD 获胜,跳过 IDENTITY', () => {
    const s = playThreeRounds(makeGame()); // 默认 0..5 为真,保护的恰是 0..5
    expect(s.phase).toBe('FINISHED');
    expect(s.result).toMatchObject({
      instantWin: true,
      winner: 'GOOD',
      score: 6,
      breakdown: {
        realProtected: 6,
        xuYuanSurvivedBonus: 0,
        fangZhenSurvivedBonus: 0,
        laoChaoFengFoundBonus: 0,
      },
    });
  });

  it('T-61 4 真 + 老朝奉猜错许愿(+2) → 6 分 → GOOD 胜', () => {
    let s = playThreeRounds(makeGame({ realBeasts: [0, 1, 2, 3, 10, 11] })); // 保护 4 真
    expect(s.phase).toBe('IDENTITY');
    s = submitGuesses(s, {
      lcf: P.FANG, // 猜错许愿 → +2
      ybr: P.FANG, // 猜中方震 → +0
      good: ALL_WRONG_GOOD, // 无人猜中老朝奉 → +0
    });
    expect(s.phase).toBe('FINISHED');
    expect(s.result).toMatchObject({
      winner: 'GOOD',
      instantWin: false,
      score: 6,
      breakdown: {
        realProtected: 4,
        xuYuanSurvivedBonus: 2,
        fangZhenSurvivedBonus: 0,
        laoChaoFengFoundBonus: 0,
      },
    });
  });

  it('T-62 4 真 + 老朝奉猜中 + 药不然猜错(+1) + 3 好人猜中老朝奉(+1) → 6 分 → GOOD 胜', () => {
    let s = playThreeRounds(makeGame({ realBeasts: [0, 1, 2, 3, 10, 11] }));
    s = submitGuesses(s, {
      lcf: P.XU, // 猜中许愿 → +0
      ybr: P.MU, // 猜错方震 → +1
      good: { p0: P.LCF, p1: P.LCF, p2: P.LCF, p3: P.YBR, p4: P.YBR }, // 3/5 猜中 → +1
    });
    expect(s.result).toMatchObject({
      winner: 'GOOD',
      score: 6,
      breakdown: {
        realProtected: 4,
        xuYuanSurvivedBonus: 0,
        fangZhenSurvivedBonus: 1,
        laoChaoFengFoundBonus: 1,
      },
    });
  });

  it('T-63 3 真 + 全部加分项(+4) → 7 分 → GOOD 胜', () => {
    let s = playThreeRounds(makeGame({ realBeasts: [0, 1, 3, 8, 10, 11] })); // 保护 {0,1,3} 真
    s = submitGuesses(s, {
      lcf: P.HUANG, // 猜错 → +2
      ybr: P.JI, // 猜错 → +1
      good: { p0: P.LCF, p1: P.LCF, p2: P.LCF, p3: P.LCF, p4: P.YBR }, // 4/5 猜中 → +1
    });
    expect(s.result).toMatchObject({ winner: 'GOOD', score: 7 });
    expect(s.result!.breakdown.realProtected).toBe(3);
  });

  it('T-64 5 真 + 双首领都猜中 + 好人只有 2 人猜中 → 5 分 → EVIL 胜', () => {
    let s = playThreeRounds(makeGame({ realBeasts: [0, 1, 2, 3, 4, 11] })); // 保护 5 真
    s = submitGuesses(s, {
      lcf: P.XU, // 猜中 → +0
      ybr: P.FANG, // 猜中 → +0
      good: { p0: P.LCF, p1: P.LCF, p2: P.YBR, p3: P.YBR, p4: P.YBR }, // 2/5,2*2=4 < 5 → +0
    });
    expect(s.result).toMatchObject({ winner: 'EVIL', score: 5 });
    expect(s.result!.breakdown.realProtected).toBe(5);
  });

  it('T-65 8 人局 5 好人:3 人猜中加分,2 人猜中不加分', () => {
    const base = { realBeasts: [0, 1, 2, 3, 10, 11] as (0 | 1 | 2 | 3 | 10 | 11)[] };

    let s3 = playThreeRounds(makeGame(base));
    s3 = submitGuesses(s3, {
      lcf: P.XU,
      ybr: P.FANG,
      good: { p0: P.LCF, p1: P.LCF, p2: P.LCF, p3: P.YBR, p4: P.YBR },
    });
    expect(s3.result!.breakdown.laoChaoFengFoundBonus).toBe(1);

    let s2 = playThreeRounds(makeGame(base));
    s2 = submitGuesses(s2, {
      lcf: P.XU,
      ybr: P.FANG,
      good: { p0: P.LCF, p1: P.LCF, p2: P.YBR, p3: P.YBR, p4: P.YBR },
    });
    expect(s2.result!.breakdown.laoChaoFengFoundBonus).toBe(0);
  });

  it('T-66 6 人局 4 好人:2 人猜中即过半 → 加分', () => {
    const roles6: Role[] = [
      'XU_YUAN',
      'FANG_ZHEN',
      'MU_HU_JIA_NAI',
      'HUANG_YAN_YAN',
      'LAO_CHAO_FENG',
      'YAO_BU_RAN',
    ];
    // 6 人局:p4 = 老朝奉,p5 = 药不然
    let s = playThreeRounds(makeGame({ roles: roles6, realBeasts: [0, 1, 2, 3, 10, 11] }));
    expect(s.phase).toBe('IDENTITY');
    s = submitGuesses(s, {
      lcf: P.XU,
      ybr: P.FANG,
      good: { p0: 'p4', p1: 'p4', p2: 'p5', p3: 'p5' }, // 2/4 猜中,2*2=4 >= 4
    });
    expect(s.result!.breakdown.laoChaoFengFoundBonus).toBe(1);
  });

  it('郑国渠不参与指认;身份揭示超时按没猜中处理', () => {
    let s = playThreeRounds(makeGame({ realBeasts: [0, 1, 2, 3, 10, 11] }));
    expectEngineError(
      () => step(s, { type: 'IDENTITY_GUESS', playerId: P.ZGQ, targetPlayerId: P.XU }),
      'BAD_ROLE',
    );
    // 无人指认直接超时:老朝奉没猜中(+2)、药不然没猜中(+1)、好人 0 猜中(+0)
    s = step(s, { type: 'IDENTITY_FINALIZE' });
    expect(s.result).toMatchObject({
      score: 7, // 4 + 2 + 1
      winner: 'GOOD',
      breakdown: { xuYuanSurvivedBonus: 2, fangZhenSurvivedBonus: 1, laoChaoFengFoundBonus: 0 },
    });
  });
});
