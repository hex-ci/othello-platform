# 03 · 后端笔记：限流可配置化

服务端限流原本硬编码（全局 100/min、登录 10/min、重置 5/min），三客户端并发加载 lobby 即触发 429，且多人共用 NAT 出口 IP 会被瓜分配额误伤。已改为环境变量可配置 + keyGenerator 按 userId 分桶。

## 改动

- `apps/server/src/app.ts` 全局限流：`max` 读 `RATE_LIMIT_MAX`（默认放宽到 300）、`timeWindow` 读 `RATE_LIMIT_WINDOW`（默认 1 minute）。keyGenerator 从 Authorization Bearer token 同步解 base64url payload 取 `userId`（不验签名，仅作分桶键，onRequest 阶段即可用），已登录用户按 `u:${userId}` 限流，未登录回退 `request.ip`。
- `apps/server/src/routes/auth.ts` 鉴权端点：`AUTH_RATE_LIMIT_MAX`（默认 10）、`AUTH_RATE_LIMIT_WINDOW`、`RESET_RATE_LIMIT_MAX`（默认 5）、`RESET_RATE_LIMIT_WINDOW`。登录/注册端点本身无 token，keyGenerator 回退 IP（按 IP 限流恰是防爆破所需）。
- `.env.example` 补全 6 个限流变量及说明。
- 默认值兜底，未配置变量也能运行。

## 为何自解析 token 而非 request.user

本项目鉴权是路由级 `preHandler: [authGuard]`（非全局），`@fastify/rate-limit` 默认 `hook: 'onRequest'` 早于 preHandler，此时 `request.user` 未解出。改 hook:'preHandler' 与各路由 authGuard 的执行顺序无保证。自解析 base64 payload 在 onRequest 即可拿到 userId，最可靠。

## 备注

- **Redis store 留待上线多副本**：当前单体进程内存储够用，水平扩展时接 `redis` 选项（见 @fastify/rate-limit 文档）。
