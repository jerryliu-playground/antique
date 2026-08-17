/**
 * 规则引擎唯一入口(CLAUDE.md 铁律 3):
 *   reduce(state, action) -> { state, events }
 * 纯函数、零 IO、状态不可变(immer)。校验失败抛 EngineError,状态保证不变。
 */
import { produce } from 'immer';
import type {
  BeastId,
  GameAction,
  GameEvent,
  GameState,
  Player,
} from '../types';
import { resolveAppraisal } from './appraisal';
import { EngineError, invariant } from './errors';
import { beginTurn, endActionPhase, finalizeGame, settleVotes, startRound } from './flow';
import {
  appraiseCountFor,
  availableChips,
  currentRound,
  getPlayer,
  requirePhase,
} from './helpers';

export function reduce(
  state: GameState,
  action: GameAction,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = produce(state, (draft) => {
    switch (action.type) {
      case 'APPRAISE':
        handleAppraise(draft, action, events);
        break;
      case 'SKILL':
        handleSkill(draft, action, events);
        break;
      case 'PASS_TURN':
        handlePassTurn(draft, action, events);
        break;
      case 'SPEECH_END':
        handleSpeechEnd(draft, action, events);
        break;
      case 'VOTE_SUBMIT':
        handleVoteSubmit(draft, action, events);
        break;
      case 'VOTE_FINALIZE':
        requirePhase(draft, 'VOTING');
        settleVotes(draft, events);
        break;
      case 'REVEAL_CONTINUE':
        handleRevealContinue(draft, events);
        break;
      case 'IDENTITY_GUESS':
        handleIdentityGuess(draft, action, events);
        break;
      case 'IDENTITY_FINALIZE':
        requirePhase(draft, 'IDENTITY');
        finalizeGame(draft, events);
        break;
      case 'SET_CONNECTED': {
        // 服务端标记断线/重连,任意阶段可用,不产生事件(视图里的 connected 随 state:sync 下发)
        getPlayer(draft, action.playerId).connected = action.connected;
        break;
      }
      default: {
        const _exhaustive: never = action;
        throw new EngineError('BAD_PHASE', `未知动作:${JSON.stringify(_exhaustive)}`);
      }
    }
  });
  return { state: nextState, events };
}

// ============ 行动阶段:步骤 1 鉴定 ============

function requireCurrentActor(
  state: GameState,
  playerId: string,
  step: 'APPRAISE' | 'SKILL' | 'PASS',
): Player {
  requirePhase(state, 'ACTION');
  const round = currentRound(state);
  if (round.currentActorId !== playerId) {
    throw new EngineError('NOT_YOUR_TURN', '还没轮到你行动');
  }
  if (round.turnStep !== step) {
    throw new EngineError('BAD_STEP', `当前步骤是 ${round.turnStep},不能执行 ${step}`);
  }
  return getPlayer(state, playerId);
}

function handleAppraise(
  state: GameState,
  action: { playerId: string; beastIds: BeastId[] },
  events: GameEvent[],
): void {
  const player = requireCurrentActor(state, action.playerId, 'APPRAISE');
  const round = currentRound(state);

  const expected = appraiseCountFor(player.role);
  if (action.beastIds.length !== expected) {
    throw new EngineError('BAD_COUNT', `你的角色本回合应鉴定 ${expected} 件兽首`);
  }

  // RULE-DECISION: R-4 —— 每轮每件每人只能鉴定一次;许愿的 2 件必须不同
  const unique = new Set(action.beastIds);
  if (unique.size !== action.beastIds.length) {
    throw new EngineError('DUPLICATE_BEAST', '不能重复鉴定同一件兽首');
  }
  for (const beastId of action.beastIds) {
    if (!round.exposedBeasts.includes(beastId)) {
      throw new EngineError('BAD_BEAST', '只能鉴定本轮放出的兽首');
    }
    const already = state.appraisalLog.some(
      (e) => e.round === state.currentRound && e.playerId === player.id && e.beastId === beastId,
    );
    if (already) {
      throw new EngineError('DUPLICATE_BEAST', '本轮已鉴定过这件兽首');
    }
  }

  // 当前行动者的顺位 = actionOrder 里的 index(铁律 4:不用回合数/座位号)
  const actionIndex = round.actionOrder.length - 1;
  invariant(round.actionOrder[actionIndex] === player.id, 'actionOrder 与当前行动者不一致');

  for (const beastId of action.beastIds) {
    const shown = resolveAppraisal(state, player, beastId, actionIndex);
    const truth = shown === 'BLOCKED' ? null : state.beasts[beastId].isReal;
    state.appraisalLog.push({
      round: state.currentRound,
      playerId: player.id,
      beastId,
      shown,
      truth,
    });
    events.push({
      kind: 'PRIVATE_APPRAISAL',
      toPlayerId: player.id,
      round: state.currentRound,
      beastId,
      shown,
    });
  }

  round.turnStep = 'SKILL';
  events.push({ kind: 'PUBLIC', event: { t: 'APPRAISED', playerId: player.id } });
}

// ============ 行动阶段:步骤 2 技能 ============

