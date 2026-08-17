/**
 * 语音客户端(SPEC 6.2/6.3):
 * - 服务端每次麦权变化重发 voice:token,本模块凭 token 连 LiveKit,只在 policyKey 变化时重连
 * - iOS Safari 必须由用户手势触发:入口是 startVoice(),挂在「开启语音」按钮上
 * - 浏览器拦截自动播放时置 voiceAudioBlocked,由界面上的「恢复声音」按钮调 resumeAudio()
 * - 开麦失败(权限被拒 / 非 HTTPS)不再静默,写进 voiceMicError 并弹提示
 * - 切后台断流:回前台自动重连;未配置 LiveKit 时 enabled=false 整体降级(SPEC 6.4)
 */
import type { Room as LKRoom } from 'livekit-client';
import { socket, toast, useStore } from './store';

interface VoiceTokenPayload {
  enabled: boolean;
  url?: string;
  token?: string;
  canPublish: boolean;
  policyKey: string;
  phase: string;
}

let lastPayload: VoiceTokenPayload | null = null;
let pendingPayload: VoiceTokenPayload | null = null;
let lkRoom: LKRoom | null = null;
let started = false;
let appliedKey: string | null = null;
let applying = false;
let audioHost: HTMLDivElement | null = null;

function host(): HTMLDivElement {
  if (!audioHost) {
    audioHost = document.createElement('div');
    audioHost.style.display = 'none';
    document.body.appendChild(audioHost);
  }
  return audioHost;
}

socket.on('voice:token', (p: VoiceTokenPayload) => {
  lastPayload = p;
  useStore.setState({ voiceEnabled: p.enabled, voiceCanSpeak: p.canPublish });
  if (started) void applyToken(p).catch(() => undefined);
});

socket.on('voice:hands', (p: { playerIds: string[] }) => {
  useStore.setState({ voiceHands: p.playerIds ?? [] });
});

/** 必须由用户手势调用(iOS getUserMedia / 音频播放授权,SPEC 6.3) */
export async function startVoice(): Promise<void> {
  if (started) return;
  if (!lastPayload?.enabled) {
    toast('info', '本局未配置语音,建议开个 Discord 一起说话');
    return;
  }
  started = true;
  useStore.setState({ voiceStatus: 'connecting' });
  try {
    await applyToken(lastPayload);
  } catch (err) {
    started = false;
    useStore.setState({ voiceStatus: 'error' });
    toast('error', `语音连接失败:${(err as Error).message}`);
  }
}

/** 自己开关麦(仍受服务端麦权约束) */
export async function setMicWanted(want: boolean): Promise<void> {
  useStore.setState({ voiceWantMic: want });
  if (lkRoom && lastPayload?.canPublish) {
    await enableMic(lkRoom, want);
  }
}

/** 「恢复声音」按钮直接调用(必须在点击处理器里同步发起) */
export function resumeAudio(): void {
  if (!lkRoom) return;
  void lkRoom
    .startAudio()
    .then(() => useStore.setState({ voiceAudioBlocked: !lkRoom || !lkRoom.canPlaybackAudio }))
    .catch(() => undefined);
}

async function enableMic(room: LKRoom, on: boolean): Promise<void> {
  try {
    await room.localParticipant.setMicrophoneEnabled(on);
    useStore.setState({ voiceMicError: null });
  } catch (err) {
    const raw = (err as Error).message ?? String(err);
    const hint = window.isSecureContext
      ? '浏览器拒绝了麦克风权限,请在地址栏允许麦克风后重试'
      : '当前页面不是 HTTPS,浏览器禁用了麦克风(请用 https:// 地址打开)';
    useStore.setState({ voiceMicError: hint });
    if (on) toast('error', `开麦失败:${hint}(${raw})`);
  }
}

function refreshPeers(room: LKRoom): void {
  useStore.setState({ voicePeers: room.remoteParticipants.size + 1 });
}

async function applyToken(p: VoiceTokenPayload): Promise<void> {
  if (applying) {
    pendingPayload = p; // 连接期间来了新 token,排队,连完再应用(不丢)
    return;
  }
  applying = true;
  try {
    if (!p.enabled || !p.url || !p.token) {
      await teardown();
      return;
    }
    if (p.policyKey === appliedKey && lkRoom && lkRoom.state === 'connected') {
      return; // 同一策略且连接健在,不折腾
    }
    const { Room, RoomEvent } = await import('livekit-client');
    await teardown();

    const room = new Room();
    lkRoom = room;
    appliedKey = p.policyKey;

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === 'audio') {
        host().appendChild(track.attach());
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((el) => el.remove());
    });
    // 关键:浏览器自动播放策略拦了远端声音 → 界面出「恢复声音」按钮
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      useStore.setState({ voiceAudioBlocked: !room.canPlaybackAudio });
    });
    room.on(RoomEvent.ParticipantConnected, () => refreshPeers(room));
    room.on(RoomEvent.ParticipantDisconnected, () => refreshPeers(room));
    // LiveKit 的 identity 就是 playerId,直接点亮"谁在说话"
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      useStore.setState({ voiceSpeaking: speakers.map((s) => s.identity) });
    });

    await room.connect(p.url, p.token);
    refreshPeers(room);
    await room.startAudio().catch(() => undefined); // 失败会走 AudioPlaybackStatusChanged
    useStore.setState({
      voiceStatus: 'on',
      voiceAudioBlocked: !room.canPlaybackAudio,
    });
    if (p.canPublish && useStore.getState().voiceWantMic) {
      await enableMic(room, true);
    }
  } finally {
    applying = false;
    if (pendingPayload && pendingPayload !== p) {
      const next = pendingPayload;
      pendingPayload = null;
      void applyToken(next).catch(() => undefined);
    } else {
      pendingPayload = null;
    }
  }
}

async function teardown(): Promise<void> {
  if (lkRoom) {
    const r = lkRoom;
    lkRoom = null;
    await r.disconnect().catch(() => undefined);
  }
  appliedKey = null;
  host().replaceChildren();
  useStore.setState({ voicePeers: 0, voiceSpeaking: [], voiceAudioBlocked: false });
}

export async function stopVoice(): Promise<void> {
  started = false;
  await teardown();
  useStore.setState({ voiceStatus: 'off' });
}

// 切后台音频会断,回前台自动重连(SPEC 6.3)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !started || !lastPayload) return;
  if (!lkRoom || lkRoom.state !== 'connected') {
    appliedKey = null;
    void applyToken(lastPayload).catch(() => undefined);
  }
});

// 被踢 / 离席回首页时收尾
socket.on('room:kicked', () => void stopVoice());
useStore.subscribe((s, prev) => {
  if (prev.screen !== 'home' && s.screen === 'home') void stopVoice();
});
