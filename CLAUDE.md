# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 技术栈

- **前端**: Vue 3.5 + TypeScript 6 + Tailwind CSS 4 + Vite 8 + Pinia + vue-router + vue-i18n + reka-ui + vue-sonner + @lucide/vue
- **后端**: Node 22 + Fastify 5 + ws 8 + `pg`（原生 SQL, 无 ORM）+ argon2 + pino
- **数据库**: PostgreSQL 18 (Docker Compose)
- **AI**: 纯 TypeScript NegaScout + bitboard, L0-L5 难度, 前端 Web Worker / 服务端 worker 线程池
- **契约**: `packages/shared`（Zod schema + TS 类型, 单一来源）
- **包管理**: pnpm 11 monorepo（`packages/*` + `apps/*`）

## 常用命令

```bash
pnpm i                    # 安装依赖
pnpm -r typecheck         # 全包类型检查（web 用 vue-tsc）
pnpm -r test              # 全包 Vitest 测试
pnpm lint                 # ESLint (flat config)
pnpm build                # 先并行跑 typecheck + lint（code-check），全绿后全包构建
pnpm dev:web              # 前端开发 (localhost:5173)
pnpm dev:server           # 后端开发 (localhost:3000, tsx watch 热重载)
docker compose up -d      # 启动 PostgreSQL
pnpm migrate:up           # 运行 SQL 迁移（apps/server 的 tsx 脚本）
```

非标准脚本：`@othello-platform/engine` 有 `test:coverage`；`@othello-platform/server` 有 `loadtest`（`scripts/ws-load-test.ts`）；web 的 `build` 是纯 `vite build`（无类型门），类型检查走独立的 `typecheck` 脚本（`vue-tsc --build`，solution 模式跟随 project references）；根 `build` 内建 code-check（`run-p typecheck lint` → `run-s` 串到 `pnpm -r build` 前，用 `npm-run-all2`）；CI 跑 `typecheck + lint + test`（无 build 步骤）。

## 目录结构

```
packages/shared/   — 契约单一来源 (类型 + Zod + DTO + WS/REST 契约, 无 build, 直接导出 src)
packages/engine/  — 纯函数规则引擎 + AI (零副作用, Board=Uint8Array(64), Bitboard=两个 bigint)
apps/web/         — Vue3 前端 (15 页面, 15 Pinia stores, AI Web Worker)
  src/workers/    — AI Web Worker (NegaScout 在后台线程运行)
apps/server/      — Fastify 后端 (WS hub + 游戏运行时 + 服务层 + AI 线程池)
migrations/       — 17 个 SQL 迁移文件 (001-017, 纯 SQL)
docs/             — prd.md + appendix-a~d + ops-runbook.md + pages/*.html 设计稿
```

## 代码风格（与默认不同）

- **Prettier**: 无分号 (`semi: false`)、单引号、`trailingComma: 'all'`、`printWidth: 100`、2 空格缩进
- **TypeScript strict + `noUncheckedIndexedAccess`**: 数组/对象索引返回 `T | undefined`，必须处理 undefined
- **`verbatimModuleSyntax: true`**: 类型-only 导入必须用 `import type { ... }`，否则编译报错
- **ESLint**: `no-explicit-any` 仅 warn（允许 `any` 但会有告警）；`no-unused-vars` 允许 `_` 前缀参数
- **命名**: 文件 kebab-case、类型 PascalCase、变量 camelCase、常量 SCREAMING_SNAKE_CASE
- **WS 事件** snake_case；**REST 路径** kebab-case 复数, `/api/v1` 前缀
- **棋子常量**: `T_NONE=0, T_BLACK=1, T_WHITE=2`（禁止魔法数字）
- **错误格式**: REST `{ error: { code, msg } }`, WS `{ type: 'error', payload: { code, msg } }`

## 关键 gotchas（必读）

- **pg BIGINT-as-string 根因修复**: node-postgres 默认把 BIGINT (OID 20) 返回为**字符串**，导致 BIGSERIAL 主键沿 DB → JWT(userId) → WS hub `Map<number>` 传播时键类型不匹配（`Map.get(123)` 查不到键 `"123"`）。**已从源头修复**: `apps/server/src/db/pool.ts` 和 `migrate.ts` 在 `new Pool` 前全局注册 `pg.types.setTypeParser(INT8, Number + safeInteger 护栏)`，所有 `int8` 查询结果直接返回 `number`。新代码**无需**再对 DB 返回的 id/外键做 `Number()` 归一化。历史代码里的 `Number()` 是冗余防御（`Number(number)` 是恒等操作），可逐步清理但不影响正确性。**护栏**: 超 `Number.MAX_SAFE_INTEGER` (2^53) 会显式抛错而非静默精度损失——项目自增 id 远不会触达（2^53 ≈ 9×10^15，每秒插 100 万条也需 285 年）。`route.params.id` 来自 URL 天然是字符串，前端这几处 `Number()` 仍必要，与 pg 无关。
- **shared/engine 无 build**: `build` = `tsc --noEmit`（仅类型检查），包直接导出 `src/index.ts`，消费方走 TS source，无 dist 产物。
- **引擎纯函数**: `packages/engine` 不持有状态、零副作用；`Board = Uint8Array(64)`, `Bitboard = 两个 bigint`。
- **字体**: 全站用系统字体栈（中文 PingFang SC / Microsoft YaHei），不加载自定义 Web 字体。
- **`tsx watch` 热重载**: 改后端代码无需手动重启。
- **Tailwind v4**: 用 `@tailwindcss/vite` 插件 + `@theme` 指令（无 JS config 文件），暗色为唯一主题（浅色模式已弃用，设置页无主题切换）。
- **`.playwright-mcp/` / `.playwright-cli/` / `.playwright/` 已 gitignore**: Playwright 工件目录，不入库。

