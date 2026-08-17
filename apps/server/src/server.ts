/**
 * Fastify + Socket.IO 装配(SPEC 第 4 节协议)。
 * buildServer 返回可编程句柄,供 index.ts 启动与集成测试复用。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { Server as IOServer, type Socket } from 'socket.io';
import type { BeastId, GameAction } from '@antique/shared';
import { ServerError, toErrorPayload } from './errors';
import type { TimersMs } from './protocol';
import { RoomManager } from './rooms';
import { voiceConfigFromEnv, type VoiceConfig } from './voice';

export interface BuildOptions {
  /** 缺省 0 = 随机端口(测试友好) */
  port?: number;
  /** 缺省 ./data/rooms */
  dataDir?: string;
  /** LiveKit 配置;缺省读环境变量,null = 明确禁用语音 */
  voice?: VoiceConfig | null;
}

export interface AntiqueServer {
  port: number;
  roomManager: RoomManager;
  close(): Promise<void>;
}

export async function buildServer(opts: BuildOptions = {}): Promise<AntiqueServer> {
  const dataDir = opts.dataDir ?? join(process.cwd(), 'data', 'rooms');

  const fastify = Fastify({ logger: false });
  fastify.get('/health', async () => ({ ok: true }));

  // 生产模式:单进程直接托管前端构建产物(apps/web/dist 存在即启用)。
  // 开发时照旧用 vite dev(5173 代理),这里不影响。
  const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
  if (existsSync(join(webDist, 'index.html'))) {
    await fastify.register(fastifyStatic, { root: webDist });
    fastify.setNotFoundHandler((req, reply) => {
      // 单页应用:非资源路径一律回 index.html
      if (req.method === 'GET' && !req.url.startsWith('/socket.io')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ code: 'NOT_FOUND', message: '不存在' });
    });
  }

  const voice = opts.voice !== undefined ? opts.voice : voiceConfigFromEnv();
  if (voice === null) {
    console.log('语音未配置(缺 LIVEKIT_URL/API_KEY/API_SECRET),按降级模式运行(SPEC 6.4)');
  } else {
    console.log(`语音已启用:${voice.url}(麦序由服务端 token 控制)`);
  }

  const io = new IOServer(fastify.server, { cors: { origin: true }, serveClient: false });
  const roomManager = new RoomManager(io, dataDir, voice);
  await roomManager.init();

  io.on('connection', (socket) => wireSocket(socket, roomManager));

  await fastify.listen({ port: opts.port ?? 0, host: '0.0.0.0' });
  const address = fastify.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : (opts.port ?? 0);

  return {
    port,
    roomManager,
    async close() {
      await roomManager.shutdown();
      io.disconnectSockets(true);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await fastify.close().catch(() => undefined); // io.close 已关 http server,双关兜底
    },
  };
}

interface Session {
  roomCode: string;
  playerId: string;
}

type Payload = Record<string, unknown>;
type AckFn = (res: unknown) => void;

