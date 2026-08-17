/**
 * 阶段流转的内部实现:开轮、回合开始、行动阶段结束、押币结算、终局结算。
 * 这些函数直接改传入的 state(可能是 immer draft,也可能是 initGame 里的新对象),
 * 只允许被 init.ts / reduce.ts 调用。
 */
import type { GameEvent, GameState, Player } from '../types';
import { invariant } from './errors';
import { currentRound, findRole, getBeast, getPlayer } from './helpers';

/** SPEC 3.4 onPlayerTurnStart:sniped 标记在被偷袭者下一次回合开始时消耗 */
export function beginTurn(state: GameState, player: Player, events: GameEvent[]): void {
  if (player.sniped) {
    player.sniped = false;
    player.snipedConsumedThisTurn = true;
    // RULE-DECISION(拍板 2026-08-12):被偷袭者轮到自己行动时才得知被偷袭
    // (立刻通知会暴露"当前行动者是药不然"),私密事件与姬云浮的永久失能都在此刻落地。
    events.push({ kind: 'PRIVATE_SNIPED', toPlayerId: player.id });
    if (player.role === 'JI_YUN_FU') {
      player.permanentlyBlinded = true;
    }
  }
  const round = currentRound(state);
  events.push({
    kind: 'PUBLIC',
    event: { t: 'TURN_START', playerId: player.id, index: round.actionOrder.length - 1 },
  });
}

export function startRound(
  state: GameState,
  roundIndex: number,
  startPlayerId: string,
  events: GameEvent[],
): void {
  const pool = state.roundPools[roundIndex];
  invariant(pool && pool.length === 4, `第 ${roundIndex} 轮的兽首池不存在`);

  for (const id of pool) getBeast(state, id).exposedRound = roundIndex;

  state.rounds.push({
    index: roundIndex,
    exposedBeasts: pool.slice(),
    startPlayerId,
    actionOrder: [startPlayerId],
    currentActorId: startPlayerId,
    turnStep: 'APPRAISE',
    laoChaoFengFlipAt: null,
    covered: null,
    currentSpeakerId: null,
    speechOrder: [],
    votes: {},
    tally: null,
    protectedTop1: null,
    protectedTop2: null,
  });
  state.currentRound = roundIndex;
  state.phase = 'ACTION';

  events.push({
    kind: 'PUBLIC',
    event: { t: 'ROUND_START', round: roundIndex, exposedBeasts: pool.slice(), startPlayerId },
  });
  beginTurn(state, getPlayer(state, startPlayerId), events);
}

/**
 * 尾家行动完毕 → 发言阶段。
 * 发言顺序:从尾家座位的下一位开始,按 seat 循环一圈,共 n 人(尾家最后一个说)。
 */
export function endActionPhase(state: GameState, events: GameEvent[]): void {
  const round = currentRound(state);
  const tail = getPlayer(state, round.actionOrder[round.actionOrder.length - 1]);
  const n = state.players.length;

  const bySeat = new Map(state.players.map((p) => [p.seat, p.id]));
  const speechOrder: string[] = [];
  for (let k = 1; k <= n; k++) {
    const id = bySeat.get((tail.seat + k) % n);
    invariant(id, `座位 ${(tail.seat + k) % n} 没有玩家`);
    speechOrder.push(id);
  }

  round.currentActorId = null;
  round.turnStep = null;
  round.speechOrder = speechOrder;
  round.currentSpeakerId = speechOrder[0];
  state.phase = 'SPEECH';
  events.push({ kind: 'PUBLIC', event: { t: 'SPEECH_START', playerId: speechOrder[0] } });
}

/**
 * 开票结算(SPEC 3.5)。未提交者视为投 0 票。
 * 排序:(票数降序, 生肖序号升序);只公开第 2 名的真伪,第 1 名隐藏到游戏结束。
 */
