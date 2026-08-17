/**
 * 确定性 fuzz 驱动(SPEC Phase 1 验收第 2 条):
 * 给定 seed 生成随机但合法的 action 序列,跑完整局,期间做状态不变量与泄密检查。
 * 全程只用 mulberry32,不碰 Math.random,同一 seed 必然得到同一整局。
 */
import { appraiseCountFor, availableChips, hasActiveSkill } from '../engine/helpers';
import { initGame } from '../engine/init';
import { reduce } from '../engine/reduce';
import { mulberry32, type Rng } from '../engine/rng';
import { toPersonalView } from '../engine/view';
import type { BeastId, GameAction, GameState } from '../types';
import { assertNoLeaks } from './leakcheck';

export interface FuzzReport {
  games: number;
  totalActions: number;
}

export function runFuzz(
  games: number,
  opts: { checkLeaks?: boolean; onProgress?: (done: number) => void } = {},
): FuzzReport {
  let totalActions = 0;
  for (let i = 0; i < games; i++) {
    const playerCount = (6 + (i % 3)) as 6 | 7 | 8;
    // 泄密走查有成本,抽 1/4 的对局做
    const checkLeaks = (opts.checkLeaks ?? true) && i % 4 === 0;
    const { actions } = runFuzzGame(1000 + i * 7919, playerCount, checkLeaks);
    totalActions += actions;
    opts.onProgress?.(i + 1);
  }
  return { games, totalActions };
}