function handleSkill(
  state: GameState,
  action: { playerId: string; use: boolean; targetPlayerId?: string; targetBeastId?: BeastId },
  events: GameEvent[],
): void {
  const player = requireCurrentActor(state, action.playerId, 'SKILL');
  const round = currentRound(state);

  if (action.use) {
    // RULE-DECISION: R-6 —— 被偷袭者无法鉴定也无法发动任何主动技能(含老朝奉翻转)
    if (player.snipedConsumedThisTurn) {
      throw new EngineError('SKILL_BLOCKED', '你被药不然偷袭了,本回合无法发动技能');
    }

    const actionIndex = round.actionOrder.length - 1;

    switch (player.role) {
      case 'FANG_ZHEN': {
        const target = getPlayer(state, action.targetPlayerId);
        // RULE-DECISION(拍板 2026-08-12):方震不能查验自己,避免误操作浪费查验
        if (target.id === player.id) {
          throw new EngineError('BAD_TARGET', '不能查验自己');
        }
        state.investigations.push({
          round: state.currentRound,
          targetId: target.id,
          camp: target.camp,
        });
        state.skillLog.push({
          round: state.currentRound,
          playerId: player.id,
          skill: 'INVESTIGATE',
          targetPlayerId: target.id,
        });
        events.push({
          kind: 'PRIVATE_INVESTIGATION',
          toPlayerId: player.id,
          round: state.currentRound,
          targetId: target.id,
          camp: target.camp,
        });
        break;
      }
      case 'LAO_CHAO_FENG': {
        // 记录发动时的 actionIndex(铁律 4:顺位以 actionOrder 的 index 为准),本轮有效,下轮随 RoundState 重置
        round.laoChaoFengFlipAt = actionIndex;
        state.skillLog.push({ round: state.currentRound, playerId: player.id, skill: 'FLIP' });
        break;
      }
      case 'YAO_BU_RAN': {
        // RULE-DECISION: R-3 —— 可以偷袭任意玩家,包括自己和队友
        const target = getPlayer(state, action.targetPlayerId);
        snipe(state, target);
        state.skillLog.push({
          round: state.currentRound,
          playerId: player.id,
          skill: 'SNIPE',
          targetPlayerId: target.id,
        });
        break;
      }
      case 'ZHENG_GUO_QU': {
        const beastId = action.targetBeastId;
        if (beastId === undefined || !round.exposedBeasts.includes(beastId)) {
          throw new EngineError('BAD_BEAST', '只能覆盖本轮放出的兽首');
        }
        round.covered = { beastId, atIndex: actionIndex };
        state.skillLog.push({
          round: state.currentRound,
          playerId: player.id,
          skill: 'COVER',
          targetBeastId: beastId,
        });
        break;
      }
      default:
        throw new EngineError('NO_ACTIVE_SKILL', '该角色没有主动技能');
    }
    // 注意:技能发动完全静默,绝不发 SKILL_USED 公开事件(SPEC 4.3 警告)
  }

  advanceAfterSkill(state, events);
}

/**
 * 偷袭只静默挂标记,不发任何事件、不改任何受害者可见的字段——
 * 受害者要等到自己回合开始消耗标记时才得知(见 flow.beginTurn,拍板 2026-08-12)。
 * 姬云浮的 permanentlyBlinded 也推迟到消耗时落地,否则他的视图字段变化会立刻暴露偷袭。
 */
function snipe(state: GameState, target: Player): void {
  target.sniped = true;

  // 偷袭到方震 → 许愿连带被偷袭(同样静默)
  if (target.role === 'FANG_ZHEN') {
    const xuYuan = state.players.find((p) => p.role === 'XU_YUAN');
    if (xuYuan) {
      xuYuan.sniped = true;
    }
  }
}

function advanceAfterSkill(state: GameState, events: GameEvent[]): void {
  const round = currentRound(state);
  if (round.actionOrder.length === state.players.length) {
    // 尾家行动完毕,无人可派 → 行动阶段结束
    const tail = getPlayer(state, round.currentActorId);
    tail.snipedConsumedThisTurn = false;
    endActionPhase(state, events);
  } else {
    round.turnStep = 'PASS';
  }
}

// ============ 行动阶段:步骤 3 派票 ============

function handlePassTurn(
  state: GameState,
  action: { playerId: string; targetPlayerId: string },
  events: GameEvent[],
): void {
  const actor = requireCurrentActor(state, action.playerId, 'PASS');
  const round = currentRound(state);

  const target = getPlayer(state, action.targetPlayerId);
  if (target.id === actor.id) {
    throw new EngineError('BAD_TARGET', '不能派票给自己');
  }
  if (round.actionOrder.includes(target.id)) {
    throw new EngineError('ALREADY_ACTED', '该玩家本轮已行动,只能派给尚未行动的玩家');
  }

  actor.snipedConsumedThisTurn = false; // 回合结束,清除本回合标记

  round.actionOrder.push(target.id);
  round.currentActorId = target.id;
  round.turnStep = 'APPRAISE';

  events.push({ kind: 'PUBLIC', event: { t: 'PASSED', from: actor.id, to: target.id } });
  beginTurn(state, target, events);
}

