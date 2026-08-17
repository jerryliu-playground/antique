/**
 * 客户端状态 + Socket.IO 接线(铁律 1:客户端不做任何规则计算,
 * 只渲染服务端下发的 PersonalView、把操作发回服务端)。
 */
import type { AppraisalResult, BeastId, Camp, PersonalView, PublicEvent } from '@antique/shared';
import { io } from 'socket.io-client';
import { create } from 'zustand';
import { beastName, formatEvent, shownText } from './format';

// ============ 类型 ============

export interface LobbyMember {
  playerId: string;
  name: string;
  seat: number;
  connected: boolean;
}

export interface LobbySync {
  roomCode: string;
  hostId: string;
  started: boolean;
  members: LobbyMember[];
  timersMs: Record<string, number>;
}

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'alert';
  text: string;
}

type Screen = 'home' | 'lobby' | 'game';
type DrawerTab = null | 'identity' | 'history' | 'log' | 'beasts';

interface AppState {
  screen: Screen;
  connected: boolean;
  roomCode: string | null;
  playerId: string | null;
  name: string;
  lobby: LobbySync | null;
  view: PersonalView | null;
  logs: string[];
  toasts: Toast[];
  /** 每轮放出的兽首(自己记账,供十二兽首总览区分「已出局 / 未现世」) */
  roundBeasts: Record<number, BeastId[]>;
  /** 本地已提交押币的轮次 / 已指认(刷新丢失时由 ALREADY_* 错误补回) */
  votedRounds: number[];
  guessed: boolean;
  /** 行动阶段:鉴定选中的兽首 */
  selectedBeasts: BeastId[];
  drawerTab: DrawerTab;
  /** 语音(Phase 4) */
  voiceEnabled: boolean | null;
  voiceStatus: 'off' | 'connecting' | 'on' | 'error';
  voiceCanSpeak: boolean;
  voiceWantMic: boolean;
  voiceHands: string[];
  /** 语音房里的人数(含自己;0 = 未连接) */
  voicePeers: number;
  /** 正在说话的 playerId(LiveKit ActiveSpeakers) */
  voiceSpeaking: string[];
  /** 浏览器拦截了远端音频自动播放,需要用户点一下恢复 */
  voiceAudioBlocked: boolean;
  /** 我方麦克风开启失败的原因(权限被拒 / 非 HTTPS 等) */
  voiceMicError: string | null;
}

// ============ 本地持久化(刷新 / 重连恢复,SPEC 5.1) ============

const SESSION_KEY = 'antique.session';

interface Session {
  roomCode: string;
  playerId: string;
  name: string;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null): void {
  if (s === null) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const logsKey = (room: string) => `antique.logs.${room}`;
const roundsKey = (room: string) => `antique.rounds.${room}`;

// ============ store ============

export const useStore = create<AppState>(() => ({
  screen: 'home',
  connected: false,
  roomCode: null,
  playerId: null,
  name: loadSession()?.name ?? '',
  lobby: null,
  view: null,
  logs: [],
  toasts: [],
  roundBeasts: {},
  votedRounds: [],
  guessed: false,
  selectedBeasts: [],
  drawerTab: null,
  voiceEnabled: null,
  voiceStatus: 'off',
  voiceCanSpeak: false,
  voiceWantMic: true,
  voiceHands: [],
  voicePeers: 0,
  voiceSpeaking: [],
  voiceAudioBlocked: false,
  voiceMicError: null,
}));

const set = useStore.setState;
const get = useStore.getState;

let toastSeq = 0;

export function toast(kind: Toast['kind'], text: string, ttl = 4000): void {
  const id = ++toastSeq;
  set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ttl);
}

function pushLog(text: string): void {
  set((s) => {
    const logs = [...s.logs, text].slice(-200);
    const room = s.roomCode;
    if (room) localStorage.setItem(logsKey(room), JSON.stringify(logs));
    return { logs };
  });
}

function nameOf(pid: string): string {
  const { view, lobby } = get();
  return (
    view?.players.find((p) => p.id === pid)?.name ??
    lobby?.members.find((m) => m.playerId === pid)?.name ??
    '???'
  );
}

// ============ socket ============

const SERVER_URL = import.meta.env.VITE_SERVER_URL as string | undefined;
export const socket = SERVER_URL ? io(SERVER_URL, { transports: ['websocket'] }) : io();

