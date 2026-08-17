/**
 * SPEC 第 9 节:信息安全(T-70 ~ T-77,重点)
 * 泄密走查器见 src/testing/leakcheck.ts,这里构造一个"秘密最多"的中局状态逐条验证。
 */
import { describe, expect, it } from 'vitest';
import { toPersonalView } from '../src/index';
import type { GameState } from '../src/index';
import { assertNoLeaks } from '../src/testing/index';
import {
  P,
  finishActionPhase,
  makeGame,
  runSpeechPhase,
  runVotingPhase,
  step,
  takeTurn,
} from './fixtures';

/**
 * 富秘密中局:老朝奉已翻转、药不然已偷袭、方震已查验、郑国渠已覆盖、
 * 多人有鉴定记录 —— 行动阶段刚结束(SPEECH)。
 */
function richState(): GameState {
  let s = makeGame({ actedSeats: [5] }); // 老朝奉起始
  s = takeTurn(s, P.LCF, { skill: {}, passTo: P.YBR }); // 翻转 @0
  s = takeTurn(s, P.YBR, { skill: { targetPlayerId: P.MU }, passTo: P.FANG }); // 偷袭木户
  s = takeTurn(s, P.FANG, { skill: { targetPlayerId: P.ZGQ }, passTo: P.ZGQ }); // 查验郑国渠
  s = takeTurn(s, P.ZGQ, { skill: { targetBeastId: 6 }, passTo: P.XU }); // 覆盖 6
  s = takeTurn(s, P.XU, { passTo: P.JI });
  s = takeTurn(s, P.JI, { passTo: P.MU });
  s = takeTurn(s, P.MU, { passTo: P.HUANG });
  s = takeTurn(s, P.HUANG, {}); // 尾家 → SPEECH
  return s;
}

const ALL_PIDS = [P.XU, P.FANG, P.JI, P.MU, P.HUANG, P.LCF, P.YBR, P.ZGQ];

describe('信息安全', () => {
  it('T-70 任意玩家的 PersonalView 不含其他玩家的 role 字段(走查器全员通过)', () => {
    const s = richState();
    for (const pid of ALL_PIDS) {
      const v = toPersonalView(s, pid);
      assertNoLeaks(s, v, pid); // isReal/role/camp 白名单路径 + 禁用字段黑名单
      for (const p of v.players) {
        expect(Object.keys(p).sort()).toEqual(
          ['id', 'name', 'seat', 'connected', 'hasActed', 'chipsRemaining'].sort(),
        );
      }
    }
  });

  it('T-71 PersonalView 不含未公开兽首的 isReal', () => {
    const s = richState(); // 尚未开票,一件都没公开
    for (const pid of ALL_PIDS) {
      const v = toPersonalView(s, pid);
      expect(v.publicBeasts).toEqual([]);
      expect(JSON.stringify(v)).not.toContain('isReal');
    }
  });

  it('T-72 好人的 knownTeammates 为空', () => {
    const s = richState();
    for (const pid of [P.XU, P.FANG, P.JI, P.MU, P.HUANG]) {
      expect(toPersonalView(s, pid).me.knownTeammates).toEqual([]);
    }
  });

  it('T-73 老朝奉的 knownTeammates 只含药不然(不含郑国渠)', () => {
    const v = toPersonalView(richState(), P.LCF);
    expect(v.me.knownTeammates).toEqual([{ id: P.YBR, role: 'YAO_BU_RAN' }]);
  });

  it('T-74 药不然的 knownTeammates 只含老朝奉', () => {
    const v = toPersonalView(richState(), P.YBR);
    expect(v.me.knownTeammates).toEqual([{ id: P.LCF, role: 'LAO_CHAO_FENG' }]);
  });

  it('T-75 PersonalView 不含其他玩家的鉴定历史', () => {
    const s = richState();
    for (const pid of ALL_PIDS) {
      const v = toPersonalView(s, pid);
      const own = s.appraisalLog.filter((e) => e.playerId === pid);
      expect(v.me.myAppraisals).toHaveLength(own.length);
      // 方震以外看不到查验记录
      if (pid !== P.FANG) expect(v.me.myInvestigations).toEqual([]);
    }
    // 方震能看到自己的查验
    expect(toPersonalView(s, P.FANG).me.myInvestigations).toEqual([
      { round: 0, targetId: P.ZGQ, camp: 'EVIL' },
    ]);
  });

  it('T-76 VOTING 阶段的 PersonalView 不含任何人的票数分配', () => {
    let s = runSpeechPhase(richState());
    expect(s.phase).toBe('VOTING');
    s = step(s, { type: 'VOTE_SUBMIT', playerId: P.XU, distribution: { 0: 2 } });
    s = step(s, { type: 'VOTE_SUBMIT', playerId: P.LCF, distribution: { 7: 1 } });

    for (const pid of ALL_PIDS) {
      const v = toPersonalView(s, pid);
      assertNoLeaks(s, v, pid);
      const json = JSON.stringify(v);
      expect(json).not.toContain('votes');
      expect(json).not.toContain('distribution');
      expect(v.round.tally).toBeNull();
      // 暗投期间筹码还没扣,chipsRemaining 不能泄露谁投了多少
      expect(v.players.find((p) => p.id === P.XU)!.chipsRemaining).toBe(6);
    }
  });

  it('T-77 REVEAL 之后 tally 才出现', () => {
    let s = runSpeechPhase(richState());
    s = runVotingPhase(s, { [P.XU]: { 0: 2 } });
    expect(s.phase).toBe('REVEAL');

    for (const pid of ALL_PIDS) {
      const v = toPersonalView(s, pid);
      assertNoLeaks(s, v, pid);
      expect(v.round.tally).not.toBeNull();
      expect(v.round.tally![0]).toEqual({ beastId: 0, count: 2 });
      // 第 2 名(0 票中生肖序最小的 1)公开,第 1 名(0)隐藏
      expect(v.publicBeasts.map((b) => b.id)).toEqual([1]);
      expect(v.protectedUnknown).toEqual([0]);
    }
  });

  it('mySkillHistory 只含自己的技能记录(重连恢复用,拍板 3)', () => {
    const s = richState();
    expect(toPersonalView(s, P.LCF).me.mySkillHistory).toEqual([{ round: 0, skill: 'FLIP' }]);
    expect(toPersonalView(s, P.YBR).me.mySkillHistory).toEqual([
      { round: 0, skill: 'SNIPE', targetPlayerId: P.MU },
    ]);
    expect(toPersonalView(s, P.ZGQ).me.mySkillHistory).toEqual([
      { round: 0, skill: 'COVER', targetBeastId: 6 },
    ]);
    expect(toPersonalView(s, P.FANG).me.mySkillHistory).toEqual([
      { round: 0, skill: 'INVESTIGATE', targetPlayerId: P.ZGQ },
    ]);
    expect(toPersonalView(s, P.XU).me.mySkillHistory).toEqual([]);
  });

  it('中局任意时点、任意视角整树走查(行动中 / 发言中)', () => {
    let s = makeGame({ actedSeats: [5] });
    s = takeTurn(s, P.LCF, { skill: {}, passTo: P.YBR });
    for (const pid of ALL_PIDS) assertNoLeaks(s, toPersonalView(s, pid), pid);
    s = finishActionPhase(s);
    for (const pid of ALL_PIDS) assertNoLeaks(s, toPersonalView(s, pid), pid);
  });
});
