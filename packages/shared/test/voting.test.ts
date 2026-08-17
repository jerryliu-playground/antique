/** SPEC 第 9 节:押币与开票(T-50 ~ T-57) */
import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/index';
import {
  P,
  expectEngineError,
  finishActionPhase,
  makeGame,
  playRound,
  playerOf,
  runSpeechPhase,
  runVotingPhase,
  step,
} from './fixtures';

/** 走到第 round0 的押币阶段 */
function toVoting(state: GameState = makeGame()): GameState {
  return runSpeechPhase(finishActionPhase(state));
}

describe('押币与开票', () => {
  it('T-50 第 1 轮最多投 2 枚;投 3 枚 → 抛错', () => {
    const s = toVoting();
    expectEngineError(
      () => step(s, { type: 'VOTE_SUBMIT', playerId: P.XU, distribution: { 0: 3 } }),
      'CHIPS_EXCEEDED',
    );
    const ok = step(s, { type: 'VOTE_SUBMIT', playerId: P.XU, distribution: { 0: 1, 6: 1 } });
    expect(ok.rounds[0].votes[P.XU]).toEqual({ 0: 1, 6: 1 });
  });

  it('T-51 第 1 轮投 0 枚 → 第 2 轮最多可投 4 枚', () => {
    let s = playRound(makeGame()); // 第 1 轮全员 0 票
    s = toVoting(s); // 第 2 轮走到押币
    expectEngineError(
      () => step(s, { type: 'VOTE_SUBMIT', playerId: P.XU, distribution: { 2: 5 } }),
      'CHIPS_EXCEEDED',
    );
    const ok = step(s, { type: 'VOTE_SUBMIT', playerId: P.XU, distribution: { 2: 4 } });
    expect(ok.rounds[1].votes[P.XU]).toEqual({ 2: 4 });
  });

  it('T-52 第 1 轮投 2 枚 → 第 2 轮最多可投 2 枚', () => {
    let s = playRound(makeGame(), { [P.XU]: { 0: 2 } });
    expect(playerOf(s, P.XU).chips).toBe(4);
    s = toVoting(s);
    expectEngineError(
      () => step(s, { type: 'VOTE_SUBMIT', playerId: P.XU, distribution: { 2: 3 } }),
      'CHIPS_EXCEEDED',
    );
    const ok = step(s, { type: 'VOTE_SUBMIT', playerId: P.XU, distribution: { 2: 2 } });
    expect(ok.rounds[1].votes[P.XU]).toEqual({ 2: 2 });
  });

  it('T-53 三轮总花费不超过 6', () => {
    let s = playRound(makeGame(), { [P.XU]: { 0: 2 } });
    s = playRound(s, { [P.XU]: { 2: 2 } });
    s = toVoting(s); // 第 3 轮:只剩 6 - 4 = 2 枚可投
    expectEngineError(
      () => step(s, { type: 'VOTE_SUBMIT', playerId: P.XU, distribution: { 4: 3 } }),
      'CHIPS_EXCEEDED',
    );
    s = runVotingPhase(s, { [P.XU]: { 4: 2 } });
    expect(playerOf(s, P.XU).chips).toBe(0);
  });

  it('T-54 平票时生肖序号小的排前(同票 → 序号小者为 top1)', () => {
    let s = toVoting();
    s = runVotingPhase(s, { [P.XU]: { 0: 1 }, [P.FANG]: { 6: 1 } }); // 0 与 6 各 1 票
    expect(s.rounds[0].protectedTop1).toBe(0); // 鼠(0)排在马(6)前
    expect(s.rounds[0].protectedTop2).toBe(6);
  });

  it('T-55 全员 0 票 → 仍按生肖序保护前 2 件', () => {
    let s = toVoting();
    s = runVotingPhase(s); // 全 0 票;本轮池 [0,1,6,7]
    expect(s.rounds[0].protectedTop1).toBe(0);
    expect(s.rounds[0].protectedTop2).toBe(1);
    expect(s.beasts[0].protectedRound).toBe(0);
    expect(s.beasts[1].protectedRound).toBe(0);
  });

  it('T-56 top2 真伪立即公开,top1 保持隐藏', () => {
    let s = toVoting();
    s = runVotingPhase(s, { [P.XU]: { 7: 2 } }); // top1=7,top2=0(0 票中生肖序最小)
    expect(s.rounds[0].protectedTop1).toBe(7);
    expect(s.rounds[0].protectedTop2).toBe(0);
    expect(s.beasts[7].publiclyRevealed).toBe(false); // 第 1 名隐藏到游戏结束
    expect(s.beasts[0].publiclyRevealed).toBe(true); // 第 2 名立即公开
  });

  it('T-57 投票给不在本轮 exposedBeasts 里的兽首 → 抛错', () => {
    const s = toVoting();
    expectEngineError(
      () => step(s, { type: 'VOTE_SUBMIT', playerId: P.XU, distribution: { 2: 1 } }),
      'BAD_BEAST',
    );
  });

  it('重复提交 → 抛错;非法票数 → 抛错', () => {
    let s = toVoting();
    s = step(s, { type: 'VOTE_SUBMIT', playerId: P.XU, distribution: {} });
    expectEngineError(
      () => step(s, { type: 'VOTE_SUBMIT', playerId: P.XU, distribution: {} }),
      'ALREADY_SUBMITTED',
    );
    expectEngineError(
      () => step(s, { type: 'VOTE_SUBMIT', playerId: P.FANG, distribution: { 0: -1 } }),
      'BAD_DISTRIBUTION',
    );
    expectEngineError(
      () => step(s, { type: 'VOTE_SUBMIT', playerId: P.FANG, distribution: { 0: 1.5 } }),
      'BAD_DISTRIBUTION',
    );
  });

  it('押币超时(VOTE_FINALIZE):未提交者视为投 0 票,筹码保留', () => {
    let s = toVoting();
    s = step(s, { type: 'VOTE_SUBMIT', playerId: P.XU, distribution: { 6: 2 } });
    s = step(s, { type: 'VOTE_FINALIZE' });

    expect(s.phase).toBe('REVEAL');
    expect(playerOf(s, P.XU).chips).toBe(4);
    for (const pid of [P.FANG, P.JI, P.MU, P.HUANG, P.LCF, P.YBR, P.ZGQ]) {
      expect(playerOf(s, pid).chips).toBe(6); // 未投的分文未花,累积到下轮
    }
    expect(s.rounds[0].protectedTop1).toBe(6); // 2 票
    expect(s.rounds[0].protectedTop2).toBe(0); // 0 票中生肖序最小
  });
});