function emitAck<T extends Record<string, unknown>>(event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (ack: { ok: boolean; code?: string; message?: string }) => {
      if (ack?.ok) resolve(ack as unknown as T);
      else reject(Object.assign(new Error(ack?.message ?? '未知错误'), { code: ack?.code }));
    });
  });
}

socket.on('connect', () => {
  set({ connected: true });
  // 自动重连:localStorage 里有会话就带 playerId 归位(刷新 / 服务端重启都走这条路)
  const session = loadSession();
  if (session) {
    void doJoin(session.roomCode, session.name, session.playerId, true);
  }
});

socket.on('disconnect', () => {
  set({ connected: false });
});

socket.on('room:sync', (lobby: LobbySync) => {
  set((s) => ({
    lobby,
    // 还没开局就停在大厅;开局后以 state:sync 为准
    screen: s.view || lobby.started ? s.screen : 'lobby',
  }));
});

socket.on('state:sync', (view: PersonalView) => {
  set((s) => {
    const roundBeasts = { ...s.roundBeasts };
    if (view.round.index >= 0) {
      roundBeasts[view.round.index] = view.round.exposedBeasts;
      if (s.roomCode) localStorage.setItem(roundsKey(s.roomCode), JSON.stringify(roundBeasts));
    }
    const myAppraiseStep =
      view.phase === 'ACTION' &&
      view.round.currentActorId === view.me.id &&
      view.round.turnStep === 'APPRAISE';
    return {
      view,
      screen: 'game',
      roundBeasts,
      selectedBeasts: myAppraiseStep ? s.selectedBeasts : [],
    };
  });
});

socket.on('event:log', (ev: PublicEvent) => {
  pushLog(formatEvent(ev, nameOf));
});

socket.on('private:appraisal', (p: { round: number; beastId: BeastId; shown: AppraisalResult }) => {
  toast('info', `鉴定 ${beastName(p.beastId)}:${shownText(p.shown)}`);
});

socket.on('private:investigation', (p: { round: number; targetId: string; camp: Camp }) => {
  toast(
    'alert',
    `查验结果:${nameOf(p.targetId)} 属于「${p.camp === 'EVIL' ? '老朝奉阵营' : '许愿阵营'}」`,
    6000,
  );
});

socket.on('private:sniped', () => {
  toast('alert', '你被药不然偷袭了!本回合无法鉴定、无法发动技能', 6000);
});

socket.on('room:kicked', () => {
  saveSession(null);
  set({
    screen: 'home',
    roomCode: null,
    playerId: null,
    lobby: null,
    view: null,
    logs: [],
    roundBeasts: {},
    votedRounds: [],
    guessed: false,
  });
  toast('alert', '你被房主请离了房间');
});

socket.on('error', (e: { code: string; message: string }) => {
  // 刷新后重复提交的噪音静默处理,只把状态补回来
  if (e.code === 'ALREADY_SUBMITTED') {
    const round = get().view?.round.index;
    if (round !== undefined) {
      set((s) => ({ votedRounds: [...new Set([...s.votedRounds, round])] }));
    }
    return;
  }
  if (e.code === 'ALREADY_GUESSED') {
    set({ guessed: true });
    return;
  }
  toast('error', e.message);
});

// ============ 动作(全部只是转发给服务端) ============

async function doJoin(
  roomCode: string,
  name: string,
  playerId: string | undefined,
  silent: boolean,
): Promise<void> {
  try {
    const res = await emitAck<{ roomCode: string; playerId: string; started: boolean }>(
      'room:join',
      { roomCode, name, playerId },
    );
    saveSession({ roomCode: res.roomCode, playerId: res.playerId, name });
    set({
      roomCode: res.roomCode,
      playerId: res.playerId,
      name,
      logs: loadJson(logsKey(res.roomCode), []),
      roundBeasts: loadJson(roundsKey(res.roomCode), {}),
      screen: res.started ? 'game' : 'lobby',
    });
  } catch (err) {
    if (silent) {
      // 自动重连失败(房间已回收等):清会话回首页
      saveSession(null);
      set({ screen: 'home', roomCode: null, playerId: null, view: null, lobby: null });
    } else {
      toast('error', (err as Error).message);
    }
  }
}

