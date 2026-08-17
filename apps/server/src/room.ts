/**
 * 单个房间:大厅成员管理 + 对局状态推进 + 定向下发 + 计时托管 + 快照。
 *
 * 铁律 1/2:所有规则计算都在 shared 引擎里;下发只有两条通道——
 * 房间广播的 event:log(纯公开事件)与按人构造的 state:sync(PersonalView 定向 emit)。
 * 绝不广播含私有字段的对象。
 */
import {
  appraiseCountFor,
  initGame,
  reduce,
  toPersonalView,
  type GameAction,
  type GameEvent,
  type GameState,
  type Phase,
} from '@antique/shared';
import type { Server } from 'socket.io';
import { ServerError } from './errors';
import { saveSnapshot, type RoomSnapshot } from './persistence';
import { DEFAULT_TIMERS_MS, type LobbySyncPayload, type TimersMs } from './protocol';
import {
  canPublish,
  micPolicy,
  mintToken,
  policyKey,
  type VoiceConfig,
  type VoiceTokenPayload,
} from './voice';

export interface Member {
  playerId: string;
  name: string;
  socketId: string | null;
  connected: boolean;
}

const SAVE_DEBOUNCE_MS = 500; // SPEC 5.3

export class Room {
  game: GameState | null = null;
  /** 全员断线的起始时刻,RoomManager 据此在 30 分钟后回收(SPEC 5.1) */
  allDisconnectedSince: number | null = null;

  private timer: { key: string; deadline: number; handle: NodeJS.Timeout } | null = null;
  private saveHandle: NodeJS.Timeout | null = null;
  private dirty = false;

  /** 语音:举手名单 + 临时给麦(基础麦权变化时临时麦清空) */
  raisedHands = new Set<string>();
  private tempMicGrants = new Set<string>();
  private lastVoiceBaseKey: string | null = null;

  /** 回放:开局配置 + 完整 action 序列(Phase 5;同 seed + 同序列必然重放出同一局) */
  gameInit: { seed: number; players: { id: string; name: string }[] } | null = null;
  actionLog: { at: number; action: GameAction }[] = [];
  /** 终局回调(RoomManager 用来记战绩),只触发一次 */
  onFinished: ((room: Room) => void) | null = null;
  private finishedNotified = false;

  constructor(
    private readonly io: Server,
    private readonly dataDir: string,
    public readonly code: string,
    public hostId: string,
    public members: Member[],
    public timersMs: TimersMs,
    private readonly voice: VoiceConfig | null = null,
  ) {}

  static fromSnapshot(
    io: Server,
    dataDir: string,
    snap: RoomSnapshot,
    voice: VoiceConfig | null = null,
  ): Room {
    const members: Member[] = snap.members.map((m) => ({
      playerId: m.playerId,
      name: m.name,
      socketId: null,
      connected: false,
    }));
    const room = new Room(
      io,
      dataDir,
      snap.code,
      snap.hostId,
      members,
      { ...DEFAULT_TIMERS_MS, ...snap.timersMs },
      voice,
    );
    room.game = snap.game;
    room.gameInit = snap.gameInit ?? null;
    room.actionLog = snap.actionLog ?? [];
    room.finishedNotified = room.game?.phase === 'FINISHED'; // 旧局不重复记战绩
    room.allDisconnectedSince = Date.now();
    if (room.game && room.game.phase !== 'FINISHED') {
      // 重启后所有人视为断线,重连时再翻回来;计时从重启时刻重新起算
      for (const p of room.game.players) {
        room.applyRaw({ type: 'SET_CONNECTED', playerId: p.id, connected: false });
      }
      room.armTimer();
    }
    return room;
  }

  // ============ 大厅 ============

  memberById(playerId: string): Member | undefined {
    return this.members.find((m) => m.playerId === playerId);
  }

  memberBySocket(socketId: string): Member | undefined {
    return this.members.find((m) => m.socketId === socketId);
  }

  addMember(name: string, playerId: string, socketId: string): Member {
    if (this.game) throw new ServerError('GAME_STARTED', '对局已开始,只能用原 playerId 重连');
    if (this.members.length >= 8) throw new ServerError('ROOM_FULL', '房间已满(8 人)');
    const member: Member = { playerId, name, socketId, connected: true };
    this.members.push(member);
    this.onPresenceChange();
    return member;
  }

