import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { ServerError } from './errors';
import { ensureDataDir, loadSnapshots, removeSnapshot } from './persistence';
import { DEFAULT_TIMERS_MS, type TimersMs } from './protocol';
import { Room, type Member } from './room';
import { StatsStore, type StatsRow } from './stats';
import type { VoiceConfig } from './voice';

/** SPEC 5.1:房间在全员断线后保留 30 分钟再销毁 */
const ROOM_TTL_ALL_DISCONNECTED_MS = 30 * 60_000;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout;
  private stats: StatsStore;

  constructor(
    private readonly io: Server,
    private readonly dataDir: string,
    private readonly voice: VoiceConfig | null = null,
  ) {
    this.stats = new StatsStore(dataDir);
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  /** 进程启动时扫描目录恢复房间(SPEC 5.3) */
  async init(): Promise<void> {
    await ensureDataDir(this.dataDir);
    await this.stats.load();
    for (const snap of await loadSnapshots(this.dataDir)) {
      try {
        const room = Room.fromSnapshot(this.io, this.dataDir, snap, this.voice);
        room.onFinished = (r) => this.recordStats(r);
        this.rooms.set(snap.code, room);
      } catch (err) {
        console.error(`恢复房间 ${snap.code} 失败:`, err);
      }
    }
    if (this.rooms.size > 0) {
      console.log(`已从快照恢复 ${this.rooms.size} 个房间`);
    }
  }

  private recordStats(room: Room): void {
    if (room.game) this.stats.record(room.game);
  }

  statsSummary(): { totalGames: number; players: StatsRow[] } {
    return { totalGames: this.stats.totalGames, players: this.stats.summary() };
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  require(code: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new ServerError('ROOM_NOT_FOUND', `房间 ${code} 不存在`);
    return room;
  }

  createRoom(
    hostName: string,
    socketId: string,
    timersMs?: Partial<TimersMs>,
  ): { room: Room; member: Member } {
    let code = '';
    do {
      code = String(Math.floor(100000 + Math.random() * 900000)); // 6 位房号
    } while (this.rooms.has(code));

    const room = new Room(
      this.io,
      this.dataDir,
      code,
      '',
      [],
      { ...DEFAULT_TIMERS_MS, ...timersMs },
      this.voice,
    );
    room.onFinished = (r) => this.recordStats(r);
    this.rooms.set(code, room);
    const member = room.addMember(hostName, randomUUID(), socketId);
    room.hostId = member.playerId;
    room.scheduleSave();
    return { room, member };
  }

  /** 带 playerId 且在房内 → 重连;否则新加入(SPEC 4.1 room:join) */
  join(
    code: string,
    name: string,
    playerId: string | undefined,
    socketId: string,
  ): { room: Room; member: Member; rejoined: boolean } {
    const room = this.require(code);
    if (playerId && room.memberById(playerId)) {
      return { room, member: room.reconnect(playerId, socketId), rejoined: true };
    }
    const member = room.addMember(name, playerId ?? randomUUID(), socketId);
    return { room, member, rejoined: false };
  }

  handleDisconnect(socketId: string): void {
    for (const room of this.rooms.values()) room.handleDisconnect(socketId);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (
        room.allDisconnectedSince !== null &&
        now - room.allDisconnectedSince > ROOM_TTL_ALL_DISCONNECTED_MS
      ) {
        this.destroy(code);
      }
    }
  }

  destroy(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.dispose();
    this.rooms.delete(code);
    void removeSnapshot(this.dataDir, code);
  }

  async shutdown(): Promise<void> {
    clearInterval(this.sweeper);
    for (const room of this.rooms.values()) {
      room.dispose();
      await room.flushSave();
    }
  }
}
