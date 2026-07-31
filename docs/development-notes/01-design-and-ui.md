# 01 · 设计与 UI 约定

## 设计稿约定（docs/pages/*.html）

所有前端界面开发必须对照 `docs/pages/*.html` 设计稿，布局、样式、配色、组件结构与设计稿基本保持一致。设计稿来源：`docs/index.html`（界面总览）+ `docs/pages/NN-*.html`（各界面独立 HTML）。

### 配色与字体

- **配色 token 已统一**：`apps/web/src/styles/tokens.css` 的 `@theme` 与设计稿逐值一致（board-green `#1a6b3c` / gold `#d4a843` / glass / surface `#161922` 等）。直接复用 class（`bg-glass`、`border-glass-border`、`text-gold`、`bg-surface`），不要新造颜色。
- **字体例外**：设计稿用 DM Sans / Noto Serif SC / Space Mono，但项目约定只用系统字体栈（tokens.css 的 `--font-sans/serif/mono`），不引入任何 Web 字体，对齐时忽略字体差异。
- **图标**：设计稿用 lucide，本项目装官方继任包 `@lucide/vue`（`lucide-vue-next` 已弃用），`import { User, Lock } from '@lucide/vue'`，保持线性风格。

### 内容只增不减（仅对已实现功能）

- 可以对设计稿内容**优化和增强**，但**不允许减少**已实现功能的元素。
- **设计稿逻辑可改进/增加**：静态 HTML 难免有逻辑缺失（如终局后顶栏 badge 不切换、观战页照搬对局页倒计时但未区分终局态）。可主动改进使交互更合理、状态切换更完整，**只是不能随意减少**已实现功能元素。判断标准：改进是否让功能更符合 PRD 预期或用户直觉；只改样式风格则保持设计稿原意。改进后无需同步改设计稿（实现为准）。
- **未实现功能不做 UI 占位**：PRD 未列、或已列但未实现的功能，均暂不呈现 UI（不放「敬请期待」占位卡片、不放禁用控件），不放假数据。设计稿同步移除对应区段，保持设计稿与实现一致。待 PRD 补充并实现后再定夺。

### 已实现界面对应设计稿

01 登录 / 02 注册 / 03 大厅 / 05 对局 / 06 结算 / 09 资料 / 11 复盘 / 12 战术 / 13 榜单 / 14 设置（仅主题/无障碍/BossKey 三区）。

## 页面布局标准（带顶栏页面）

完整规格见 CLAUDE.md「前端开发约定」页面布局标准小节（顶栏 nav 容器、全高棋盘页 / 内容滚动页两档、特殊布局页不适用清单）。本文件不重复展开。

## 主题决策

- **仅深色模式**：浅色已弃用，设置页无主题切换。tokens.css 删除 `[data-theme='light']` 覆写，`<html>` 不再写 `data-theme`；`@theme` 深色 token 是默认值。保留高对比（`[data-contrast='high']`）与减动效覆写。若未来恢复浅色：重新加 `[data-theme='light']` 覆写 + settings-store 的 theme 字段 + 设置页 UI。
- **PWA 暂不实现**：无 manifest、无 Service Worker、无 vite-plugin-pwa、无 beforeinstallprompt 监听。设计稿 01-login 的「安装 PWA」按钮已删。若未来恢复：新增 manifest + SW + 安装提示逻辑，设计稿从 git 历史恢复。

## 导航/体验重构

- **双态首页** `HomePage.vue` 挂 `/`：未登录=棋盘视觉开场+「马上玩」试玩漏斗（→`/local`）；已登录=行动中枢（快速开局矩阵/直播观战/最近对局/每日挑战）。离线人机 `LocalGamePage` 从 `/` 迁到 `/local`（name 保持 `local-game`）。登录/注册页试玩按钮改指 `/local`。
- **NotFoundPage** 404 兜底页（`/:pathMatch(.*)*`）：巨型「404」中间 0 做成白子 + 初始局面棋盘 A1 迷失格 + 三出口，未登录态隐藏「去大厅」。
- **首页入口**：LobbyPage 内联 nav + PageNavBar 各加 Home 图标 → `/`。
- **离线人机重构**：LocalGamePage 从 `max-w-3xl` 居中窄页改为全高棋盘页（顶栏+左棋盘+右侧栏），ScoreBar 重构为竖版比分卡，删除 `ControlBar.vue`（按钮并入侧栏）。
- **useQuickAi composable**：从 LobbyPage 提取（在线人机建房/进房导航/自动匹配/createAndEnter），HomePage 与 LobbyPage 共用。
- **登出 bug 修复**：LobbyPage.onLogout 曾在事件处理器里调 `useChallenge()`（内部含 useI18n），报「Must be called at the top of a setup function」。`useChallenge()` 提到 setup 顶层。useNotificationStore() 可留处理器内（Pinia store 无此限制，只有 useI18n 有）。
- **装饰棋盘棋形串陷阱**：8×8 棋盘需 64 字符棋形串，曾误写 62 字符导致右下角缺 2 格（HomePage + 00-home 同错，已修）。
