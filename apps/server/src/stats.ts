/** 战绩统计(Phase 5):终局后累计到 data/rooms/_stats.json */
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GameState } from '@antique/shared';

export interface PlayerStats {
  name: string;
  games: number;
  wins: number;
  asGood: number;
  asEvil: number;
}

export interface StatsData {
  totalGames: number;
  players: Record<string, PlayerStats>;
}

export interface StatsRow extends PlayerStats {
  playerId: string;
}

const FILE = '_stats.json';

export class StatsStore {
  private data: StatsData = { totalGames: 0, players: {} };

  constructor(private readonly dataDir: string) {}

  async load(): Promise<void> {
    try {
      this.data = JSON.parse(await readFile(join(this.dataDir, FILE), 'utf8')) as StatsData;
    } catch {
      // 没有或损坏就从零开始
      this.data = { totalGames: 0, players: {} };
    }
  }

  /** 终局记账(每局只调用一次) */
  record(game: GameState): void {
    const result = game.result;
    if (!result) return;
    this.data.totalGames += 1;
    for (const p of game.players) {
      const entry = (this.data.players[p.id] ??= {
        name: p.name,
        games: 0,
        wins: 0,
        asGood: 0,
        asEvil: 0,
      });
      entry.name = p.name;
      entry.games += 1;
      if (p.camp === 'GOOD') entry.asGood += 1;
      else entry.asEvil += 1;
      if (p.camp === result.winner) entry.wins += 1;
    }
    void this.save();
  }

  summary(): StatsRow[] {
    return Object.entries(this.data.players)
      .map(([playerId, s]) => ({ playerId, ...s }))
      .sort((a, b) => b.wins - a.wins || b.games - a.games);
  }

  get totalGames(): number {
    return this.data.totalGames;
  }

  private async save(): Promise<void> {
    const file = join(this.dataDir, FILE);
    const tmp = `${file}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(this.data), 'utf8');
      await rename(tmp, file);
    } catch (err) {
      console.error('战绩写入失败:', err);
    }
  }
}