## 环境变量（关键）

完整列表见 `@.env.example` 和 `@docs/ops-runbook.md`。除 `DATABASE_URL`/`JWT_SECRET` 外均可选，关键非默认项：`PORT=3000`、`CORS_ORIGINS`、`TRUST_PROXY`、`AI_MAX_WORKERS`、`AI_THINK_BUDGET_MS`、`MOVE_TIMEOUT_MS`、`RECONNECT_WINDOW_MS`、`SHUTDOWN_TIMEOUT_MS`、`RATE_LIMIT_*`、`AUTH_RATE_LIMIT_*`。

## 前端开发约定

- 界面必须对照 `docs/pages/*.html` 设计稿开发（手工维护的静态设计稿，是最终设计源）：复用 `tokens.css` 配色 class + `@lucide/vue` 图标，忽略字体差异，不放假数据
- 设计稿内容**只增不减**（仅对已实现功能）：已实现功能的 UI 元素必须保留，可美化、优化、增强，不允许减少
- **设计稿逻辑可改进/增加**：设计稿是手工维护的静态 HTML，难免存在逻辑不合理或交互逻辑缺失（如终局后顶栏 badge 不切换、状态态缺终局反馈等）。遇到这类情况可主动改进和增加逻辑，使交互更合理、状态切换更完整，**只是不能随意减少**已实现功能的元素。判断标准：改进让该功能更符合 PRD 预期或用户直觉；改进后无需同步改设计稿（实现为准）
- **未实现功能不做 UI 占位**：PRD 未列的功能、或 PRD 已列但未实现的功能，均暂不呈现 UI（不放"敬请期待"占位卡片、不放禁用控件）。设计稿同步移除对应区段，保持设计稿与实现一致。待 PRD 补充具体内容并实现后再定夺
- PRD 及附录在 `docs/` 下，冲突时**契约层(附录C) > 验收标准(附录B) > 正文**
- **页面布局标准（带顶栏页面）**：设计稿各页正文 max-width 不一致（1200/1280/1440），统一以大厅为基准 `max-w-[1440px] mx-auto`，使正文与顶栏内层容器对齐、跨页切换不跳动。按页面类型分两档：
  - **全高棋盘页**（OnlineGame/Spectate/Replay/Local，棋盘占满视口、页面不滚动）：`pt-16 max-w-[1440px] mx-auto px-8 min-h-[calc(100vh-4rem)] flex flex-col lg:flex-row`（pt-16 精确让出 64px 顶栏，无透气）。LocalGamePage（离线人机 `/local`）已于 2026-07 重构为此布局（左棋盘 + 右侧栏），不再是 `max-w-3xl` 居中窄页
  - **内容滚动页**（Lobby/Room/Leaderboard/Tactics/Friends/Profile，页面自然滚动）：`pt-20 pb-12 max-w-[1440px] mx-auto px-8`（pt-20 = 顶栏 4rem + 1rem 透气，pb-12 底部留白）
  - 顶栏 nav 外层统一 `fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-xl bg-[rgba(15,17,23,0.85)] border-b border-glass-border`，内层 `max-w-[1440px] mx-auto h-full px-8 flex items-center justify-between`。Profile/Friends/Leaderboard/Tactics 用共享组件 `PageNavBar`（含首页 Home 图标入口），其余页内联 nav（内容页页不同，不可共享但容器规格一致）
  - 特殊布局页不适用上述两档：HomePage（`/` 双态——未登录 hero 试玩漏斗 / 已登录行动中枢，对照 00-home）、NotFoundPage（404 趣味兜底页，对照 15-not-found）、SettingsPage（`max-w-2xl` 窄表单）、Login/RegisterPage（`max-w-md` 卡片）
- **前端通用模式**：全局 WS 实时提醒走 `notificationStore`（前端内存态，`useChallenge` 全局绑定一次）；反馈用 vue-sonner Toast（App.vue 必须显式 `import 'vue-sonner/style.css'`）+ 页内错误卡片（无效房间/对局/观战不跳转、不闪棋盘，store `errorState` 三态分支）；口令房经 `JoinPasswordDialog` 传 password，满员房 `ROOM_FULL` 显示错误卡片；复制用 `use-copy` 降级（非 HTTPS 弹手动复制弹窗）

### Vue Skills（开发/维护 Vue 代码必用）

项目 `.claude/skills/` 内置 8 个 Vue skill。开发/维护任何 Vue 代码前按任务加载对应 skill：

