/** Phase 4:麦序控制(SPEC 6.2)——策略、token 内容、全流程 token 下发、举手/给麦 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import { canPublish, micPolicy, mintToken, policyKey, type VoiceTokenPayload } from '../src/voice';
import { buildServer, type AntiqueServer } from '../src/server';
import { connect, emitAck, makeTempDataDir, removeTempDir, waitFor } from './helpers';

const DUMMY_VOICE = {
  url: 'wss://test.livekit.local',
  apiKey: 'devkey',
  apiSecret: 'devsecret-devsecret-devsecret-32chars',
};

function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('麦权策略(SPEC 6.2)', () => {
  it('LOBBY / REVEAL / FINISHED 全员自由', () => {
    for (const phase of ['LOBBY', 'REVEAL', 'FINISHED'] as const) {
      expect(micPolicy(phase, null)).toEqual({ mode: 'ALL' });
    }
  });

  it('ACTION / VOTING / IDENTITY 全员静音', () => {
    for (const phase of ['ACTION', 'VOTING', 'IDENTITY'] as const) {
      expect(micPolicy(phase, null)).toEqual({ mode: 'NONE' });
    }
  });

  it('SPEECH 仅当前发言者', () => {
    expect(micPolicy('SPEECH', 'p3')).toEqual({ mode: 'ONLY', playerId: 'p3' });
    expect(canPublish(micPolicy('SPEECH', 'p3'), 'p3')).toBe(true);
    expect(canPublish(micPolicy('SPEECH', 'p3'), 'p4')).toBe(false);
  });

  it('临时给麦叠加在静音阶段之上', () => {
    const grants = new Set(['p9']);
    expect(canPublish(micPolicy('ACTION', null), 'p9', grants)).toBe(true);
    expect(canPublish(micPolicy('ACTION', null), 'p1', grants)).toBe(false);
    // 临时麦名单变化会改变 policyKey → 触发重发
    expect(policyKey('ACTION', null, grants)).not.toBe(policyKey('ACTION', null, new Set()));
  });
});

describe('LiveKit token 签发', () => {
  it('token 里带正确的房间与发布权限', async () => {
    const canSpeak = decodeJwt(await mintToken(DUMMY_VOICE, '123456', 'pX', '张三', true));
    const muted = decodeJwt(await mintToken(DUMMY_VOICE, '123456', 'pY', '李四', false));

    expect(canSpeak.sub).toBe('pX');
    expect(canSpeak.video).toMatchObject({
      room: '123456',
      roomJoin: true,
      canSubscribe: true,
      canPublish: true,
    });
    expect(muted.video).toMatchObject({ room: '123456', canPublish: false, canSubscribe: true });
  });
});

describe('全流程 voice:token 下发', () => {
  let server: AntiqueServer;
  let dataDir: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    dataDir = await makeTempDataDir();
    server = await buildServer({ dataDir, voice: DUMMY_VOICE });
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await server.close();
    await removeTempDir(dataDir);
  });

  it('全员挂机整局:各阶段 token 权限符合 6.2 表', async () => {
    const tokensByPlayer = new Map<string, VoiceTokenPayload[]>();
    const listen = (s: Socket, pid: string) => {
      tokensByPlayer.set(pid, []);
      s.on('voice:token', (p: VoiceTokenPayload) => tokensByPlayer.get(pid)!.push(p));
    };

    const host = await connect(server.port);
    sockets.push(host);
    const created = await emitAck<{ roomCode: string; playerId: string }>(host, 'room:create', {
      name: '房主',
      timersMs: { action: 200, speech: 120, voting: 300, reveal: 80, identity: 250 },
    });
    listen(host, created.playerId);

    for (let i = 1; i < 6; i++) {
      const s = await connect(server.port);
      sockets.push(s);
      const joined = await emitAck<{ playerId: string }>(s, 'room:join', {
        roomCode: created.roomCode,
        name: `挂机${i}`,
      });
      listen(s, joined.playerId);
    }
    await emitAck(host, 'room:start', {});

    const room = server.roomManager.get(created.roomCode)!;
    await waitFor(() => room.game?.phase === 'FINISHED', 120_000, '托管整局');
    // 等最后一批 token 异步发完
    await new Promise((r) => setTimeout(r, 300));

    const all = [...tokensByPlayer.entries()].flatMap(([pid, list]) =>
      list.map((t) => ({ pid, t })),
    );
    expect(all.length).toBeGreaterThan(0);
    for (const { t } of all) {
      expect(t.enabled).toBe(true);
      expect(t.url).toBe(DUMMY_VOICE.url);
      expect(t.token).toBeTruthy();
    }

    // 按策略 key 分组核对(同一发言者跨轮 key 相同,所以按"谁能开麦"的集合断言)
    const byKey = new Map<string, { pid: string; t: VoiceTokenPayload }[]>();
    for (const e of all) {
      byKey.set(e.t.policyKey, [...(byKey.get(e.t.policyKey) ?? []), e]);
    }
    let sawSpeech = 0;
    for (const [key, group] of byKey) {
      const phase = group[0].t.phase;
      const publisherIds = new Set(group.filter((e) => e.t.canPublish).map((e) => e.pid));
      if (phase === 'SPEECH') {
        // 每个发言者 key 下,能开麦的只有发言者本人这一个人
        expect(publisherIds.size, `key=${key}`).toBe(1);
        const speakerInKey = key.split(':')[1];
        expect([...publisherIds][0]).toBe(speakerInKey);
        sawSpeech++;
      } else if (phase === 'ACTION' || phase === 'VOTING' || phase === 'IDENTITY') {
        expect(publisherIds.size, `key=${key}`).toBe(0);
      } else {
        // LOBBY / REVEAL / FINISHED:全员可开麦
        expect(group.every((e) => e.t.canPublish), `key=${key}`).toBe(true);
      }
    }
    expect(sawSpeech).toBeGreaterThan(0); // 至少验证过一个发言者 key
  });
});

describe('举手与临时给麦', () => {
  let server: AntiqueServer;
  let dataDir: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    dataDir = await makeTempDataDir();
    server = await buildServer({ dataDir, voice: DUMMY_VOICE });
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await server.close();
    await removeTempDir(dataDir);
  });

  it('行动阶段举手 → 房主给麦 → 获麦者在静音阶段也能开麦', async () => {
    const host = await connect(server.port);
    sockets.push(host);
    const created = await emitAck<{ roomCode: string; playerId: string }>(host, 'room:create', {
      name: '房主',
      timersMs: { action: 600_000 }, // 卡在行动阶段
    });

    const others: { socket: Socket; playerId: string; tokens: VoiceTokenPayload[] }[] = [];
    for (let i = 1; i < 6; i++) {
      const s = await connect(server.port);
      sockets.push(s);
      const joined = await emitAck<{ playerId: string }>(s, 'room:join', {
        roomCode: created.roomCode,
        name: `玩家${i}`,
      });
      const rec = { socket: s, playerId: joined.playerId, tokens: [] as VoiceTokenPayload[] };
      s.on('voice:token', (p: VoiceTokenPayload) => rec.tokens.push(p));
      others.push(rec);
    }
    await emitAck(host, 'room:start', {});
    const room = server.roomManager.get(created.roomCode)!;
    await waitFor(() => room.game?.phase === 'ACTION', 10_000, '进入行动阶段');

    // 玩家 1 举手
    const raiser = others[0];
    await emitAck(raiser.socket, 'voice:raise', { raised: true });
    expect(room.raisedHands.has(raiser.playerId)).toBe(true);

    // 非房主给麦 → 被拒
    await expect(
      emitAck(others[1].socket, 'voice:grant', { targetPlayerId: raiser.playerId }),
    ).rejects.toThrow(/发言者或房主/);

    // 房主给麦 → 行动阶段(本应全员静音)也拿到 canPublish=true 的新 token
    const before = raiser.tokens.length;
    await emitAck(host, 'voice:grant', { targetPlayerId: raiser.playerId });
    await waitFor(() => raiser.tokens.length > before, 5_000, '重发 token');
    const latest = raiser.tokens[raiser.tokens.length - 1];
    expect(latest.phase).toBe('ACTION');
    expect(latest.canPublish).toBe(true);
    expect(room.raisedHands.has(raiser.playerId)).toBe(false); // 给麦后自动放下手
  });
});
