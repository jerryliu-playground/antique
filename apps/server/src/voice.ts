/**
 * 语音(SPEC 第 6 节):麦序控制,不做自由混音。
 * 服务端持有发言权:只给该说话的人签发 canPublish=true 的 LiveKit token,其他人只订阅。
 *
 * 未配置 LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET 时整体降级(SPEC 6.4):
 * voice:token 下发 { enabled: false },游戏照常,大家去 Discord 开黑。
 */
import { AccessToken } from 'livekit-server-sdk';
import type { Phase } from '@antique/shared';

export interface VoiceConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export function voiceConfigFromEnv(env: NodeJS.ProcessEnv = process.env): VoiceConfig | null {
  const url = env.LIVEKIT_URL;
  const apiKey = env.LIVEKIT_API_KEY;
  const apiSecret = env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

/** 谁能开麦 */
export type MicPolicy =
  | { mode: 'ALL' }
  | { mode: 'NONE' }
  | { mode: 'ONLY'; playerId: string };

/**
 * SPEC 6.2 各阶段麦权:
 * LOBBY / REVEAL / FINISHED 全员自由;SPEECH 仅当前发言者;
 * ACTION / VOTING / IDENTITY 全员静音。
 */
export function micPolicy(phase: Phase, currentSpeakerId: string | null): MicPolicy {
  switch (phase) {
    case 'LOBBY':
    case 'REVEAL':
    case 'FINISHED':
      return { mode: 'ALL' };
    case 'SPEECH':
      return currentSpeakerId ? { mode: 'ONLY', playerId: currentSpeakerId } : { mode: 'NONE' };
    default:
      return { mode: 'NONE' };
  }
}

/** 举手获批的临时麦(Phase 5)叠加在基础策略上 */
export function canPublish(
  policy: MicPolicy,
  playerId: string,
  tempGrants?: ReadonlySet<string>,
): boolean {
  if (tempGrants?.has(playerId)) return true;
  switch (policy.mode) {
    case 'ALL':
      return true;
    case 'NONE':
      return false;
    case 'ONLY':
      return policy.playerId === playerId;
  }
}

/** 策略变化检测用的 key:phase + 发言者 + 临时麦名单 */
export function policyKey(
  phase: Phase,
  currentSpeakerId: string | null,
  tempGrants: ReadonlySet<string>,
): string {
  return `${phase}:${currentSpeakerId ?? ''}:${[...tempGrants].sort().join(',')}`;
}

export async function mintToken(
  cfg: VoiceConfig,
  roomCode: string,
  playerId: string,
  name: string,
  publish: boolean,
): Promise<string> {
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: playerId,
    name,
    ttl: '2h',
  });
  at.addGrant({
    room: roomCode,
    roomJoin: true,
    canSubscribe: true,
    canPublish: publish,
    canPublishData: false,
  });
  return at.toJwt();
}

/** 发给客户端的 voice:token payload(SPEC 4.2,附带 url 与调试信息) */
export interface VoiceTokenPayload {
  enabled: boolean;
  url?: string;
  token?: string;
  canPublish: boolean;
  /** 客户端据此判断是否需要重连(同 key 不动作) */
  policyKey: string;
  phase: Phase;
}
