/**
 * 对局回放(Phase 5):seed + action 序列 → 逐步重放整局(铁律 3 的红利)。
 * 用于终局校验与事后复盘;快照文件里带全部所需数据。
 */
import { initGame, reduce, type GameAction, type GameState } from '@antique/shared';
import type { RoomSnapshot } from './persistence';

export interface ReplayResult {
  finalState: GameState;
  steps: number;
  /** 与快照中的实际状态逐字节一致(确定性验证) */
  matchesSnapshot: boolean | null;
}

export function replaySnapshot(snap: RoomSnapshot): ReplayResult {
  if (!snap.gameInit) {
    throw new Error(`快照 ${snap.code} 没有 gameInit,无法回放(旧版本快照?)`);
  }
  const { state: initial } = initGame({
    roomCode: snap.code,
    seed: snap.gameInit.seed,
    players: snap.gameInit.players,
  });

  let state = initial;
  for (const entry of snap.actionLog ?? []) {
    state = reduce(state, entry.action as GameAction).state;
  }

  return {
    finalState: state,
    steps: (snap.actionLog ?? []).length,
    matchesSnapshot: snap.game ? JSON.stringify(state) === JSON.stringify(snap.game) : null,
  };
}
