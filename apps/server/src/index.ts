import { fileURLToPath } from 'node:url';
import { buildServer } from './server';

// 加载 apps/server/.env(LiveKit 凭据等;没有该文件就跳过)
// 注意用 fileURLToPath:项目路径含中文,URL.pathname 会被百分号编码
try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  // .env 不存在,按降级模式跑
}

const port = Number(process.env.PORT ?? 3001);
const dataDir = process.env.ANTIQUE_DATA_DIR;

const server = await buildServer({ port, dataDir });
console.log(`古董局中局服务端已启动: http://localhost:${server.port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`收到 ${signal},正在保存快照并退出…`);
    void server.close().then(() => process.exit(0));
  });
}
