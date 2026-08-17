/** 服务端协议辅助类型(事件名与 payload 形态见 SPEC 第 4 节) */

/** 各阶段计时(毫秒),SPEC 5.2;房主可在建房时覆盖 */
export interface TimersMs {
  action: number; //   行动(单人回合)
  speech: number; //   发言(单人)
  voting: number; //   押币
  reveal: number; //   开票展示 → 自动进下一轮
  identity: number; // 身份揭示
}

export const DEFAULT_TIMERS_MS: TimersMs = {
  action: 90_000,
  speech: 120_000,
  voting: 60_000,
  reveal: 8_000,
  identity: 60_000,
};

export interface LobbyMemberView {
  playerId: string;
  name: string;
  seat: number;
  connected: boolean;
}

/** room:sync —— 大厅状态(无任何私密信息) */
export interface LobbySyncPayload {
  roomCode: string;
  hostId: string;
  started: boolean;
  members: LobbyMemberView[];
  timersMs: TimersMs;
}
