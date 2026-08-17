/**
 * 陪打机器人:往指定房间塞 N 个自动玩家(联调 Web 客户端用)。
 *   pnpm --filter @antique/server bots <房号> [数量=7] [服务端=http://localhost:3001]
 * 机器人只凭 state:sync 的 PersonalView 行动;房主在浏览器里开局即可。
 */
import { io } from 'socket.io-client';
import { Bot } from '../test/bot';

const [, , roomCode, countArg, urlArg] = process.argv;
if (!roomCode) {
  console.error('用法: pnpm --filter @antique/server bots <房号> [数量=7] [服务端地址]');
  process.exit(1);
}
const count = Number(countArg ?? 7);
const url = urlArg ?? 'http://localhost:3001';

const NAMES = ['付贵', '黄克武', '刘一鸣', '沈云琛', '钟爱华', '海兰珠', '郑教授', '戴海燕'];

const bots: Bot[] = [];

for (let i = 0; i < count; i++) {
  const socket = io(url, { transports: ['websocket'] });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  const ack = await new Promise<{ ok: boolean; playerId?: string; message?: string }>((resolve) =>
    socket.emit('room:join', { roomCode, name: NAMES[i % NAMES.length] }, resolve),
  );
  if (!ack.ok || !ack.playerId) {
    console.error(`第 ${i + 1} 个机器人进房失败: ${ack.message}`);
    process.exit(1);
  }
  bots.push(new Bot(socket, ack.playerId));
  console.log(`✓ ${NAMES[i % NAMES.length]} 已入座(${ack.playerId.slice(0, 8)}…)`);
}

console.log(`${bots.length} 个机器人就位,请房主在浏览器里开局。`);

const timer = setInterval(() => {
  const done = bots.filter((b) => b.result !== null).length;
  if (done === bots.length && done > 0) {
    console.log(`对局结束:${bots[0].result?.winner === 'GOOD' ? '许愿阵营胜' : '老朝奉阵营胜'},得分 ${bots[0].result?.score}`);
    clearInterval(timer);
    for (const b of bots) b.socket.disconnect();
    process.exit(0);
  }
}, 1000);