  /** SPEC 5.1:重连 —— 匹配 playerId,connected = true,调用方随后立即全量重推 */
  reconnect(playerId: string, socketId: string): Member {
    const m = this.memberById(playerId);
    if (!m) throw new ServerError('UNKNOWN_PLAYER', '该 playerId 不在本房间');
    m.socketId = socketId;
    m.connected = true;
    if (this.game) {
      this.apply({ type: 'SET_CONNECTED', playerId, connected: true });
    } else {
      this.onPresenceChange();
    }
    return m;
  }

  leaveLobby(playerId: string): void {
    if (this.game) throw new ServerError('GAME_STARTED', '对局中不能退出房间(断线会自动托管)');
    this.members = this.members.filter((m) => m.playerId !== playerId);
    if (this.hostId === playerId && this.members.length > 0) {
      this.hostId = this.members[0].playerId;
    }
    this.onPresenceChange();
  }

  handleDisconnect(socketId: string): void {
    const m = this.memberBySocket(socketId);
    if (!m) return;
    m.socketId = null;
    m.connected = false;
    if (this.game) {
      this.apply({ type: 'SET_CONNECTED', playerId: m.playerId, connected: false });
    } else {
      this.onPresenceChange();
    }
    this.broadcastLobby();
  }

  private refreshPresence(): void {
    if (this.members.some((m) => m.connected)) {
      this.allDisconnectedSince = null;
    } else if (this.allDisconnectedSince === null) {
      this.allDisconnectedSince = Date.now();
    }
  }

  private onPresenceChange(): void {
    this.refreshPresence();
    this.broadcastLobby();
    this.scheduleSave();
  }

  broadcastLobby(): void {
    const payload: LobbySyncPayload = {
      roomCode: this.code,
      hostId: this.hostId,
      started: this.game !== null,
      members: this.members.map((m, i) => ({
        playerId: m.playerId,
        name: m.name,
        seat: i,
        connected: m.connected,
      })),
      timersMs: this.timersMs,
    };
    this.io.to(this.code).emit('room:sync', payload);
  }

  // ============ 对局 ============

  start(byPlayerId: string): void {
    if (this.game) throw new ServerError('GAME_STARTED', '对局已开始');
    if (byPlayerId !== this.hostId) throw new ServerError('HOST_ONLY', '只有房主能开始游戏');
    if (this.members.length < 6 || this.members.length > 8) {
      throw new ServerError('BAD_PLAYER_COUNT', `需要 6–8 名玩家,当前 ${this.members.length} 人`);
    }

    const seed = Math.floor(Math.random() * 2 ** 31); // 种子进 state,整局可重放
    const players = this.members.map((m) => ({ id: m.playerId, name: m.name }));
    const { state, events } = initGame({ roomCode: this.code, seed, players });
    this.game = state;
    this.gameInit = { seed, players };
    this.actionLog = [];
    this.finishedNotified = false;
    for (const m of this.members) {
      if (!m.connected) {
        this.applyRaw({ type: 'SET_CONNECTED', playerId: m.playerId, connected: false });
      }
    }
    this.broadcastLobby(); // started 翻转
    this.afterChange(events);
  }

  /** 来自玩家 socket 的对局动作(playerId 由 wireSocket 从会话注入,客户端伪造不了) */
  act(action: GameAction): void {
    if (!this.game) throw new ServerError('GAME_NOT_STARTED', '对局尚未开始');
    this.apply(action);
  }

  /** 应用动作但不触发下发(初始化/恢复路径专用),依然记入回放日志 */
  private applyRaw(action: GameAction): void {
    if (!this.game) return;
    this.game = reduce(this.game, action).state;
    this.actionLog.push({ at: Date.now(), action });
  }

  private apply(action: GameAction): void {
    if (!this.game) return;
    const { state, events } = reduce(this.game, action);
    this.game = state;
    this.actionLog.push({ at: Date.now(), action });
    this.afterChange(events);
  }

