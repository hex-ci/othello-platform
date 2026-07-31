# 02 · 前端模式

## 全局通知：notificationStore

**问题**：`useChallenge` 的 `bindChallenge()` 只在 FriendsPage/ProfilePage `onMounted` 绑定 `ws.on('challenge')`。对方在大厅/对局页等其它页面时无 handler，WS challenge 消息丢弃，发起方卡在「等待应答」。

**修复**：

- `apps/web/src/stores/notification-store.ts`（Pinia，前端内存态，不持久化）：统一管理 WS 实时提醒，当前覆盖 challenge 类型，未来可扩展再战/好友请求/系统通知。有 pushChallenge/dismiss/clearChallenge/pruneExpired/clearAll，TTL 5 分钟。
- `useChallenge`：`incomingChallenge` 从 `notificationStore.pendingChallenge` 派生（computed）；`bindChallenge()` 幂等（`bound` 标记），在 `App.vue onMounted` 全局绑定一次，任何页面都能收到挑战。FriendsPage/ProfilePage 移除各自的 `bindChallenge()`，只读 `incomingChallenge`/`challengingId` + 调 action。
- `LobbyPage.onLogout` 调 `notificationStore.clearAll()` + `challengingId.value = null`。

**用户决策**：消息存储仅前端内存（不持久化，重启清空）；对方离线时挑战 = 离线直接拒绝（服务端 `OPPONENT_OFFLINE`，不保留挑战）。未来可升级为消息提醒中心（顶栏铃铛 + 持久化）。

## Toast 与错误态

### 组件库

- **vue-sonner**：全局 Toast，`import { toast } from 'vue-sonner'` 调 `toast.error/success/warning/info()`。App.vue 根挂 `<Toaster position="top-right" theme="dark" close-button :duration="4000" />`，样式在 `apps/web/src/styles/global.css` 自定义对齐暗色玻璃风，不用 rich-colors。
- **关键坑**：vue-sonner v2 不自带样式，必须在 App.vue 显式 `import 'vue-sonner/style.css'`，否则 toaster `position: static` 跑到文档流底部不浮动。
- **reka-ui**：无样式可访问组件库，Dialog/Confirm/Tooltip/Popover/Menu 等直接套项目配色。

### 剪贴板复制降级（非 HTTPS 环境）

`navigator.clipboard.writeText` 仅 secure context（HTTPS/localhost）可用，非 HTTPS 抛错。

- `apps/web/src/composables/use-copy.ts`：`useCopy()` 返回 `{ pendingCopy, copy, clearPending }`。`copy(text)` 优先 Clipboard API，失败降级 `document.execCommand('copy')` 隐藏 textarea，仍失败记录到 `pendingCopy` 触发弹窗，返回 false。
- `apps/web/src/components/ui/CopyFallbackDialog.vue`：复制失败降级弹窗（Teleport + 玻璃风），readonly input 打开自动全选 + 「全选文本」按钮。
- 调用点：RoomPage.shareInvite、ReplayPage.shareGame/exportNotation 改用 `copy()`，成功 `toast.success`，失败弹窗。全部移除 `alert`。

### 不存在房间/对局/观战：页面内错误态

访问 `/room/43534`、`/game/234234`、`/spectate/g_99999` 静默无反应，且会闪一下棋盘再切错误态。方案（页面内错误卡片，不跳转、不弹 toast）：

- 三个 store 各加 `errorState` ref：room-store（ROOM_NOT_FOUND→not_found / ROOM_FINISHED→finished）、online-game-store（同）、spectate-store（GAME_NOT_FOUND→not_found）。
- 三个页面模板三态分支：`v-if="loading"` spinner（status==='idle' && !errorState，防棋盘闪现）→ `v-else-if="errorState"` 错误卡片（Ghost 图标 + 标题 + 说明 + 返回大厅）→ `v-else` 正式 UI。
- store error handler 设 errorState 而非 router.push/toast；倒计时仅 status==='playing' 时 tick。
- **防闪烁关键**：loading 态用 spinner 占位，等收到 room_state/game_start/spectate_start 或 errorState 才切 UI。

### WS/REST 鉴权失败（假 token）

- `apps/web/src/api/ws-client.ts`：onmessage 收到 INVALID_TOKEN/AUTH_REQUIRED 时设 authFailed → 清 token/refreshToken → sessionStorage 存 'auth_expired' → `location.replace('/login?redirect=...')`；onclose 检查 authFailed 停止自动重连；connect 重置 authFailed。
- `apps/web/src/api/client.ts`：REST 401 handleUnauthorized 同样 sessionStorage 标记 'auth_expired' 再跳 login。
- `LoginPage.vue`：onMounted 读 'auth_expired' → toast.error 提示 → 清除标记。**toast 提示不在 ws-client 内直接弹**（整页 replace 会销毁 toast DOM），由 login 页落地。

## 口令房 + ROOM_FULL

**问题 1**：RoomDTO 缺 `hasPassword`，LobbyPage `onJoin` 不传 password，RoomList 无口令输入 UI，口令房无法加入。

**修复**：`packages/shared/src/contracts.ts` RoomDTO 加 `hasPassword: boolean`；`dto.ts` `roomRowToDTO` 映射 `row.password !== null && row.password !== ''`；`components/lobby/RoomList.vue` 有口令房显示 Lock 图标、点击 emit `join-with-password`；新建 `JoinPasswordDialog.vue`；`LobbyPage` 监听 → 弹框 → `enterRoom(id, mode, password)`；`quickJoin` 跳过有口令房。

**问题 2**：第三方加入满员人人房卡加载态。room-store error 处理只认 ROOM_NOT_FOUND/ROOM_FINISHED，服务端 `joinRoom` 对满员房发 `ROOM_FULL` error 被忽略。

**修复**：room-store errorState 加 `'full'` kind + ws.on('error') ROOM_FULL 分支；RoomPage 错误卡片三元扩展 `not_found/finished/full`。

**gotcha**：

- **i18n namespace 陷阱**：`notFoundTitle`/`finishedTitle`/`backLobby` 在 `game:`、`spectate:`、`room:` 三个 namespace 都有。新增 room 错误 key 必须加在 `room:` namespace（zh-CN.ts 约 390 行），不是 `game:`（约 185 行）。Vite HMR 对 i18n .ts 热更新不可靠，改后需重启 Vite 或硬刷新。

## 注册协议复选框隐藏

注册页用户协议/隐私政策复选框已隐藏：`agreed` 默认 true、校验移除、UI 注释、`Check` 图标导入删除。设计稿 02-register 同步移除。

**Why**：无实际法律文本页面，勾选指向空链接比没有更误导；开源演示项目不面向真实用户收集敏感数据，法律风险极低；减少注册摩擦。

**待公开部署时恢复**：先撰写合规的隐私政策 + 用户协议页面，再恢复复选框（`agreed = ref(false)` + 校验 + UI）并链接到实际页面，设计稿同步恢复。
