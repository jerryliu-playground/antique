/**
 * 崩溃恢复(SPEC 5.3):每次状态变化后把房间序列化写入 ./data/rooms/{roomCode}.json
 * (Room 内部做 500ms debounce),进程启动时扫描目录恢复。就是 JSON 文件,不上数据库。
 */
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GameAction, GameState } from '@antique/shared';
import type { TimersMs } from './protocol';

export interface RoomSnapshot {
  code: string;
  hostId: string;
  timersMs: TimersMs;
  members: { playerId: string; name: string }[];
  game: GameState | null;
  /** 回放数据(Phase 5):开局配置 + 完整 action 序列 */
  gameInit?: { seed: number; players: { id: string; name: string }[] } | null;
  actionLog?: { at: number; action: GameAction }[];
  savedAt: number;
}

export async function ensureDataDir(dataDir: string): Promise<void> {
  await mkdir(dataDir, { recursive: true });
}

/** 先写临时文件再 rename,避免进程死在半截写出损坏快照 */
export async function saveSnapshot(dataDir: string, snap: RoomSnapshot): Promise<void> {
  const file = join(dataDir, `${snap.code}.json`);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(snap), 'utf8');
  await rename(tmp, file);
}

export async function loadSnapshots(dataDir: string): Promise<RoomSnapshot[]> {
  await ensureDataDir(dataDir);
  const out: RoomSnapshot[] = [];
  for (const f of await readdir(dataDir)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue; // _ 前缀留给战绩等非房间文件
    try {
      out.push(JSON.parse(await readFile(join(dataDir, f), 'utf8')) as RoomSnapshot);
    } catch {
      // 损坏的快照直接跳过,不挡启动
    }
  }
  return out;
}

export async function removeSnapshot(dataDir: string, code: string): Promise<void> {
  await rm(join(dataDir, `${code}.json`), { force: true });
}
