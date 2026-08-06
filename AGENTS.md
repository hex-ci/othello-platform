# AGENTS.md

全栈黑白棋（Othello/Reversi）对战平台：服务端权威对战、AI 人机、复盘、观战、题库与赛季段位。

## 主指令源

完整项目约定（技术栈、命令、代码风格、gotchas、前端/测试约定）见 [CLAUDE.md](./CLAUDE.md)。本文件仅为通用 agent 入口指针，不重复其内容。

## 包职责

| 包 | 职责 |
|---|---|
| `packages/shared` | 契约单一来源（Zod schema + TS 类型 + DTO + WS/REST 契约），无 build，直接导出 src |
| `packages/engine` | 纯函数规则引擎 + AI（NegaScout + bitboard），零副作用 |
| `apps/web` | Vue 3 前端（15 页面、15 Pinia stores、AI Web Worker） |
| `apps/server` | Fastify 后端（WS hub + 游戏运行时 + 服务层 + AI 线程池） |

## 核心风险文件

- `apps/server/src/room/room-manager.ts` — 房间/对局协调器（座位、落子编排、断线重连）
- `apps/server/src/game/game-runtime.ts` — 权威状态机
- `packages/shared/src/contracts.ts` — 契约单一来源，前后端共用
- `packages/engine/src/negascout.ts` — NegaScout AI 搜索

## 常用命令

```bash
pnpm i              # 安装依赖
pnpm -r typecheck   # 全包类型检查
pnpm -r test        # 全包 Vitest 测试
pnpm lint           # ESLint
pnpm build          # typecheck + lint → 全包构建
pnpm dev:web        # 前端开发
pnpm dev:server     # 后端开发
```