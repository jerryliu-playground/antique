/** Phase 2 验收 3:中途 kill 掉服务端进程重启,房间能从快照恢复继续(SPEC 5.3) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import { buildServer, type AntiqueServer } from '../src/server';
import { Bot } from './bot';
import { connect, emitAck, makeTempDataDir, removeTempDir, waitFor } from './helpers';

describe('验收 3:服务端重启恢复', () => {
  let dataDir: string;
  let server2: AntiqueServer | null = null;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    dataDir = await makeTempDataDir();
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await server2?.close();
    await removeTempDir(dataDir);
  });

  it('打到中局 → 停服 → 从快照重启 → 重连打完', async () => {
    // ---- 第一个服务端进程 ----
    const server1 = await buildServer({ dataDir });

    const host = await connect(server1.port);
    sockets.push(host);
    const created = await emitAck<{ roomCode: string; playerId: string }>(host, 'room:create', {
      name: '房主',
      timersMs: { reveal: 120 },
    });
    const roomCode = created.roomCode;

    const bots: Bot[] = [new Bot(host, created.playerId)];
    for (let i = 1; i < 8; i++) {
      const s = await connect(server1.port);
      sockets.push(s);
      const joined = await emitAck<{ playerId: string }>(s, 'room:join', {
        roomCode,
        name: `玩家${i}`,
      });
      bots.push(new Bot(s, joined.playerId));
    }
    await emitAck(host, 'room:start', {});

    // 打到第 2 轮,模拟服务端崩溃
    await waitFor(() => bots.some((b) => (b.view?.round.index ?? 0) >= 1), 60_000, '进入第 2 轮');
    const progressBefore = server1.roomManager.get(roomCode)!.game!.currentRound;

    for (const b of bots) {
      b.active = false;
      b.socket.disconnect();
    }
    await server1.close(); // shutdown 内部会把待写快照全部落盘

    // ---- 重启:新进程扫描同一目录 ----
    server2 = await buildServer({ dataDir });
    const restored = server2.roomManager.get(roomCode);
    expect(restored).toBeDefined();
    expect(restored!.game).not.toBeNull();
    expect(restored!.game!.currentRound).toBeGreaterThanOrEqual(progressBefore);
    // 恢复后全员视为断线
    for (const p of restored!.game!.players) {
      expect(p.connected).toBe(false);
    }

    // 全员用原 playerId 重连并把整局打完
    for (const b of bots) {
      const s = await connect(server2.port);
      sockets.push(s);
      b.attach(s);
      b.active = true;
      await emitAck(s, 'room:join', { roomCode, name: '重连者', playerId: b.playerId });
      b.tick();
    }

    await waitFor(() => bots.every((b) => b.result !== null), 120_000, '重启后整局打完');
    expect(server2.roomManager.get(roomCode)!.game!.phase).toBe('FINISHED');
  });
});
