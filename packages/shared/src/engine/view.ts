/**
 * PersonalView 构造——下发给客户端的唯一形态(CLAUDE.md 铁律 2)。
 *
 * 白名单式构造:只往 view 里放明确允许的字段,绝不复制整个 state 再删字段。
 * 每写一个字段前先问:把这个 payload 打印到浏览器 console 里,玩家能作弊吗?
 *
 * 不下发的内容(测试 T-70~T-77 逐条守护):
 * - 其他玩家的 role / camp / 鉴定历史 / 技能目标
 * - 未公开兽首的 isReal、roundPools(未来轮次的兽首池)
 * - 开票前任何人的票数、老朝奉翻转标记、郑国渠覆盖标记、木户/黄的 blindRound
 */
import type { GameState, PersonalView } from '../types';
import { getPlayer } from './helpers';

export function toPersonalView(
  state: GameState,
  playerId: string,
  deadline: number | null = null,
): PersonalView {
  const me = getPlayer(state, playerId);
  const round = state.rounds[state.currentRound];

  // 只有老朝奉 ↔ 药不然互相认识;郑国渠不知道任何队友,队友也不知道他(R-1 相关)
  const knownTeammates =
    me.role === 'LAO_CHAO_FENG'
      ? state.players.filter((p) => p.role === 'YAO_BU_RAN')
      : me.role === 'YAO_BU_RAN'
        ? state.players.filter((p) => p.role === 'LAO_CHAO_FENG')
        : [];

  return {
    roomCode: state.roomCode,
    phase: state.phase,
    me: {
      id: me.id,
      role: me.role,
      camp: me.camp,
      chips: me.chips,
      // 只在本回合被封禁时为 true。待消耗的 sniped 标记绝不下发——
      // 被偷袭者轮到自己才知道,否则暴露药不然(拍板 2026-08-12)
      sniped: me.snipedConsumedThisTurn,
      permanentlyBlinded: me.permanentlyBlinded,
      knownTeammates: knownTeammates.map((p) => ({ id: p.id, role: p.role })),
      myAppraisals: state.appraisalLog
        .filter((e) => e.playerId === me.id)
        .map((e) => ({ round: e.round, beastId: e.beastId, shown: e.shown })),
      myInvestigations:
        me.role === 'FANG_ZHEN'
          ? state.investigations.map((e) => ({ ...e }))
          : [],
      mySkillHistory: state.skillLog
        .filter((e) => e.playerId === me.id)
        .map((e) => ({
          round: e.round,
          skill: e.skill,
          ...(e.targetPlayerId !== undefined ? { targetPlayerId: e.targetPlayerId } : {}),
          ...(e.targetBeastId !== undefined ? { targetBeastId: e.targetBeastId } : {}),
        })),
    },
    players: state.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        connected: p.connected,
        hasActed: round ? round.actionOrder.includes(p.id) : false,
        chipsRemaining: p.chips, // 公开信息(筹码在结算时才扣,暗投期间不会泄露票数)
      })),
    round: round
      ? {
          index: round.index,
          exposedBeasts: round.exposedBeasts.slice(),
          currentActorId: round.currentActorId,
          turnStep: round.turnStep, // 公开:重连后恢复"我该做哪一步"
          actionOrder: round.actionOrder.slice(), // 公开:推理老朝奉翻转范围的依据
          currentSpeakerId: round.currentSpeakerId,
          tally: round.tally ? round.tally.map((t) => ({ ...t })) : null, // 开票后才有值
        }
      : {
          index: -1,
          exposedBeasts: [],
          currentActorId: null,
          turnStep: null,
          actionOrder: [],
          currentSpeakerId: null,
          tally: null,
        },
    publicBeasts: state.beasts
      .filter((b) => b.publiclyRevealed)
      .map((b) => ({ id: b.id, isReal: b.isReal, protectedRound: b.protectedRound ?? -1 })),
    protectedUnknown: state.beasts
      .filter((b) => b.protectedRound !== null && !b.publiclyRevealed)
      .map((b) => b.id),
    deadline,
    result: state.result,
  };
}
