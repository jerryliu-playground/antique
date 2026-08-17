import type { AppraisalResult, BeastId, GameState, Player } from '../types';
import { currentRound, getBeast } from './helpers';

/**
 * 鉴定结果解析(SPEC 3.2,最关键的一段)。
 * 按顺序判定,命中即返回——顺序不能改:例如"被覆盖"优先于"老朝奉翻转",
 * 覆盖直接返回 BLOCKED,不存在"翻转后的无法鉴定"。
 *
 * 许愿一次鉴 2 件时,两件用同一个 actionIndex 分别调用本函数。
 */
export function resolveAppraisal(
  state: GameState,
  player: Player,
  beastId: BeastId,
  actionIndex: number,
): AppraisalResult {
  const round = currentRound(state);

  // 1. 方震永远不能鉴定
  if (player.role === 'FANG_ZHEN') return 'BLOCKED';

  // 2. 姬云浮被偷袭过 → 永久失能
  if (player.permanentlyBlinded) return 'BLOCKED';

  // 3. 本次行动被药不然偷袭(标记已在回合开始时消耗)
  if (player.snipedConsumedThisTurn) return 'BLOCKED';

  // 4. 木户加奈 / 黄烟烟的随机轮空
  if (player.blindRound === state.currentRound) return 'BLOCKED';

  // 5. 郑国渠覆盖,且覆盖发生在本次行动之前
  // RULE-DECISION: R-5 —— 覆盖对所有阵营生效(含坏人自己),不做阵营过滤
  if (round.covered !== null && round.covered.beastId === beastId && round.covered.atIndex < actionIndex) {
    return 'BLOCKED';
  }

  // 6. 正常鉴定
  let truth = getBeast(state, beastId).isReal;

  // 7. 老朝奉翻转:发动在本次行动之前 + 鉴定者是好人 + 不是姬云浮
  // RULE-DECISION: R-1 —— 翻转按阵营判定:郑国渠虽不认识队友,但他是 EVIL,不受影响
  if (
    round.laoChaoFengFlipAt !== null &&
    round.laoChaoFengFlipAt < actionIndex &&
    player.camp === 'GOOD' &&
    player.role !== 'JI_YUN_FU' // 姬云浮免疫翻转(但不免疫覆盖和偷袭,见上面的顺序)
  ) {
    truth = !truth;
  }

  return truth ? 'REAL' : 'FAKE';
}
