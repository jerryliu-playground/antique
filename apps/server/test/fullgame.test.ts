/** Phase 2 验收 1:用 Node 脚本模拟 8 个 socket 客户端,全自动打完一整局 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import { buildServer, type AntiqueServer } from '../src/server';
import { Bot } from './bot';
import { connect, emitAck, makeTempDataDir, removeTempDir, waitFor } from './helpers';

describe('验收 1:8 客户端全自动整局', () => {
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

  it('8 人从建房到 FINISHED', async () => {
    const host = await connect(server.port);
    sockets.push(host);
    const created = await emitAck<{ roomCode: string; playerId: string }>(host, 'room:create', {
      name: '房主',
      timersMs: { reveal: 120 }, // 开票展示调短,其余用默认(机器人不会触发超时)
    });

    const bots: Bot[] = [new Bot(host, created.playerId)];
    for (let i = 1; i < 8; i++) {
      const s = await connect(server.port);
      sockets.push(s);
      const joined = await emitAck<{ playerId: string }>(s, 'room:join', {
        roomCode: created.roomCode,
        name: `玩家${i}`,
      });
      bots.push(new Bot(s, joined.playerId));
    }

    await emitAck(host, 'room:start', {});
    await waitFor(() => bots.every((b) => b.result !== null), 90_000, '整局打完');

    // 所有客户端拿到同一份结果
    const result = bots[0].result!;
    expect(['GOOD', 'EVIL']).toContain(result.winner);
    expect(result.reveal.roles).toHaveLength(8);
    expect(result.reveal.beasts).toHaveLength(12);
    for (const b of bots) {
      expect(JSON.stringify(b.result)).toBe(JSON.stringify(result));
    }

    // 服务端状态一致:三轮打满、保护 6 件
    const room = server.roomManager.get(created.roomCode)!;
    expect(room.game!.phase).toBe('FINISHED');
    expect(room.game!.rounds).toHaveLength(3);
    expect(room.game!.beasts.filter((b) => b.protectedRound !== null)).toHaveLength(6);

    // 机器人没有遇到非预期错误(重连噪音类此局不该出现)
    for (const b of bots) {
      expect(b.errors).toEqual([]);
    }
  });
});