| 任务                                           | 加载 skill                                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 任何 Vue 组件/页面/composable 开发（默认入口） | `vue-best-practices`（必读，核心工作流：确认架构 → 规划组件边界 → 响应式最小化 → 数据流显式 → 功能完成后才做性能优化） |
| 写/改 composable                               | `create-adaptable-composable`（MaybeRef/MaybeRefOrGetter 输入归一化，用 toValue/toRef 解）                             |
| Pinia store                                    | `vue-pinia-best-practices`（storeToRefs 解构保响应式、setup store 返回全 state 等）                                    |
| vue-router / 导航守卫                          | `vue-router-best-practices`                                                                                            |
| Vitest 单测                                    | `vue-testing-best-practices`（E2E 部分按本项目约定走 playwright-cli，不维护 @playwright/test 套件）                    |
| 调试 Vue 运行时/响应式问题                     | `vue-debug-guides`                                                                                                     |
| 不适用                                         | `vue-options-api-best-practices` / `vue-jsx-best-practices`（本项目一律 Composition API + `<script setup lang="ts">`） |

skills 采用渐进式披露：SKILL.md 是总纲，具体坑按链接进 `references/`（vue-best-practices）或 `reference/`（其余）查对应方案。

## Git 工作流

- **Conventional Commits**: `feat: / fix: / refactor: / docs: / test: / chore: / perf: / ci:` 前缀
- **PR 流程**: 每个功能开 feature 分支 + PR 合并（不直推 main）
- 提交前确认 typecheck / lint / test 全绿（CI 会跑这三项）

## 测试约定

- **单测**: Vitest（`pnpm -r test`）
- **功能回归**: **playwright-cli** 交互式真实浏览器验证（**不维护 `@playwright/test` 自动化套件**）。playwright-cli 是本地 CLI skill，命令跨调用保持浏览器状态，比 Playwright MCP 的 `browser_run_code_unsafe`（跨调用丢状态、默认 tab 被路由守卫踢回 login）稳定得多。优先用 playwright-cli，不要用 Playwright MCP 的 `browser_*` 工具做多账号 UI 回归
- 每个功能任务 DoD: 单测通过 + playwright-cli 回归通过 + 无 console error（`playwright-cli -s=<name> console error`）
- 新页面/交互上线前在 320/768/1024/1440 四断点截图核对布局
- **多账号隔离测试**（双玩家/三账号场景）：用 playwright-cli 的 `-s=<session>` 命名会话隔离 localStorage，每个账号一个会话，不串 token：
  ```bash
  playwright-cli -s=alice open http://localhost:5173/login      # 会话1
  playwright-cli -s=bob   open http://localhost:5173/login      # 会话2（独立 context）
  playwright-cli -s=alice localstorage-set token "<jwtA>"       # 注入 token A
  playwright-cli -s=bob   localstorage-set token "<jwtB>"        # 注入 token B
  playwright-cli -s=alice goto http://localhost:5173/friends     # 各自导航，状态在命令间保持
  playwright-cli -s=alice snapshot                              # 交互用 ref（如 f1e88）
  playwright-cli -s=alice fill f1e88 "value"
  playwright-cli -s=alice click f1e89
  playwright-cli -s=alice eval "() => location.href"             # 读 URL/store 验证
  playwright-cli -s=alice close; playwright-cli -s=bob close    # 测试结束关闭会话
  ```
  - **优先用 UI 表单登录**（不注入 token），避免 WS 鉴权时序问题：`playwright-cli -s=alice fill <input-ref> "username"` + `click <button-ref>`，走真实登录流程拿 token，localStorage 自动写入
  - 注入 token 仅在需要快速复现特定账号状态时使用；注入后导航可能因 WS auth 时序被踢回 login，需 `eval` 确认 URL 稳定
  - 命令返回的 snapshot 带 `ref`（如 `f1e88`），后续 `click`/`fill` 用最新 ref（reload 后 ref 会变，需重新 `snapshot`）
  - 读 Pinia store 验证状态：`playwright-cli -s=<name> eval "() => document.querySelector('#app').__vue_app__.config.globalProperties.\$pinia._s.get('store-name')"`（注意 `$` 在 shell 里要转义或用单引号）
  - 落子定位：`button[role="gridcell"][aria-label="D3"]`，合法手有 `cursor-pointer` class；结算/重连遮罩是 Teleport 的 `fixed inset-0 z-50`，会拦截棋盘点击
  - 登录限流：3 客户端并发会触发服务端 429，串行登录 + 等 15s 恢复
  - 测试结束 `playwright-cli -s=<name> close` 逐个关闭会话，或 `playwright-cli close-all`

## 更多约定与历史

- 仍在生效的详细约定/决策/模式 → `docs/development-notes/`（按需读，索引见该目录 README）
- 私密本地信息（端口、本地测试账号等）→ `CLAUDE.local.md`（gitignored，不入库）
- 项目历史归档（里程碑 / 回归 / 修复轨迹，含未公开的工程决策上下文）→ `.claude/local/history.md`（gitignored，仅本机）

## Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
