/** Phase 5:房主工具(调计时/踢人/换座)+ 战绩统计 + 回放校验 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import type { LobbySyncPayload } from '../src/protocol';
import type { RoomSnapshot } from '../src/persistence';
import { replaySnapshot } from '../src/replay';
import { buildServer, type AntiqueServer } from '../src/server';
import { connect, emitAck, makeTempDataDir, removeTempDir, waitFor } from './helpers';
import type { StatsRow } from '../src/stats';

describe('Phase 5', () => {
  let server: AntiqueServer;
  let dataDir: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    dataDir = await makeTempDataDir();
    server = await buildServer({ dataDir, voice: null });
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await server.close();
    await removeTempDir(dataDir);
  });

  it('房主调计时 / 踢人 / 换座;非房主一律被拒', async () => {
    const host = await connect(server.port);
    sockets.push(host);
    const lobbies: LobbySyncPayload[] = [];
    host.on('room:sync', (p: LobbySyncPayload) => lobbies.push(p));
    const created = await emitAck<{ roomCode: string; playerId: string }>(host, 'room:create', {
      name: '房主',
    });

    const guest = await connect(server.port);
    sockets.push(guest);
    let kicked = false;
    guest.on('room:kicked', () => (kicked = true));
    const joined = await emitAck<{ playerId: string }>(guest, 'room:join', {
      roomCode: created.roomCode,
      name: '客人',
    });
    const guest2 = await connect(server.port);
    sockets.push(guest2);
    const joined2 = await emitAck<{ playerId: string }>(guest2, 'room:join', {
      roomCode: created.roomCode,
      name: '客人乙',
    });

    const room = server.roomManager.get(created.roomCode)!;

    // 调计时:非房主拒绝,房主生效并广播
    await expect(
      emitAck(guest, 'room:config', { timersMs: { action: 30_000 } }),
    ).rejects.toThrow(/房主/);
    await emitAck(host, 'room:config', { timersMs: { action: 30_000, speech: 45_000 } });
    expect(room.timersMs.action).toBe(30_000);
    expect(room.timersMs.speech).toBe(45_000);
    await waitFor(
      () => lobbies.some((l) => l.timersMs.action === 30_000),
      5_000,
      '大厅广播新计时',
    );

    // 换座:客人乙(座位 2)往前挪到座位 1
    await expect(
      emitAck(guest, 'room:move', { targetPlayerId: joined2.playerId, direction: -1 }),
    ).rejects.toThrow(/房主/);
    await emitAck(host, 'room:move', { targetPlayerId: joined2.playerId, direction: -1 });
    expect(room.members.map((m) => m.playerId)).toEqual([
      created.playerId,
      joined2.playerId,
      joined.playerId,
    ]);

    // 踢人:非房主拒绝,房主踢客人 → 对方收到 room:kicked
    await expect(
      emitAck(guest, 'room:kick', { targetPlayerId: joined2.playerId }),
    ).rejects.toThrow(/房主/);
    await emitAck(host, 'room:kick', { targetPlayerId: joined.playerId });
    await waitFor(() => kicked, 5_000, '被踢通知');
    expect(room.memberById(joined.playerId)).toBeUndefined();
  });

  it('整局打完:战绩入账 + 快照可完整重放且逐字节一致', async () => {
    const host = await connect(server.port);
    sockets.push(host);
    const created = await emitAck<{ roomCode: string; playerId: string }>(host, 'room:create', {
      name: '统计房主',
      timersMs: { action: 200, speech: 120, voting: 300, reveal: 80, identity: 250 },
    });
    for (let i = 1; i < 6; i++) {
      const s = await connect(server.port);
      sockets.push(s);
      await emitAck(s, 'room:join', { roomCode: created.roomCode, name: `挂机${i}` });
    }
    await emitAck(host, 'room:start', {});

    const room = server.roomManager.get(created.roomCode)!;
    await waitFor(() => room.game?.phase === 'FINISHED', 120_000, '托管整局');

    // 战绩:6 人都记了 1 局,胜者阵营的人记了 1 胜
    const { stats } = await emitAck<{ stats: { totalGames: number; players: StatsRow[] } }>(
      host,
      'stats:get',
      {},
    );
    expect(stats.totalGames).toBe(1);
    expect(stats.players).toHaveLength(6);
    for (const p of stats.players) expect(p.games).toBe(1);
    const winners = stats.players.filter((p) => p.wins === 1);
    const winnerCamp = room.game!.result!.winner;
    const expectedWinners = room.game!.players.filter((p) => p.camp === winnerCamp).length;
    expect(winners).toHaveLength(expectedWinners);

    // 回放:落盘快照 → seed + action 序列重放 → 与实际状态逐字节一致
    await room.flushSave();
    const snap = JSON.parse(
      await readFile(join(dataDir, `${created.roomCode}.json`), 'utf8'),
    ) as RoomSnapshot;
    expect(snap.gameInit).toBeTruthy();
    expect((snap.actionLog ?? []).length).toBeGreaterThan(20);

    const replayed = replaySnapshot(snap);
    expect(replayed.finalState.phase).toBe('FINISHED');
    expect(replayed.matchesSnapshot).toBe(true);
  });
});
