/** SPEC 第 9 节:药不然偷袭(T-10 ~ T-16) */
import { describe, expect, it } from 'vitest';
import { reduce, toPersonalView } from '../src/index';
import {
  P,
  expectEngineError,
  finishActionPhase,
  logOf,
  makeGame,
  playRound,
  playerOf,
  step,
  takeTurn,
} from './fixtures';

function logIn(state: ReturnType<typeof makeGame>, pid: string, round: number) {
  const e = state.appraisalLog.find((x) => x.playerId === pid && x.round === round);
  if (!e) throw new Error(`找不到 ${pid} 第 ${round} 轮的鉴定记录`);
  return e;
}

describe('药不然偷袭', () => {
  it('T-10 偷袭本轮未行动的玩家 → 该玩家本轮回合鉴定得 BLOCKED,且技能被禁', () => {
    let s = makeGame({ actedSeats: [6] }); // 药不然起始
    s = takeTurn(s, P.YBR, { skill: { targetPlayerId: P.LCF }, passTo: P.LCF });

    // 老朝奉回合开始时消耗标记
    expect(playerOf(s, P.LCF).sniped).toBe(false);
    expect(playerOf(s, P.LCF).snipedConsumedThisTurn).toBe(true);

    s = step(s, { type: 'APPRAISE', playerId: P.LCF, beastIds: [0] });
    expect(logOf(s, P.LCF, 0, 0).shown).toBe('BLOCKED');
    expect(logOf(s, P.LCF, 0, 0).truth).toBeNull();

    // 技能被禁(R-6:老朝奉被偷袭后不能发动翻转)
    expectEngineError(
      () => step(s, { type: 'SKILL', playerId: P.LCF, use: true }),
      'SKILL_BLOCKED',
    );
    // 跳过技能是允许的
    const s2 = step(s, { type: 'SKILL', playerId: P.LCF, use: false });
    expect(s2.rounds[0].laoChaoFengFlipAt).toBeNull();
  });

  it('T-11 偷袭本轮已行动的玩家 → 本轮无影响,下一轮该玩家回合 BLOCKED', () => {
    let s = makeGame({ actedSeats: [3] }); // 木户加奈起始
    s = takeTurn(s, P.MU, { appraise: [0], passTo: P.YBR });
    expect(logOf(s, P.MU, 0, 0).shown).toBe('REAL'); // 先正常鉴定

    s = takeTurn(s, P.YBR, { skill: { targetPlayerId: P.MU }, passTo: P.XU });
    expect(playerOf(s, P.MU).sniped).toBe(true); // 挂着待消耗标记
    expect(logOf(s, P.MU, 0, 0).shown).toBe('REAL'); // 本轮记录不受影响

    s = playRound(s); // 走完第 1 轮 → 第 2 轮
    s = finishActionPhase(s); // 第 2 轮所有人行动(含木户)
    expect(logIn(s, P.MU, 1).shown).toBe('BLOCKED');
  });

  it('T-12 偷袭方震 → 方震和许愿都被标记;各自轮到自己时才收到通知(拍板)', () => {
    let s = makeGame({ actedSeats: [6] });
    s = step(s, { type: 'APPRAISE', playerId: P.YBR, beastIds: [0] });
    const r1 = reduce(s, { type: 'SKILL', playerId: P.YBR, use: true, targetPlayerId: P.FANG });

    // 双双被标记,但偷袭瞬间完全静默:不发私密事件,受害者视图也看不出任何变化
    expect(playerOf(r1.state, P.FANG).sniped).toBe(true);
    expect(playerOf(r1.state, P.XU).sniped).toBe(true);
    expect(r1.events.filter((e) => e.kind === 'PRIVATE_SNIPED')).toEqual([]);
    expect(toPersonalView(r1.state, P.FANG).me.sniped).toBe(false);
    expect(toPersonalView(r1.state, P.XU).me.sniped).toBe(false);

    // 派票给方震:此刻他才收到"你被药不然偷袭了!"
    const r2 = reduce(r1.state, { type: 'PASS_TURN', playerId: P.YBR, targetPlayerId: P.FANG });
    expect(r2.events.filter((e) => e.kind === 'PRIVATE_SNIPED')).toEqual([
      { kind: 'PRIVATE_SNIPED', toPlayerId: P.FANG },
    ]);
    expect(toPersonalView(r2.state, P.FANG).me.sniped).toBe(true);
    expect(toPersonalView(r2.state, P.XU).me.sniped).toBe(false); // 许愿还蒙在鼓里

    // 方震走完回合派给许愿:许愿此刻才收到通知
    let s2 = step(r2.state, { type: 'APPRAISE', playerId: P.FANG, beastIds: [] });
    s2 = step(s2, { type: 'SKILL', playerId: P.FANG, use: false });
    const r3 = reduce(s2, { type: 'PASS_TURN', playerId: P.FANG, targetPlayerId: P.XU });
    expect(r3.events.filter((e) => e.kind === 'PRIVATE_SNIPED')).toEqual([
      { kind: 'PRIVATE_SNIPED', toPlayerId: P.XU },
    ]);
    expect(toPersonalView(r3.state, P.XU).me.sniped).toBe(true);
  });

  it('T-13 偷袭姬云浮 → 永久失能,第 2、3 轮均 BLOCKED', () => {
    let s = makeGame({ actedSeats: [6] });
    s = takeTurn(s, P.YBR, { skill: { targetPlayerId: P.JI }, passTo: P.JI });
    expect(playerOf(s, P.JI).permanentlyBlinded).toBe(true);

    s = takeTurn(s, P.JI, {}); // 第 1 轮他的回合
    expect(logIn(s, P.JI, 0).shown).toBe('BLOCKED');

    s = playRound(s); // → 第 2 轮
    s = finishActionPhase(s);
    expect(logIn(s, P.JI, 1).shown).toBe('BLOCKED');

    s = playRound(s); // → 第 3 轮
    s = finishActionPhase(s);
    expect(logIn(s, P.JI, 2).shown).toBe('BLOCKED');
  });

  it('T-14 偷袭许愿 → 许愿本轮两件都 BLOCKED', () => {
    let s = makeGame({ actedSeats: [6] });
    s = takeTurn(s, P.YBR, { skill: { targetPlayerId: P.XU }, passTo: P.XU });
    s = step(s, { type: 'APPRAISE', playerId: P.XU, beastIds: [0, 6] });
    expect(logOf(s, P.XU, 0, 0).shown).toBe('BLOCKED');
    expect(logOf(s, P.XU, 0, 6).shown).toBe('BLOCKED');
  });

  it('T-15 偷袭标记消耗后不残留:被偷袭者下下轮恢复正常', () => {
    let s = makeGame({ actedSeats: [3] });
    s = takeTurn(s, P.MU, { appraise: [0], passTo: P.YBR });
    s = takeTurn(s, P.YBR, { skill: { targetPlayerId: P.MU }, passTo: P.XU }); // 偷已行动的木户

    s = playRound(s); // → 第 2 轮
    s = finishActionPhase(s); // 木户第 2 轮 BLOCKED(消耗标记)
    expect(logIn(s, P.MU, 1).shown).toBe('BLOCKED');
    expect(playerOf(s, P.MU).sniped).toBe(false);
    expect(playerOf(s, P.MU).snipedConsumedThisTurn).toBe(false);

    s = playRound(s); // → 第 3 轮
    s = finishActionPhase(s);
    expect(logIn(s, P.MU, 2).shown).not.toBe('BLOCKED'); // 恢复正常
  });

  it('T-16 药不然偷袭自己 → 合法,自己下回合被禁(R-3)', () => {
    let s = makeGame({ actedSeats: [6] });
    s = takeTurn(s, P.YBR, { skill: { targetPlayerId: P.YBR }, passTo: P.XU });
    expect(playerOf(s, P.YBR).sniped).toBe(true);

    s = playRound(s); // → 第 2 轮
    s = finishActionPhase(s);
    expect(logIn(s, P.YBR, 1).shown).toBe('BLOCKED');
  });
});
