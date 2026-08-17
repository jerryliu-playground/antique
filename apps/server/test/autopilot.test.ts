/** SPEC 5.2 计时与托管:全员挂机,服务端把整局自动打完 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import { buildServer, type AntiqueServer } from '../src/server';
import { connect, emitAck, makeTempDataDir, removeTempDir, waitFor } from './helpers';

describe('计时托管', () => {
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

  it('6 人全员挂机,超时托管自动打完三轮', async () => {
    const host = await connect(server.port);
    sockets.push(host);
    const created = await emitAck<{ roomCode: string; playerId: string }>(host, 'room:create', {
      name: '挂机房主',
      // 计时全部调到最短档,验证:行动托管 / 发言自动切 / 押币 0 票 / 身份揭示按没猜中
      timersMs: { action: 200, speech: 120, voting: 300, reveal: 80, identity: 250 },
    });
    const roomCode = created.roomCode;

    for (let i = 1; i < 6; i++) {
      const s = await connect(server.port);
      sockets.push(s);
      await emitAck(s, 'room:join', { roomCode, name: `挂机${i}` });
    }
    await emitAck(host, 'room:start', {});

    const room = server.roomManager.get(roomCode)!;
    await waitFor(() => room.game?.phase === 'FINISHED', 120_000, '托管整局');

    const g = room.game!;
    expect(g.rounds).toHaveLength(3);
    expect(g.beasts.filter((b) => b.protectedRound !== null)).toHaveLength(6);
    // 全员没投票 → 筹码原封不动
    for (const p of g.players) expect(p.chips).toBe(6);
    // 托管的鉴定真实发生了:每轮每人一条记录(方震除外)
    const fangZhen = g.players.find((p) => p.role === 'FANG_ZHEN')!;
    expect(g.appraisalLog.filter((e) => e.playerId === fangZhen.id)).toHaveLength(0);
    for (const p of g.players) {
      if (p.id === fangZhen.id) continue;
      const perRound = g.appraisalLog.filter((e) => e.playerId === p.id);
      const expected = p.role === 'XU_YUAN' ? 6 : 3;
      expect(perRound).toHaveLength(expected);
    }
    // 无人指认 → 老朝奉/药不然都算没猜中
    expect(g.result!.breakdown.xuYuanSurvivedBonus).toBe(2);
    expect(g.result!.breakdown.fangZhenSurvivedBonus).toBe(1);
  });
});
