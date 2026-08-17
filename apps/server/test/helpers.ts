import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connectClient, type Socket } from 'socket.io-client';

export function connect(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connectClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false, // 重连行为由测试自己控制
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

/** 带 ack 的 emit,ok:false 直接抛错 */
export function emitAck<T extends Record<string, unknown>>(
  socket: Socket,
  event: string,
  payload: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (ack: { ok: boolean; code?: string; message?: string }) => {
      if (ack?.ok) resolve(ack as unknown as T);
      else reject(new Error(`${event} 失败: ${ack?.code ?? '?'} ${ack?.message ?? ''}`));
    });
  });
}

export async function waitFor(
  cond: () => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`等待「${label}」超时(${timeoutMs}ms)`);
    await sleep(25);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function makeTempDataDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'antique-rooms-'));
}

export async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