export function runFuzzGame(
  seed: number,
  playerCount: 6 | 7 | 8,
  checkLeaks: boolean,
): { state: GameState; actions: number } {
  const rng = mulberry32((seed ^ 0x5f356495) >>> 0);
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i}`,
    name: `玩家${i}`,
  }));

  let { state } = initGame({ roomCode: 'FUZZ', seed, players });
  let actions = 0;

  while (state.phase !== 'FINISHED') {
    if (++actions > 3000) {
      throw new Error(`fuzz(seed=${seed}): 超过步数上限,疑似死循环,phase=${state.phase}`);
    }
    const action = nextAction(state, rng);
    state = reduce(state, action).state;
    checkInvariants(state, seed);
    if (checkLeaks && actions % 7 === 0) {
      const p = state.players[Math.floor(rng() * state.players.length)];
      assertNoLeaks(state, toPersonalView(state, p.id), p.id);
    }
  }
  finalAssertions(state, seed);
  if (checkLeaks) {
    for (const p of state.players) {
      assertNoLeaks(state, toPersonalView(state, p.id), p.id);
    }
  }
  return { state, actions };
}

function pick<T>(arr: readonly T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickDistinct<T>(arr: readonly T[], count: number, rng: Rng): T[] {
  const copy = arr.slice();
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
}

function nextAction(state: GameState, rng: Rng): GameAction {
  const round = state.rounds[state.currentRound];
  switch (state.phase) {
    case 'ACTION': {
      const pid = round.currentActorId;
      if (pid === null) throw new Error('ACTION 阶段没有当前行动者');
      const player = state.players.find((p) => p.id === pid);
      if (!player) throw new Error('当前行动者不存在');

      if (round.turnStep === 'APPRAISE') {
        const count = appraiseCountFor(player.role);
        return { type: 'APPRAISE', playerId: pid, beastIds: pickDistinct(round.exposedBeasts, count, rng) };
      }
      if (round.turnStep === 'SKILL') {
        const canUse = hasActiveSkill(player.role) && !player.snipedConsumedThisTurn;
        if (canUse && rng() < 0.6) {
          if (player.role === 'FANG_ZHEN') {
            // 方震不能查验自己(拍板 2026-08-12)
            const others = state.players.filter((p) => p.id !== pid);
            return { type: 'SKILL', playerId: pid, use: true, targetPlayerId: pick(others, rng).id };
          }
          if (player.role === 'YAO_BU_RAN') {
            // 药不然可以偷任何人(含自己,R-3)
            return { type: 'SKILL', playerId: pid, use: true, targetPlayerId: pick(state.players, rng).id };
          }
          if (player.role === 'ZHENG_GUO_QU') {
            return { type: 'SKILL', playerId: pid, use: true, targetBeastId: pick(round.exposedBeasts, rng) };
          }
          return { type: 'SKILL', playerId: pid, use: true }; // 老朝奉
        }
        return { type: 'SKILL', playerId: pid, use: false };
      }
      // PASS
      const candidates = state.players.filter((p) => !round.actionOrder.includes(p.id));
      return { type: 'PASS_TURN', playerId: pid, targetPlayerId: pick(candidates, rng).id };
    }
    case 'SPEECH': {
      if (round.currentSpeakerId === null) throw new Error('SPEECH 阶段没有当前发言者');
      return { type: 'SPEECH_END', playerId: round.currentSpeakerId };
    }
    case 'VOTING': {
      const pending = state.players.filter((p) => round.votes[p.id] === undefined);
      // 5% 概率模拟押币超时(未提交者视为 0 票)
      if (rng() < 0.05) return { type: 'VOTE_FINALIZE' };
      const p = pick(pending, rng);
      const budget = Math.floor(rng() * (availableChips(state, p) + 1));
      const distribution: Partial<Record<BeastId, number>> = {};
      let left = budget;
      for (const b of round.exposedBeasts) {
        if (left <= 0) break;
        const v = Math.floor(rng() * (left + 1));
        if (v > 0) distribution[b] = v;
        left -= v;
      }
      return { type: 'VOTE_SUBMIT', playerId: p.id, distribution };
    }
    case 'REVEAL':
      return { type: 'REVEAL_CONTINUE' };
    case 'IDENTITY': {
      // 8% 概率模拟身份揭示超时(未指认按没猜中处理)
      if (rng() < 0.08) return { type: 'IDENTITY_FINALIZE' };
      const g = state.guesses;
      const lcf = state.players.find((p) => p.role === 'LAO_CHAO_FENG');
      const ybr = state.players.find((p) => p.role === 'YAO_BU_RAN');
      if (!lcf || !ybr) throw new Error('缺少必备角色');
      const guesser =
        g.laoChaoFengGuessXuYuan === null
          ? lcf
          : g.yaoBuRanGuessFangZhen === null
            ? ybr
            : state.players.find(
                (p) => p.camp === 'GOOD' && g.goodGuessLaoChaoFeng[p.id] === undefined,
              );
      if (!guesser) throw new Error('IDENTITY 阶段没有待指认者却未结算');
      const others = state.players.filter((p) => p.id !== guesser.id);
      return { type: 'IDENTITY_GUESS', playerId: guesser.id, targetPlayerId: pick(others, rng).id };
    }
    default:
      throw new Error(`fuzz: 意外阶段 ${state.phase}`);
  }
}

/** 每步之后的状态不变量 */
function checkInvariants(state: GameState, seed: number): void {
  const die = (msg: string): never => {
    throw new Error(`fuzz(seed=${seed}) 非法状态: ${msg}`);
  };

  for (const p of state.players) {
    if (p.chips < 0 || p.chips > 6) die(`玩家 ${p.id} 筹码=${p.chips}`);
  }
  if (state.rounds.length !== state.currentRound + 1) die('rounds 长度与 currentRound 不符');

  const round = state.rounds[state.currentRound];
  if (new Set(round.actionOrder).size !== round.actionOrder.length) die('actionOrder 有重复');
  if (round.actionOrder.length > state.players.length) die('actionOrder 超长');
  if (state.phase === 'ACTION') {
    if (round.currentActorId !== round.actionOrder[round.actionOrder.length - 1]) {
      die('currentActorId 不是 actionOrder 末位');
    }
  }

  // 每个已结算轮次恰好保护 2 件、公开 1 件
  for (const r of state.rounds) {
    if (r.tally !== null) {
      const protectedInRound = state.beasts.filter((b) => b.protectedRound === r.index);
      if (protectedInRound.length !== 2) die(`第 ${r.index} 轮保护数=${protectedInRound.length}`);
      const revealed = protectedInRound.filter((b) => b.publiclyRevealed);
      if (revealed.length !== 1) die(`第 ${r.index} 轮公开数=${revealed.length}`);
    }
  }

  // 鉴定记录不重复(R-4)
  const keys = state.appraisalLog.map((e) => `${e.round}:${e.playerId}:${e.beastId}`);
  if (new Set(keys).size !== keys.length) die('appraisalLog 有重复记录');
}

function finalAssertions(state: GameState, seed: number): void {
  const die = (msg: string): never => {
    throw new Error(`fuzz(seed=${seed}) 终局断言失败: ${msg}`);
  };
  const result = state.result;
  if (!result) return die('FINISHED 却没有 result');

  const protectedBeasts = state.beasts.filter((b) => b.protectedRound !== null);
  if (protectedBeasts.length !== 6) die(`保护数=${protectedBeasts.length}`);
  const realProtected = protectedBeasts.filter((b) => b.isReal).length;
  if (result.breakdown.realProtected !== realProtected) die('breakdown.realProtected 不符');

  const b = result.breakdown;
  const sum = b.realProtected + b.xuYuanSurvivedBonus + b.fangZhenSurvivedBonus + b.laoChaoFengFoundBonus;
  if (result.score !== sum) die(`score=${result.score} 但 breakdown 合计=${sum}`);
  if (result.winner !== (result.score >= 6 ? 'GOOD' : 'EVIL')) die('winner 与 score 不符');
  if (result.instantWin && realProtected !== 6) die('instantWin 但保护的不全是真品');
}
