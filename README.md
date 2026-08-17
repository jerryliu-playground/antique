# 古董局中局(线上版)

6–8 人朋友局的网页桌游:十二兽首、六真六赝、三轮定局。手机/桌面同一套响应式界面,内置 LiveKit 语音(按游戏阶段自动控麦)。

完整设计见 [SPEC.md](SPEC.md),开发约束见 [CLAUDE.md](CLAUDE.md)。

## 结构

```
packages/shared   类型定义 + 纯规则引擎(零 IO,可完整重放)
apps/server       Fastify + Socket.IO,房间管理/计时托管/快照恢复,生产模式托管前端
apps/web          React 18 + Vite + Tailwind v4 + Zustand
```

## 本地开发

```bash
pnpm install
pnpm --filter @antique/server dev   # 游戏服务端 :3001
pnpm --filter @antique/web dev      # 前端 :5173(HTTPS,代理 socket 到 3001)
pnpm -r test                        # 82 个测试(规则引擎 + 服务端集成)
```

陪打机器人:`pnpm --filter @antique/server bots <房号> [数量]`
对局回放校验:`pnpm --filter @antique/server replay data/rooms/<房号>.json`

## 生产运行

```bash
pnpm --filter @antique/web build    # 构建前端
pnpm --filter @antique/server start # 单进程托管全部(读 PORT 环境变量,默认 3001)
```

语音需要 LiveKit 凭据(`LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`,
本地可放 `apps/server/.env`,参照 [.env.example](apps/server/.env.example));不配则自动降级为无语音模式。

Render 部署配置见 [render.yaml](render.yaml)。
