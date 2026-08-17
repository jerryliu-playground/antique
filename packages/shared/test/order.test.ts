/** SPEC 第 9 节:行动顺序(T-40 ~ T-45) */
import { describe, expect, it } from 'vitest';
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

describe('行动顺序', () => {
  it('T-40 派票给已行动的玩家 → 抛错', () => {
    let s = makeGame({ actedSeats: [3, 0] }); // p3 已行动,许愿当前
    s = step(s, { type: 'APPRAISE', playerId: P.XU, beastIds: [0, 6] });
    s = step(s, { type: 'SKILL', playerId: P.XU, use: false });
    expectEngineError(
      () => step(s, { type: 'PASS_TURN', playerId: P.XU, targetPlayerId: P.MU }),
      'ALREADY_ACTED',
    );
  });

  it('T-41 派票给自己 → 抛错', () => {
    let s = makeGame({ actedSeats: [3, 0] });
    s = step(s, { type: 'APPRAISE', playerId: P.XU, beastIds: [0, 6] });
    s = step(s, { type: 'SKILL', playerId: P.XU, use: false });
    expectEngineError(
      () => step(s, { type: 'PASS_TURN', playerId: P.XU, targetPlayerId: P.XU }),
      'BAD_TARGET',
    );
  });

  it('T-42 最后一名玩家行动完 → phase 变为 SPEECH,actionOrder 长度 = 人数', () => {
    let s = makeGame();
    s = finishActionPhase(s);
    expect(s.phase).toBe('SPEECH');
    expect(s.rounds[0].actionOrder).toHaveLength(8);
    expect(new Set(s.rounds[0].actionOrder).size).toBe(8);
    expect(s.rounds[0].currentActorId).toBeNull();
  });

  it('T-43 尾家成为下一轮 startPlayerId', () => {
    let s = makeGame();
    s = playRound(s);
    const tail = s.rounds[0].actionOrder[7];
    expect(s.currentRound).toBe(1);
    expect(s.rounds[1].startPlayerId).toBe(tail);
    expect(s.rounds[1].actionOrder).toEqual([tail]);
    expect(s.rounds[1].currentActorId).toBe(tail);
  });

  it('T-44 发言顺序从尾家座位 +1 开始,循环 n 人', () => {
    let s = makeGame();
    s = finishActionPhase(s);

    const tailSeat = playerOf(s, s.rounds[0].actionOrder[7]).seat;
    const expected = Array.from({ length: 8 }, (_, k) => {
      const seat = (tailSeat + 1 + k) % 8;
      return s.players.find((p) => p.seat === seat)!.id;
    });
    expect(s.rounds[0].speechOrder).toEqual(expected);
    expect(s.rounds[0].currentSpeakerId).toBe(expected[0]);
  });

  it('T-45 非当前行动者提交 action → 抛错;步骤错乱也抛错', () => {
    const s = makeGame({ actedSeats: [0] }); // 许愿当前
    expectEngineError(
      () => step(s, { type: 'APPRAISE', playerId: P.FANG, beastIds: [] }),
      'NOT_YOUR_TURN',
    );
    // 当前步骤是鉴定,直接发技能 → 步骤错误
    expectEngineError(() => step(s, { type: 'SKILL', playerId: P.XU, use: false }), 'BAD_STEP');
    // 发言阶段:非当前发言者结束发言 → 抛错
    const s2 = finishActionPhase(makeGame());
    const notSpeaker = s2.players.find((p) => p.id !== s2.rounds[0].currentSpeakerId)!.id;
    expectEngineError(() => step(s2, { type: 'SPEECH_END', playerId: notSpeaker }), 'NOT_YOUR_TURN');
  });

  it('SET_CONNECTED 在任意阶段可用,状态反映到所有人的视图', () => {
    let s = makeGame();
    s = step(s, { type: 'SET_CONNECTED', playerId: P.XU, connected: false });
    expect(playerOf(s, P.XU).connected).toBe(false);
    s = step(s, { type: 'SET_CONNECTED', playerId: P.XU, connected: true });
    expect(playerOf(s, P.XU).connected).toBe(true);
  });

  it('发言全部结束后进入押币;全员提交后自动开票', () => {
    let s = makeGame();
    s = finishActionPhase(s);
    s = runSpeechPhase(s);
    expect(s.phase).toBe('VOTING');
    s = runVotingPhase(s);
    expect(s.phase).toBe('REVEAL');
  });
});
