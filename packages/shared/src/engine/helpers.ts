import type { Beast, BeastId, GameState, Phase, Player, Role, RoundState } from '../types';
import { EngineError, invariant } from './errors';

export const TOTAL_CHIPS = 6;
export const CHIPS_PER_ROUND = 2;

export function requirePhase(state: GameState, phase: Phase): void {
  if (state.phase !== phase) {
    throw new EngineError('BAD_PHASE', `当前阶段是 ${state.phase},该操作只允许在 ${phase} 阶段`);
  }
}

export function getPlayer(state: GameState, playerId: string | null | undefined): Player {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new EngineError('UNKNOWN_PLAYER', `玩家不存在:${playerId}`);
  return p;
}

export function findRole(state: GameState, role: Role): Player | undefined {
  return state.players.find((p) => p.role === role);
}

export function currentRound(state: GameState): RoundState {
  const r = state.rounds[state.currentRound];
  invariant(r, `第 ${state.currentRound} 轮不存在`);
  return r;
}

export function getBeast(state: GameState, beastId: BeastId): Beast {
  const b = state.beasts[beastId];
  invariant(b && b.id === beastId, `兽首 ${beastId} 不存在或状态损坏`);
  return b;
}

/** 每个角色一次行动可鉴定的件数:许愿 2,方震 0,其余 1 */
export function appraiseCountFor(role: Role): number {
  if (role === 'XU_YUAN') return 2;
  if (role === 'FANG_ZHEN') return 0;
  return 1;
}

/** 是否有主动技能(行动第 2 步可发动) */
export function hasActiveSkill(role: Role): boolean {
  return (
    role === 'FANG_ZHEN' ||
    role === 'LAO_CHAO_FENG' ||
    role === 'YAO_BU_RAN' ||
    role === 'ZHENG_GUO_QU'
  );
}

/**
 * 本轮可投上限(SPEC 3.5):availableThisRound = 2 * (currentRound + 1) - totalSpentSoFar
 * chips 存整局剩余总数(初始 6),不额外存"本轮手里几枚"。
 */
export function availableChips(state: GameState, player: Player): number {
  const totalSpent = TOTAL_CHIPS - player.chips;
  return CHIPS_PER_ROUND * (state.currentRound + 1) - totalSpent;
}