export const actions = {
  async createRoom(name: string): Promise<void> {
    try {
      const res = await emitAck<{ roomCode: string; playerId: string }>('room:create', { name });
      saveSession({ roomCode: res.roomCode, playerId: res.playerId, name });
      set({
        roomCode: res.roomCode,
        playerId: res.playerId,
        name,
        logs: [],
        roundBeasts: {},
        votedRounds: [],
        guessed: false,
        screen: 'lobby',
      });
    } catch (err) {
      toast('error', (err as Error).message);
    }
  },

  async joinRoom(roomCode: string, name: string): Promise<void> {
    // 之前进过同一房间就带 playerId(视为重连),否则新加入
    const session = loadSession();
    const playerId =
      session && session.roomCode === roomCode && session.playerId ? session.playerId : undefined;
    await doJoin(roomCode, name, playerId, false);
  },

  leaveRoom(): void {
    socket.emit('room:leave', {}, () => undefined);
    saveSession(null);
    set({
      screen: 'home',
      roomCode: null,
      playerId: null,
      lobby: null,
      view: null,
      logs: [],
      roundBeasts: {},
      votedRounds: [],
      guessed: false,
    });
  },

  startGame(): void {
    socket.emit('room:start', {}, (ack: { ok: boolean; message?: string }) => {
      if (!ack?.ok) toast('error', ack?.message ?? '开始失败');
    });
  },

  toggleBeast(id: BeastId, max: number): void {
    set((s) => {
      const has = s.selectedBeasts.includes(id);
      let next = has ? s.selectedBeasts.filter((b) => b !== id) : [...s.selectedBeasts, id];
      if (next.length > max) next = next.slice(next.length - max);
      return { selectedBeasts: next };
    });
  },

  appraise(beastIds: BeastId[]): void {
    socket.emit('action:appraise', { beastIds });
    set({ selectedBeasts: [] });
  },

  useSkill(payload: { use: boolean; target?: string | number }): void {
    socket.emit('action:skill', payload);
  },

  passTurn(targetPlayerId: string): void {
    socket.emit('action:pass', { targetPlayerId });
  },

  endSpeech(): void {
    socket.emit('speech:end', {});
  },

  submitVote(distribution: Record<number, number>): void {
    const round = get().view?.round.index;
    socket.emit('vote:submit', { distribution }, (ack: { ok: boolean; message?: string; code?: string }) => {
      if (ack?.ok || ack?.code === 'ALREADY_SUBMITTED') {
        if (round !== undefined) {
          set((s) => ({ votedRounds: [...new Set([...s.votedRounds, round])] }));
        }
      } else if (ack) {
        toast('error', ack.message ?? '押币失败');
      }
    });
  },

  guessIdentity(targetPlayerId: string): void {
    socket.emit('identity:guess', { targetPlayerId }, (ack: { ok: boolean; message?: string; code?: string }) => {
      if (ack?.ok || ack?.code === 'ALREADY_GUESSED') set({ guessed: true });
      else if (ack) toast('error', ack.message ?? '指认失败');
    });
  },

  setDrawer(tab: DrawerTab): void {
    set((s) => ({ drawerTab: s.drawerTab === tab ? null : tab }));
  },

  setName(name: string): void {
    set({ name });
  },

  // ===== 语音:举手 / 给麦(Phase 4+5) =====

  raiseHand(raised: boolean): void {
    socket.emit('voice:raise', { raised }, (ack: { ok: boolean; message?: string }) => {
      if (!ack?.ok) toast('error', ack?.message ?? '举手失败');
    });
  },

  grantMic(targetPlayerId: string): void {
    socket.emit('voice:grant', { targetPlayerId }, (ack: { ok: boolean; message?: string }) => {
      if (!ack?.ok) toast('error', ack?.message ?? '给麦失败');
    });
  },

  // ===== 房主工具(Phase 5) =====

  saveTimers(timersMs: Record<string, number>): void {
    socket.emit('room:config', { timersMs }, (ack: { ok: boolean; message?: string }) => {
      if (ack?.ok) toast('info', '计时已更新');
      else toast('error', ack?.message ?? '更新失败');
    });
  },

  kick(targetPlayerId: string): void {
    socket.emit('room:kick', { targetPlayerId }, (ack: { ok: boolean; message?: string }) => {
      if (!ack?.ok) toast('error', ack?.message ?? '操作失败');
    });
  },

  moveSeat(targetPlayerId: string, direction: -1 | 1): void {
    socket.emit(
      'room:move',
      { targetPlayerId, direction },
      (ack: { ok: boolean; message?: string }) => {
        if (!ack?.ok) toast('error', ack?.message ?? '操作失败');
      },
    );
  },
};