function wireSocket(socket: Socket, rm: RoomManager): void {
  let session: Session | null = null;

  /** 统一的 ack + error 事件封装:任何校验失败都回 { ok:false, code, message } 并补发 error 事件 */
  const handle =
    (fn: (payload: Payload) => Payload | void) =>
    (payload: unknown, ack?: AckFn): void => {
      try {
        const result = fn((payload ?? {}) as Payload);
        if (typeof ack === 'function') ack({ ok: true, ...(result ?? {}) });
      } catch (err) {
        const ep = toErrorPayload(err);
        if (typeof ack === 'function') ack({ ok: false, ...ep });
        socket.emit('error', ep);
      }
    };

  const requireSession = (): Session => {
    if (!session) throw new ServerError('NOT_IN_ROOM', '请先加入房间');
    return session;
  };

  socket.on(
    'room:create',
    handle((p) => {
      const { room, member } = rm.createRoom(
        sanitizeName(p.name),
        socket.id,
        sanitizeTimers(p.timersMs),
      );
      session = { roomCode: room.code, playerId: member.playerId };
      void socket.join(room.code);
      room.broadcastLobby();
      room.syncVoiceTo(member.playerId);
      return { roomCode: room.code, playerId: member.playerId };
    }),
  );

  socket.on(
    'room:join',
    handle((p) => {
      const { room, member, rejoined } = rm.join(
        String(p.roomCode ?? ''),
        sanitizeName(p.name),
        typeof p.playerId === 'string' && p.playerId !== '' ? p.playerId : undefined,
        socket.id,
      );
      session = { roomCode: room.code, playerId: member.playerId };
      void socket.join(room.code);
      room.broadcastLobby();
      if (room.game) room.syncTo(member.playerId); // SPEC 5.1:重连立即全量重推
      room.syncVoiceTo(member.playerId);
      return {
        roomCode: room.code,
        playerId: member.playerId,
        started: room.game !== null,
        rejoined,
      };
    }),
  );

  socket.on(
    'room:leave',
    handle(() => {
      const s = requireSession();
      rm.get(s.roomCode)?.leaveLobby(s.playerId);
      void socket.leave(s.roomCode);
      session = null;
    }),
  );

  socket.on(
    'room:start',
    handle(() => {
      const s = requireSession();
      rm.require(s.roomCode).start(s.playerId);
    }),
  );

  /** 对局动作:playerId 一律取自会话,客户端伪造不了别人的操作 */
  const gameAction = (build: (p: Payload, playerId: string) => GameAction) =>
    handle((p) => {
      const s = requireSession();
      rm.require(s.roomCode).act(build(p, s.playerId));
    });

  socket.on(
    'action:appraise',
    gameAction((p, playerId) => ({
      type: 'APPRAISE',
      playerId,
      beastIds: sanitizeBeastIds(p.beastIds),
    })),
  );

  socket.on(
    'action:skill',
    gameAction((p, playerId) => ({
      type: 'SKILL',
      playerId,
      use: p.use === true,
      targetPlayerId: typeof p.target === 'string' ? p.target : undefined,
      targetBeastId:
        typeof p.target === 'number' && Number.isInteger(p.target) && p.target >= 0 && p.target <= 11
          ? (p.target as BeastId)
          : undefined,
    })),
  );

  socket.on(
    'action:pass',
    gameAction((p, playerId) => ({
      type: 'PASS_TURN',
      playerId,
      targetPlayerId: String(p.targetPlayerId ?? ''),
    })),
  );

  socket.on(
    'speech:end',
    gameAction((_p, playerId) => ({ type: 'SPEECH_END', playerId })),
  );

  socket.on(
    'vote:submit',
    gameAction((p, playerId) => ({
      type: 'VOTE_SUBMIT',
      playerId,
      distribution: sanitizeDistribution(p.distribution),
    })),
  );

  socket.on(
    'identity:guess',
    gameAction((p, playerId) => ({
      type: 'IDENTITY_GUESS',
      playerId,
      targetPlayerId: String(p.targetPlayerId ?? ''),
    })),
  );

  // ============ 语音:举手 / 临时给麦(SPEC 6.2 + Phase 5) ============

  socket.on(
    'voice:raise',
    handle((p) => {
      const s = requireSession();
      rm.require(s.roomCode).raiseHand(s.playerId, p.raised !== false);
    }),
  );

  socket.on(
    'voice:grant',
    handle((p) => {
      const s = requireSession();
      rm.require(s.roomCode).grantMic(s.playerId, String(p.targetPlayerId ?? ''));
    }),
  );

  // ============ 房主工具(Phase 5):调计时 / 踢人 / 换座 ============

  socket.on(
    'room:config',
    handle((p) => {
      const s = requireSession();
      rm.require(s.roomCode).updateTimers(s.playerId, sanitizeTimers(p.timersMs) ?? {});
    }),
  );

  socket.on(
    'room:kick',
    handle((p) => {
      const s = requireSession();
      rm.require(s.roomCode).kick(s.playerId, String(p.targetPlayerId ?? ''));
    }),
  );

  socket.on(
    'room:move',
    handle((p) => {
      const s = requireSession();
      const dir = p.direction === -1 ? -1 : 1;
      rm.require(s.roomCode).moveSeat(s.playerId, String(p.targetPlayerId ?? ''), dir);
    }),
  );

  socket.on(
    'stats:get',
    handle(() => ({ stats: rm.statsSummary() })),
  );

  socket.on('disconnect', () => {
    rm.handleDisconnect(socket.id);
  });
}

function sanitizeName(name: unknown): string {
  const s = String(name ?? '')
    .trim()
    .slice(0, 20);
  return s || '无名氏';
}

function sanitizeTimers(t: unknown): Partial<TimersMs> | undefined {
  if (!t || typeof t !== 'object') return undefined;
  const src = t as Record<string, unknown>;
  const out: Partial<TimersMs> = {};
  for (const k of ['action', 'speech', 'voting', 'reveal', 'identity'] as const) {
    const v = src[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 50 && v <= 3_600_000) {
      out[k] = Math.floor(v);
    }
  }
  return out;
}

/** 只做形状清洗,规则校验(是否本轮兽首等)全部交给引擎 */
function sanitizeBeastIds(raw: unknown): BeastId[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 11) as BeastId[];
}

function sanitizeDistribution(raw: unknown): Partial<Record<BeastId, number>> {
  const out: Partial<Record<BeastId, number>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    const id = Number(k);
    if (Number.isInteger(id) && id >= 0 && id <= 11) {
      out[id as BeastId] = Number(v); // 非法票数由引擎抛 BAD_DISTRIBUTION
    }
  }
  return out;
}