  private afterChange(events: GameEvent[]): void {
    this.refreshPresence();
    this.armTimer(); // 先定 deadline,syncAll 才能带上
    this.dispatchEvents(events);
    this.syncAll();
    this.syncVoice();
    this.scheduleSave();
    if (this.game?.phase === 'FINISHED' && !this.finishedNotified) {
      this.finishedNotified = true;
      this.onFinished?.(this);
    }
  }

  private dispatchEvents(events: GameEvent[]): void {
    for (const ev of events) {
      switch (ev.kind) {
        case 'PUBLIC':
          this.io.to(this.code).emit('event:log', ev.event);
          break;
        case 'PRIVATE_APPRAISAL':
          this.emitTo(ev.toPlayerId, 'private:appraisal', {
            round: ev.round,
            beastId: ev.beastId,
            shown: ev.shown,
          });
          break;
        case 'PRIVATE_INVESTIGATION':
          this.emitTo(ev.toPlayerId, 'private:investigation', {
            round: ev.round,
            targetId: ev.targetId,
            camp: ev.camp,
          });
          break;
        case 'PRIVATE_SNIPED':
          this.emitTo(ev.toPlayerId, 'private:sniped', {});
          break;
      }
    }
  }

  private emitTo(playerId: string, event: string, payload: unknown): void {
    const sid = this.memberById(playerId)?.socketId;
    if (sid) this.io.to(sid).emit(event, payload);
  }

  syncAll(): void {
    for (const m of this.members) this.syncTo(m.playerId);
  }

  /** 按人构造 PersonalView 定向下发(铁律 2:唯一的状态下发通道) */
  syncTo(playerId: string): void {
    if (!this.game) return;
    const m = this.memberById(playerId);
    if (!m?.socketId || !m.connected) return;
    this.io
      .to(m.socketId)
      .emit('state:sync', toPersonalView(this.game, playerId, this.timer?.deadline ?? null));
  }

  // ============ 语音麦序(SPEC 6.2)============

  private voicePhase(): Phase {
    return this.game?.phase ?? 'LOBBY';
  }

  private voiceSpeaker(): string | null {
    if (!this.game) return null;
    return this.game.rounds[this.game.currentRound]?.currentSpeakerId ?? null;
  }

  /** 阶段/发言者/临时麦变化时,给全员重发 voice:token */
  syncVoice(): void {
    const phase = this.voicePhase();
    const speaker = this.voiceSpeaker();

    // 基础麦权一变,临时给麦立刻过期
    const baseKey = `${phase}:${speaker ?? ''}`;
    if (baseKey !== this.lastVoiceBaseKey) {
      this.lastVoiceBaseKey = baseKey;
      this.tempMicGrants.clear();
    }

    const key = policyKey(phase, speaker, this.tempMicGrants);
    if (key === this.voiceKeySent) return;
    this.voiceKeySent = key;
    for (const m of this.members) {
      if (m.connected && m.socketId) void this.sendVoiceToken(m, phase, speaker, key);
    }
  }

  private voiceKeySent: string | null = null;

  /** 单发(加入/重连时补发当前策略的 token) */
  syncVoiceTo(playerId: string): void {
    const m = this.memberById(playerId);
    if (!m?.socketId) return;
    const phase = this.voicePhase();
    const speaker = this.voiceSpeaker();
    void this.sendVoiceToken(m, phase, speaker, policyKey(phase, speaker, this.tempMicGrants));
  }

  private async sendVoiceToken(
    m: Member,
    phase: Phase,
    speaker: string | null,
    key: string,
  ): Promise<void> {
    const sid = m.socketId;
    if (!sid) return;
    const publish = canPublish(micPolicy(phase, speaker), m.playerId, this.tempMicGrants);
    let payload: VoiceTokenPayload;
    if (this.voice === null) {
      // 降级(SPEC 6.4):语音未配置,游戏照常
      payload = { enabled: false, canPublish: false, policyKey: key, phase };
    } else {
      try {
        const token = await mintToken(this.voice, this.code, m.playerId, m.name, publish);
        payload = {
          enabled: true,
          url: this.voice.url,
          token,
          canPublish: publish,
          policyKey: key,
          phase,
        };
      } catch (err) {
        console.error(`[room ${this.code}] 签发语音 token 失败:`, err);
        return;
      }
    }
    this.io.to(sid).emit('voice:token', payload);
  }

