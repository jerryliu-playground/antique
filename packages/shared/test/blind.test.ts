/** SPEC 第 9 节:轮空与方震(T-30 ~ T-34) */
import { describe, expect, it } from 'vitest';
import { reduce, resolveAppraisal } from '../src/index';
import {
  P,
  expectEngineError,
  finishActionPhase,
  makeGame,
  playRound,
  playerOf,
  step,
  takeTurn,
} from './fixtures';

describe('轮空与方震', () => {
  it('T-30 木户加奈 blindRound=1:第 1 轮(index 1)BLOCKED,第 0、2 轮正常', () => {
    let s = makeGame({ blind: { [P.MU]: 1 } });
    s = playRound(s); // 第 0 轮(默认全员行动)
    s = playRound(s); // 第 1 轮
    s = finishActionPhase(s); // 第 2 轮行动完

    const logs = s.appraisalLog.filter((e) => e.playerId === P.MU);
    expect(logs).toHaveLength(3);
    expect(logs.find((e) => e.round === 0)!.shown).not.toBe('BLOCKED');
    expect(logs.find((e) => e.round === 1)!.shown).toBe('BLOCKED');
    expect(logs.find((e) => e.round === 2)!.shown).not.toBe('BLOCKED');
  });

  it('T-31 方震任何时候鉴定都返回 BLOCKED(且引擎要求他鉴定 0 件)', () => {
    const s = makeGame({ actedSeats: [1] }); // 方震起始
    // 引擎层:方震提交非空鉴定列表直接报错
    expectEngineError(
      () => step(s, { type: 'APPRAISE', playerId: P.FANG, beastIds: [0] }),
      'BAD_COUNT',
    );
    // 规则层:即使调用解析函数也恒为 BLOCKED
    expect(resolveAppraisal(s, playerOf(s, P.FANG), 0, 0)).toBe('BLOCKED');
  });

  it('T-32 方震查验玩家 → 返回正确 camp,并只私发给方震', () => {
    let s = makeGame({ actedSeats: [1] });
    s = step(s, { type: 'APPRAISE', playerId: P.FANG, beastIds: [] });
    const r = reduce(s, { type: 'SKILL', playerId: P.FANG, use: true, targetPlayerId: P.HUANG });

    expect(r.state.investigations).toEqual([{ round: 0, targetId: P.HUANG, camp: 'GOOD' }]);
    const ev = r.events.find((e) => e.kind === 'PRIVATE_INVESTIGATION');
    expect(ev).toMatchObject({ toPlayerId: P.FANG, targetId: P.HUANG, camp: 'GOOD' });
  });

  it('T-33 方震被偷袭 → 该回合无法查验', () => {
    let s = makeGame({ actedSeats: [6] });
    s = takeTurn(s, P.YBR, { skill: { targetPlayerId: P.FANG }, passTo: P.FANG });
    s = step(s, { type: 'APPRAISE', playerId: P.FANG, beastIds: [] });
    expectEngineError(
      () =>
        step(s, { type: 'SKILL', playerId: P.FANG, use: true, targetPlayerId: P.LCF }),
      'SKILL_BLOCKED',
    );
  });

  it('方震不能查验自己(拍板 2026-08-12,防误操作)', () => {
    let s = makeGame({ actedSeats: [1] });
    s = step(s, { type: 'APPRAISE', playerId: P.FANG, beastIds: [] });
    expectEngineError(
      () => step(s, { type: 'SKILL', playerId: P.FANG, use: true, targetPlayerId: P.FANG }),
      'BAD_TARGET',
    );
  });

  it('T-34 方震查验老朝奉 → EVIL;查验郑国渠 → EVIL', () => {
    let s1 = makeGame({ actedSeats: [1] });
    s1 = step(s1, { type: 'APPRAISE', playerId: P.FANG, beastIds: [] });
    s1 = step(s1, { type: 'SKILL', playerId: P.FANG, use: true, targetPlayerId: P.LCF });
    expect(s1.investigations[0].camp).toBe('EVIL');

    let s2 = makeGame({ actedSeats: [1] });
    s2 = step(s2, { type: 'APPRAISE', playerId: P.FANG, beastIds: [] });
    s2 = step(s2, { type: 'SKILL', playerId: P.FANG, use: true, targetPlayerId: P.ZGQ });
    expect(s2.investigations[0].camp).toBe('EVIL');
  });
});