// ============ 发言阶段 ============

function handleSpeechEnd(
  state: GameState,
  action: { playerId: string },
  events: GameEvent[],
): void {
  requirePhase(state, 'SPEECH');
  const round = currentRound(state);
  if (round.currentSpeakerId !== action.playerId) {
    throw new EngineError('NOT_YOUR_TURN', '还没轮到你发言');
  }

  const idx = round.speechOrder.indexOf(action.playerId);
  invariant(idx >= 0, 'speechOrder 与当前发言者不一致');

  if (idx === round.speechOrder.length - 1) {
    round.currentSpeakerId = null;
    state.phase = 'VOTING';
  } else {
    const next = round.speechOrder[idx + 1];
    round.currentSpeakerId = next;
    events.push({ kind: 'PUBLIC', event: { t: 'SPEECH_START', playerId: next } });
  }
}

// ============ 押币阶段 ============

function handleVoteSubmit(
  state: GameState,
  action: { playerId: string; distribution: Partial<Record<BeastId, number>> },
  events: GameEvent[],
): void {
  requirePhase(state, 'VOTING');
  const round = currentRound(state);
  const player = getPlayer(state, action.playerId);

  if (round.votes[player.id] !== undefined) {
    throw new EngineError('ALREADY_SUBMITTED', '你已经提交过本轮押币');
  }

  let total = 0;
  const normalized: Partial<Record<BeastId, number>> = {};
  for (const [key, value] of Object.entries(action.distribution)) {
    const beastId = Number(key) as BeastId;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new EngineError('BAD_DISTRIBUTION', '票数必须是非负整数');
    }
    if (!round.exposedBeasts.includes(beastId)) {
      throw new EngineError('BAD_BEAST', '只能投给本轮放出的兽首');
    }
    if (value > 0) normalized[beastId] = value;
    total += value;
  }

  const available = availableChips(state, player);
  if (total > available) {
    throw new EngineError('CHIPS_EXCEEDED', `本轮最多可投 ${available} 枚`);
  }

  round.votes[player.id] = normalized;
  events.push({ kind: 'PUBLIC', event: { t: 'VOTE_SUBMITTED', playerId: player.id } });

  // 全员提交后同时开票
  if (Object.keys(round.votes).length === state.players.length) {
    settleVotes(state, events);
  }
}

// ============ 开票展示 → 下一轮 / 身份揭示 ============

function handleRevealContinue(state: GameState, events: GameEvent[]): void {
  requirePhase(state, 'REVEAL');
  const round = currentRound(state);

  if (round.index < 2) {
    // 尾家成为下一轮的起始玩家
    const tailId = round.actionOrder[round.actionOrder.length - 1];
    startRound(state, round.index + 1, tailId, events);
    return;
  }

  // 三轮结束:即时胜利判定
  const protectedBeasts = state.beasts.filter((b) => b.protectedRound !== null);
  const realProtected = protectedBeasts.filter((b) => b.isReal).length;
  if (realProtected === 6) {
    finalizeGame(state, events, true);
  } else {
    state.phase = 'IDENTITY';
  }
}

// ============ 身份揭示 ============

function handleIdentityGuess(
  state: GameState,
  action: { playerId: string; targetPlayerId: string },
  events: GameEvent[],
): void {
  requirePhase(state, 'IDENTITY');
  const player = getPlayer(state, action.playerId);
  const target = getPlayer(state, action.targetPlayerId);
  if (target.id === player.id) {
    throw new EngineError('BAD_TARGET', '不能指认自己');
  }

  const g = state.guesses;
  if (player.role === 'LAO_CHAO_FENG') {
    if (g.laoChaoFengGuessXuYuan !== null) throw new EngineError('ALREADY_GUESSED', '你已指认过');
    g.laoChaoFengGuessXuYuan = target.id;
  } else if (player.role === 'YAO_BU_RAN') {
    if (g.yaoBuRanGuessFangZhen !== null) throw new EngineError('ALREADY_GUESSED', '你已指认过');
    g.yaoBuRanGuessFangZhen = target.id;
  } else if (player.camp === 'GOOD') {
    // RULE-DECISION: R-7 —— 每一名好人(含许愿、方震本人)各自指认老朝奉
    if (g.goodGuessLaoChaoFeng[player.id] !== undefined) {
      throw new EngineError('ALREADY_GUESSED', '你已指认过');
    }
    g.goodGuessLaoChaoFeng[player.id] = target.id;
  } else {
    // 郑国渠不进行任何指认
    throw new EngineError('BAD_ROLE', '郑国渠不参与指认');
  }

  if (allGuessesIn(state)) {
    finalizeGame(state, events);
  }
}

function allGuessesIn(state: GameState): boolean {
  const g = state.guesses;
  if (g.laoChaoFengGuessXuYuan === null) return false;
  if (g.yaoBuRanGuessFangZhen === null) return false;
  return state.players
    .filter((p) => p.camp === 'GOOD')
    .every((p) => g.goodGuessLaoChaoFeng[p.id] !== undefined);
}