  /** 举手(SPEC 6.2:非发言者可举手) */
  raiseHand(playerId: string, raised: boolean): void {
    if (!this.memberById(playerId)) throw new ServerError('UNKNOWN_PLAYER', '不在本房间');
    if (raised) this.raisedHands.add(playerId);
    else this.raisedHands.delete(playerId);
    this.broadcastHands();
  }

  /** 临时给麦:当前发言者或房主才有权;基础麦权变化时自动过期 */
  grantMic(byPlayerId: string, targetPlayerId: string): void {
    const speaker = this.voiceSpeaker();
    if (byPlayerId !== this.hostId && byPlayerId !== speaker) {
      throw new ServerError('NOT_ALLOWED', '只有当前发言者或房主可以临时给麦');
    }
    const target = this.memberById(targetPlayerId);
    if (!target) throw new ServerError('UNKNOWN_PLAYER', '目标玩家不在本房间');
    this.tempMicGrants.add(targetPlayerId);
    this.raisedHands.delete(targetPlayerId);
    this.broadcastHands();
    this.syncVoice();
  }

  private broadcastHands(): void {
    this.io.to(this.code).emit('voice:hands', { playerIds: [...this.raisedHands] });
  }

  // ============ 计时与托管(SPEC 5.2) ============

  private timerSpec(): { key: string; ms: number } | null {
    const g = this.game;
    if (!g) return null;
    const round = g.rounds[g.currentRound];
    switch (g.phase) {
      case 'ACTION':
        return { key: `A:${g.currentRound}:${round.currentActorId}`, ms: this.timersMs.action };
      case 'SPEECH':
        return { key: `S:${g.currentRound}:${round.currentSpeakerId}`, ms: this.timersMs.speech };
      case 'VOTING':
        return { key: `V:${g.currentRound}`, ms: this.timersMs.voting };
      case 'REVEAL':
        return { key: `R:${g.currentRound}`, ms: this.timersMs.reveal };
      case 'IDENTITY':
        return { key: 'I', ms: this.timersMs.identity };
      default:
        return null;
    }
  }

