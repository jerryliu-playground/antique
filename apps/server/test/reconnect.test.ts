/** Phase 2 验收 2:中途随机 kill 掉 3 个客户端再重连,游戏能正常走完(SPEC 5.1) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import { buildServer, type AntiqueServer } from '../src/server';
import { Bot } from './bot';
import { connect, emitAck, makeTempDataDir, removeTempDir, sleep, waitFor } from './helpers';

describe('验收 2:断线重连', () => {
  let server: AntiqueServer;
  let dataDir: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    dataDir = await makeTempDataDir();
    server = await buildServer({ dataDir });
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await server.close();
    await removeTempDir(dataDir);
  });

  it('kill 3 个客户端再重连,整局照常打完', async () => {
    const host = await connect(server.port);
    sockets.push(host);
    const created = await emitAck<{ roomCode: string; playerId: string }>(host, 'room:create', {
      name: '房主',
      timersMs: { reveal: 120 },
    });
    const roomCode = created.roomCode;

    const bots: Bot[] = [new Bot(host, created.playerId)];
    for (let i = 1; i < 8; i++) {
      const s = await connect(server.port);
      sockets.push(s);
      const joined = await emitAck<{ playerId: string }>(s, 'room:join', {
        roomCode,
        name: `玩家${i}`,
      });
      bots.push(new Bot(s, joined.playerId));
    }
    await emitAck(host, 'room:start', {});

    // 打到第 2 轮再下手
    await waitFor(() => bots.some((b) => (b.view?.round.index ?? 0) >= 1), 60_000, '进入第 2 轮');

    // 随机挑 3 个非房主客户端断线(硬断,不走 room:leave)
    const victims = [bots[2], bots[4], bots[6]];
    for (const b of victims) {
      b.active = false;
      b.socket.disconnect();
    }
    await sleep(400);

    // 服务端应已把他们标记为断线
    {
      const g = server.roomManager.get(roomCode)!.game!;
      for (const b of victims) {
        expect(g.players.find((p) => p.id === b.playerId)!.connected).toBe(false);
      }
    }

    // 用原 playerId 重连:先挂监听再 join,join 成功即收到全量 state:sync
    for (const b of victims) {
      const s = await connect(server.port);
      sockets.push(s);
      b.attach(s);
      b.active = true;
      await emitAck(s, 'room:join', { roomCode, name: '重连者', playerId: b.playerId });
      b.tick(); // 若 join 前错过同步,主动用手头视图补一拍
    }

    await waitFor(() => bots.every((b) => b.result !== null), 120_000, '整局打完');

    const g = server.roomManager.get(roomCode)!.game!;
    expect(g.phase).toBe('FINISHED');
    // 重连者最终视图与其他人一致
    expect(JSON.stringify(victims[0].result)).toBe(JSON.stringify(bots[0].result));
  });
});