export function settleVotes(state: GameState, events: GameEvent[]): void {
  const round = currentRound(state);

  // 扣筹码(未用完的自动累积到下轮——chips 本来就是整局剩余总数)
  for (const player of state.players) {
    const dist = round.votes[player.id];
    if (!dist) continue;
    const spent = Object.values(dist).reduce((a: number, b) => a + (b ?? 0), 0);
    player.chips -= spent;
    invariant(player.chips >= 0, `玩家 ${player.id} 筹码为负`);
  }

  const counts = new Map<number, number>(round.exposedBeasts.map((b) => [b, 0]));
  for (const dist of Object.values(round.votes)) {
    for (const [key, value] of Object.entries(dist)) {
      const id = Number(key);
      counts.set(id, (counts.get(id) ?? 0) + (value ?? 0));
    }
  }

  const tally = round.exposedBeasts
    .map((beastId) => ({ beastId, count: counts.get(beastId) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.beastId - b.beastId);

  round.tally = tally;
  const top1 = tally[0].beastId;
  const top2 = tally[1].beastId;
  round.protectedTop1 = top1;
  round.protectedTop2 = top2;

  const b1 = getBeast(state, top1);
  const b2 = getBeast(state, top2);
  b1.protectedRound = round.index;
  b2.protectedRound = round.index;
  b2.publiclyRevealed = true; // 只公开第 2 名的真伪

  state.phase = 'REVEAL';
  events.push({
    kind: 'PUBLIC',
    event: {
      t: 'TALLY',
      entries: tally.map((t) => ({ ...t })),
      top1,
      top2,
      top2IsReal: b2.isReal,
    },
  });
}

/**
 * 终局结算(SPEC 3.6)。
 * instantWin = 6 件保护全为真品,跳过身份揭示,直接 GOOD 获胜。
 * 非即时胜利时,未指认的按"没猜中"处理(SPEC 5.2)。
 */
export function finalizeGame(state: GameState, _events: GameEvent[], instantWin = false): void {
  const protectedBeasts = state.beasts.filter((b) => b.protectedRound !== null);
  invariant(protectedBeasts.length === 6, `终局时保护数应为 6,实际 ${protectedBeasts.length}`);
  const realProtected = protectedBeasts.filter((b) => b.isReal).length;

  const breakdown = {
    realProtected,
    xuYuanSurvivedBonus: 0 as 0 | 2,
    fangZhenSurvivedBonus: 0 as 0 | 1,
    laoChaoFengFoundBonus: 0 as 0 | 1,
  };
  let score = realProtected;

  if (!instantWin) {
    const xuYuan = findRole(state, 'XU_YUAN');
    const fangZhen = findRole(state, 'FANG_ZHEN');
    const laoChaoFeng = findRole(state, 'LAO_CHAO_FENG');
    invariant(xuYuan && fangZhen && laoChaoFeng, '缺少必备角色');

    const g = state.guesses;
    if (g.laoChaoFengGuessXuYuan !== xuYuan.id) {
      breakdown.xuYuanSurvivedBonus = 2;
      score += 2;
    }
    if (g.yaoBuRanGuessFangZhen !== fangZhen.id) {
      breakdown.fangZhenSurvivedBonus = 1;
      score += 1;
    }
    // RULE-DECISION: R-7 —— 所有好人(含许愿、方震本人)都指认老朝奉,并计入半数统计
    const goodPlayers = state.players.filter((p) => p.camp === 'GOOD');
    const correct = goodPlayers.filter(
      (p) => g.goodGuessLaoChaoFeng[p.id] === laoChaoFeng.id,
    ).length;
    if (correct * 2 >= goodPlayers.length) {
      breakdown.laoChaoFengFoundBonus = 1;
      score += 1;
    }
  }

  state.result = {
    winner: score >= 6 ? 'GOOD' : 'EVIL',
    instantWin,
    score,
    breakdown,
    reveal: {
      beasts: state.beasts.map((b) => ({
        id: b.id,
        isReal: b.isReal,
        protectedRound: b.protectedRound,
      })),
      roles: state.players.map((p) => ({ playerId: p.id, role: p.role })),
    },
  };
  state.phase = 'FINISHED';
}
