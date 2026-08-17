/**
 * 独立 fuzz 脚本(SPEC Phase 1 验收第 2 条):
 *   pnpm --filter @antique/shared fuzz [局数]
 * 默认 1000 局(6/7/8 人局轮换),任何异常/非法状态直接抛出。
 */
import { runFuzz } from '../src/testing/fuzz';

const games = Number(process.argv[2] ?? 1000);
const started = Date.now();

const report = runFuzz(games, {
  checkLeaks: true,
  onProgress: (done) => {
    if (done % 100 === 0) console.log(`... ${done}/${games} 局`);
  },
});

console.log(
  `✓ ${report.games} 局完整对局无异常,共 ${report.totalActions} 个 action,耗时 ${Date.now() - started}ms`,
);
