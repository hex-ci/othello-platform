# 附录 A · 术语表 · 命名与工程约定

> 本页是给 AI 开发者的**基础约定层**：术语与代码标识符的对应、命名规范、锁定的技术栈版本、目录结构与工程规范。生成代码时必须遵循本页命名与结构，遇到未定义项先在此登记再使用，不要自行臆造别名。
>

---

## A.1 术语表（领域词 → 代码标识符）

统一命名，避免同义词漂移。左列为文档/UI 用词，中列为代码中必须使用的标识符。

| 领域概念 | 代码标识符 | 说明 |
| --- | --- | --- |
| 棋子/空位状态 | `T_NONE=0` `T_BLACK=1` `T_WHITE=2` | 全局常量，禁止用魔法数字 |
| 执子色 | `Color`（字符串 'BLACK' 或 'WHITE'） | 对外协议用大写；引擎内部可用 1/2 |
| 棋盘 | `Board`（`Uint8Array(64)`） / `Bitboard`（black+white 两个 `bigint`） | UI/存储用 `Board`；引擎搜索用 `Bitboard` |
| 坐标 | `Pos`（`{ x, y }`，取值 0-7） | `x` 为列、`y` 为行 |
| 合法手 | `legalMoves(board, color): Pos[]` | 枚举合法落子 |
| 落子 | `applyMove(board, color, pos)` | 返回新棋盘与被翻子 `{ board, flipped }` |
| 翻子 | `flipped: Pos[]` | 一手翻转的对方子 |
| 让行（无手） | `pass` / `isPass` | 无合法手时换手 |
| 终局 | `isGameOver` / `result`（BLACK / WHITE / DRAW） | 双方均无手 |
| 手序 | `seq`（从 1 递增，含 pass） | `moves.seq` 单调唯一 |
| 结束原因 | `end_reason`：normal / resign / draw_agree / disconnect / timeout | 与库字段一致 |
| 难度档 | `AiLevel`（整数 0-5，L0 热身不计分） | 默认 3 |
| 思考 | `think(bitboard, level, color): Promise<Pos>` / `stop()` | 引擎对外接口 |
| 主评级 | `elo`（K=32，仅人人对局） | 定级期前 10 局 |
| 展示积分 | `classicScore`（注册=50，下限 0） | 仅展示/称号 |
| 房间 | `Room` / `mode`（human_vs_ai / human_vs_human） |  |
| 对局 | `Game` / `gameId`（字符串，如 `g_101`） |  |
| 记谱 | `notation`（如 `f5d6c3…`） | 标准 Othello 记谱，F-E-19 |

---

## A.2 命名约定

- **文件/目录**：`kebab-case`（如 `game-engine.ts`、`room-service.ts`）。
- **类型/接口/枚举/类**：`PascalCase`（`GameState`、`MovePayload`），不用 `I` 前缀。
- **变量/函数**：`camelCase`；布尔量用 `is/has/can` 前缀。
- **常量**：`SCREAMING_SNAKE_CASE`（`T_BLACK`、`MAX_PLAYERS`）。
- **Vue 组件**：`PascalCase.vue`（`BoardCanvas.vue`），与 §5.1 组件名一致。
- **WS 事件 type**：`snake_case`（`game_start`、`room_join`），与 §4.3 一致。
- **REST 路径**：`kebab-case` + 复数资源名，统一 `/api/v1` 前缀。
- **数据库**：表/列 `snake_case`（与 §4.1 一致）；代码侧 DTO 转 `camelCase`，在 `shared` 层集中映射。

---

## A.3 技术栈与版本锁

> 锁定大版本，禁止擅自升级/替换关键依赖；如需变更先在主文档「待确认问题」登记。选型以**实现简单、类型贯通**为原则。
>

| 层 | 选型 | 版本基线 | 备注 |
| --- | --- | --- | --- |
| 运行时 | Node.js | 24 LTS | 后端与工具链 |
| 包管理 | pnpm | 11.x | monorepo workspace |
| 语言 | TypeScript | 7.0+ | 全栈 `strict: true` |
| 前端框架 | Vue | 3.5.x | `<script setup>`  • Composition API |
| 构建 | Vite | 8.x（跟随 PRD 基线） |  |
| 样式 | Tailwind CSS | 4.x | 原子化，禁止散落内联样式 |
| 状态 | Pinia | 4.x |  |
| 国际化 | vue-i18n | 11.x | 资源见 A.5 |
| 后端框架 | Fastify | 5.x |  |
| WebSocket | ws | 8.x | 挂载于 Fastify server |
| 数据库 | PostgreSQL | 18 | 见 §4.1 |
| DB 访问 | `pg`  • SQL 迁移（`node-pg-migrate`） | — | **不引入重型 ORM**，与 §4.1 原生 SQL 一致 |
| 校验 | Zod | 4.x | REST/WS 契约单一来源（`packages/shared`） |
| 鉴权 | `@fastify/jwt`、`argon2` | — | JWT + argon2id |
| 单测 | Vitest | 4.x | 引擎/服务纯函数 |
| E2E | Playwright | 1.x | 关键流程 |
| AI 编译 | TS → WASM（AssemblyScript 或 Rust，M0 PoC 定夺） | — | v1 可先纯 TS，WASM 作为性能增强 |

---

## A.4 目录结构（pnpm monorepo）

```
othello-platform/
├─ pnpm-workspace.yaml
├─ package.json
├─ .env.example
├─ packages/
│  ├─ shared/            # 契约单一来源：TS 类型 + Zod schema + 常量 + DTO 映射
│  │  └─ src/{ contracts, ws, dto, constants }.ts
│  └─ engine/            # 纯函数规则引擎 + AI（可编译 WASM），零副作用、无 IO
│     └─ src/{ board, rules, bitboard, negascout, weights }.ts
├─ apps/
│  ├─ web/               # Vue3 前端
│  │  └─ src/{ pages, components, stores, i18n, ws-client }/
│  └─ server/            # Fastify + ws 后端
│     └─ src/{ routes, ws, services, db, auth, middleware }/
├─ migrations/           # SQL 迁移（node-pg-migrate）
└─ tests/                # 跨包 e2e / fixtures
```

- **依赖方向**：`engine` 与 `shared` 不依赖任何 app；`server`/`web` 依赖 `shared`，`server` 依赖 `engine`。引擎保持纯函数，便于单测与前端离线复用（F-C-05）。

---

## A.5 代码规范与环境变量

- **TS 严格模式**：`strict`、`noUncheckedIndexedAccess`、禁用隐式 `any`。
- **Lint**：ESLint；提交前 `typecheck`、`lint`、`test` 必须通过（CI gate）。
- **错误处理**：服务端统一错误码表（见附录 C），REST 返回 `{ error: { code, msg } }`，WS 返回 `{ type: 'error', payload: { code, msg } }`；禁止吞异常。
- **日志**：结构化 JSON 日志（pino），记录请求/WS 事件/AI 时延/非法手（§6.5）。
- **环境变量**（`.env.example` 须齐全）：

```
DATABASE_URL=postgres://user:pass@localhost:5432/othello
JWT_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
WS_PATH=/ws
AI_MAX_WORKERS=4
MAIL_FROM=            # 邮箱验证/找回
LOG_LEVEL=info
```