  armTimer(): void {
    const spec = this.timerSpec();
    if (!spec) {
      this.clearTimer();
      return;
    }
    if (this.timer?.key === spec.key) return; // 同一计时对象不重置
    this.clearTimer();
    const handle = setTimeout(() => this.onTimeout(spec.key), spec.ms);
    handle.unref();
    this.timer = { key: spec.key, deadline: Date.now() + spec.ms, handle };
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer.handle);
      this.timer = null;
    }
  }

  private onTimeout(key: string): void {
    if (this.timer?.key !== key || !this.game) return;
    this.timer = null;
    const g = this.game;
    try {
      switch (g.phase) {
        case 'ACTION':
          this.autoPlayTurn();
          break;
        case 'SPEECH': {
          const speaker = g.rounds[g.currentRound].currentSpeakerId;
          if (speaker) this.apply({ type: 'SPEECH_END', playerId: speaker });
          break;
        }
        case 'VOTING':
          this.apply({ type: 'VOTE_FINALIZE' }); // 未提交者视为投 0 票
          break;
        case 'REVEAL':
          this.apply({ type: 'REVEAL_CONTINUE' });
          break;
        case 'IDENTITY':
          this.apply({ type: 'IDENTITY_FINALIZE' }); // 未指认视为没猜中
          break;
        default:
          break;
      }
    } catch (err) {
      // 托管出错不能打死进程;重新武装计时器兜底
      console.error(`[room ${this.code}] 托管失败:`, err);
      this.armTimer();
    }
  }

  /** SPEC 5.2 托管:随机鉴定未鉴过的(许愿 2 件)、不发动技能、随机派票 */
  private autoPlayTurn(): void {
    let g = this.game;
    if (!g || g.phase !== 'ACTION') return;
    let round = g.rounds[g.currentRound];
    const pid = round.currentActorId;
    if (!pid) return;
    const player = g.players.find((p) => p.id === pid);
    if (!player) return;

    if (round.turnStep === 'APPRAISE') {
      const count = appraiseCountFor(player.role);
      const done = new Set(
        g.appraisalLog
          .filter((e) => e.round === g!.currentRound && e.playerId === pid)
          .map((e) => e.beastId),
      );
      const candidates = round.exposedBeasts.filter((b) => !done.has(b));
      this.apply({ type: 'APPRAISE', playerId: pid, beastIds: shuffled(candidates).slice(0, count) });
    }

    g = this.game;
    if (!g) return;
    round = g.rounds[g.currentRound];
    if (g.phase === 'ACTION' && round.currentActorId === pid && round.turnStep === 'SKILL') {
      this.apply({ type: 'SKILL', playerId: pid, use: false });
    }

    g = this.game;
    if (!g) return;
    round = g.rounds[g.currentRound];
    if (g.phase === 'ACTION' && round.currentActorId === pid && round.turnStep === 'PASS') {
      const candidates = g.players.filter((p) => !round.actionOrder.includes(p.id));
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      if (target) this.apply({ type: 'PASS_TURN', playerId: pid, targetPlayerId: target.id });
    }
  }

  // ============ 房主工具(Phase 5) ============

  private requireHostInLobby(byPlayerId: string, what: string): void {
    if (byPlayerId !== this.hostId) throw new ServerError('HOST_ONLY', `只有房主能${what}`);
    if (this.game) throw new ServerError('GAME_STARTED', `对局开始后不能${what}`);
  }

  /** 房主在大厅调整各阶段计时(SPEC 5.2:时长写在房间配置里,房主可调) */
  updateTimers(byPlayerId: string, patch: Partial<TimersMs>): void {
    this.requireHostInLobby(byPlayerId, '调整计时');
    this.timersMs = { ...this.timersMs, ...patch };
    this.broadcastLobby();
    this.scheduleSave();
  }

  /** 房主踢人(仅大厅) */
  kick(byPlayerId: string, targetPlayerId: string): void {
    this.requireHostInLobby(byPlayerId, '请人离席');
    if (targetPlayerId === byPlayerId) throw new ServerError('BAD_TARGET', '不能踢自己');
    const target = this.memberById(targetPlayerId);
    if (!target) throw new ServerError('UNKNOWN_PLAYER', '目标玩家不在本房间');
    if (target.socketId) {
      this.io.to(target.socketId).emit('room:kicked', {});
      this.io.sockets.sockets.get(target.socketId)?.leave(this.code);
    }
    this.members = this.members.filter((m) => m.playerId !== targetPlayerId);
    this.onPresenceChange();
  }

  /** 房主换座(仅大厅):把目标玩家往前/往后挪一位 */
  moveSeat(byPlayerId: string, targetPlayerId: string, direction: -1 | 1): void {
    this.requireHostInLobby(byPlayerId, '调整座位');
    const i = this.members.findIndex((m) => m.playerId === targetPlayerId);
    if (i < 0) throw new ServerError('UNKNOWN_PLAYER', '目标玩家不在本房间');
    const j = i + direction;
    if (j < 0 || j >= this.members.length) return; // 到边界了,忽略
    [this.members[i], this.members[j]] = [this.members[j], this.members[i]];
    this.broadcastLobby();
    this.scheduleSave();
  }

  // ============ 快照(SPEC 5.3) ============

  toSnapshot(): RoomSnapshot {
    return {
      code: this.code,
      hostId: this.hostId,
      timersMs: this.timersMs,
      members: this.members.map((m) => ({ playerId: m.playerId, name: m.name })),
      game: this.game,
      gameInit: this.gameInit,
      actionLog: this.actionLog,
      savedAt: Date.now(),
    };
  }

  scheduleSave(): void {
    this.dirty = true;
    if (this.saveHandle) return;
    this.saveHandle = setTimeout(() => {
      this.saveHandle = null;
      void this.flushSave();
    }, SAVE_DEBOUNCE_MS);
    this.saveHandle.unref();
  }

  async flushSave(): Promise<void> {
    if (this.saveHandle) {
      clearTimeout(this.saveHandle);
      this.saveHandle = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await saveSnapshot(this.dataDir, this.toSnapshot());
    } catch (err) {
      console.error(`[room ${this.code}] 快照写入失败:`, err);
    }
  }

  dispose(): void {
    this.clearTimer();
    if (this.saveHandle) {
      clearTimeout(this.saveHandle);
      this.saveHandle = null;
    }
  }
}

function shuffled<T>(items: readonly T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
