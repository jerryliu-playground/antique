/**
 * 对局回放校验(Phase 5):
 *   pnpm --filter @antique/server replay <快照文件.json>
 * 用快照里的 seed + action 序列重放整局,校验与实际状态逐字节一致,并打印结果摘要。
 */
import { readFile } from 'node:fs/promises';
import type { RoomSnapshot } from '../src/persistence';
import { replaySnapshot } from '../src/replay';

const [, , file] = process.argv;
if (!file) {
  console.error('用法: pnpm --filter @antique/server replay <data/rooms/房号.json>');
  process.exit(1);
}

const snap = JSON.parse(await readFile(file, 'utf8')) as RoomSnapshot;
const { finalState, steps, matchesSnapshot } = replaySnapshot(snap);

console.log(`房间 ${snap.code}:重放 ${steps} 个 action`);
console.log(`阶段:${finalState.phase},第 ${finalState.currentRound + 1} 轮`);
if (finalState.result) {
  const r = finalState.result;
  console.log(
    `结果:${r.winner === 'GOOD' ? '许愿阵营胜' : '老朝奉阵营胜'},${r.score} 分${r.instantWin ? '(即时胜利)' : ''}`,
  );
}
if (matchesSnapshot === null) {
  console.log('快照中无对局状态可比对');
} else if (matchesSnapshot) {
  console.log('✓ 重放结果与快照状态逐字节一致(确定性验证通过)');
} else {
  console.error('✗ 重放结果与快照不一致!');
  process.exit(1);
}
