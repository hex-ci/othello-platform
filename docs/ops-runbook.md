# Othello 运维手册（T23 GA）

## 1. 服务架构概览

| 组件              | 端口 | 说明                                            |
| ----------------- | ---- | ----------------------------------------------- |
| Fastify HTTP + WS | 3000 | REST API + WebSocket 对战                       |
| PostgreSQL 18     | 5432 | Docker Compose 管理                             |
| AI Worker Pool    | —    | 进程内 worker_threads（AI_MAX_WORKERS，默认 2） |

## 2. 环境变量

| 变量                  | 默认值                  | 说明                                             |
| --------------------- | ----------------------- | ------------------------------------------------ |
| `DATABASE_URL`        | —                       | PostgreSQL 连接串（必填）                        |
| `JWT_SECRET`          | —                       | JWT 签名密钥（必填）                             |
| `JWT_ACCESS_TTL`      | `15m`                   | Access token 有效期                              |
| `JWT_REFRESH_TTL`     | `7d`                    | Refresh token 有效期                             |
| `PORT`                | `3000`                  | HTTP 监听端口                                    |
| `HOST`                | `0.0.0.0`               | 监听地址                                         |
| `WS_PATH`             | `/ws`                   | WebSocket 路径                                   |
| `CORS_ORIGINS`        | `http://localhost:5173` | 允许的 CORS 来源（逗号分隔，生产须配置前端域名） |
| `TRUST_PROXY`         | `false`                 | 反向代理后置 `true`，使限流按真实客户端 IP 生效  |
| `AI_MAX_WORKERS`      | `2`                     | AI 工作线程数                                    |
| `AI_THINK_BUDGET_MS`  | `5000`                  | AI 单步思考预算                                  |
| `MOVE_TIMEOUT_MS`     | `30000`                 | 人人对局每步超时                                 |
| `RECONNECT_WINDOW_MS` | `30000`                 | 断线重连窗口                                     |
| `SHUTDOWN_TIMEOUT_MS` | `10000`                 | 优雅退出超时                                     |
| `LOG_LEVEL`           | `info`                  | 日志级别                                         |

## 3. 数据库迁移

```bash
# 执行迁移（up）
pnpm migrate:up

# 回滚最近一次迁移（down）
pnpm migrate:down
```

迁移文件位于 `migrations/` 目录，按编号顺序执行。当前最新：`017_add-room-spectatable.sql`。

## 4. 优雅重启

服务端支持 SIGTERM/SIGINT 优雅退出：

1. 收到信号 → 停止接收新 WS 连接（`draining` 标志）
2. 通知所有在线客户端 `server_shutdown` 消息
3. 等待在飞消息落盘（上限 5s）
4. 关闭 WS 服务端 + 终止 AI 线程池
5. 进程退出（超时 10s 强退）

```bash
# 优雅重启
kill -TERM <pid>

# 验证退出日志
# "收到终止信号" → "WS 停止接收新连接" → "WS 服务端已关闭" → "优雅退出完成"
```

**注意**：在局对局每手已同步落库 `moves` 表，重启后通过崩溃回放自动恢复。

## 5. 崩溃回放恢复

进程重启（含崩溃）后自动执行：

1. 查询 `games WHERE status='playing'`
2. 逐局据 `games` 行重建 `GameConfig`
3. 用 `moves` 表回放至当前 board/turn/seq
4. 重启 move-timer，若轮到 AI 则触发 Bot 续玩

日志标识：`"崩溃回放：已重建进行中对局"` + `restored: N`

## 6. 限流配置

| 端点             | 限制           | 说明                 |
| ---------------- | -------------- | -------------------- |
| 全局             | 100 req/min/IP | 所有 REST 端点       |
| `/auth/login`    | 10 req/min/IP  | 防爆破               |
| `/auth/register` | 10 req/min/IP  | 防爆破               |
| `/auth/refresh`  | 10 req/min/IP  | 防滥用               |
| `/auth/forgot`   | 5 req/min/IP   | 防邮件轰炸           |
| `/auth/reset`    | 5 req/min/IP   | 防爆破               |
| WS 每连接        | 20 msg/s       | 防消息风暴，超限断开 |

超限返回 HTTP 429 + `{ error: { code: 'RATE_LIMITED', msg: '...' } }`。

## 7. 可观测性

### Health 端点

```bash
curl http://localhost:3000/api/v1/health
# {"ok":true,"online":42,"activeGames":3,"uptimeSeconds":3600}
```

| 字段            | 说明                   |
| --------------- | ---------------------- |
| `online`        | 当前在线用户数（去重） |
| `activeGames`   | 进行中对局数           |
| `uptimeSeconds` | 进程运行时长（秒）     |

### 结构化日志

pino JSON 格式，关键事件：

- WS 连接鉴权/断开
- 非法落子审计（`audit_logs` 表）
- Refresh token 复用检测（`family_id` 级联吊销）
- 崩溃回放恢复
- 优雅退出流程

## 8. 压测

```bash
# 调高 fd 上限（如需）
ulimit -n 65535

# 运行压测（默认目标 5000 并发）
cd apps/server
pnpm loadtest

# 自定义目标和分档
npx tsx --env-file=.env scripts/ws-load-test.ts 5000 "1000,3000,5000"
```

**2026-07-25 压测结论**：

- 5000 并发连接稳定，错误率 0%
- 延迟：p50 0.9ms / p95 6.1ms / p99 13.3ms / max 38.4ms
- 远超 PRD 要求（p95 < 100ms）

## 9. 发布回滚预案

### 发布流程

1. **备份数据库**：`pg_dump -Fc othello > backup_$(date +%Y%m%d).dump`
2. **执行迁移**：`pnpm migrate:up`
3. **部署新代码**：替换 `dist/` 或拉取新镜像
4. **优雅重启**：`kill -TERM <old_pid>` → 启动新进程
5. **验证**：`curl /api/v1/health` 确认 `ok:true`
6. **观察**：监控日志 15 分钟，关注错误率/断连率

### 回滚流程

1. **停止新进程**：`kill -TERM <new_pid>`
2. **回滚代码**：恢复上一版本 `dist/` 或镜像
3. **回滚迁移**（如需）：`pnpm migrate:down`（每次回滚一个版本）
4. **启动旧进程**
5. **验证**：`curl /api/v1/health` + 功能抽检

### 回滚决策条件

- 错误率 > 5% 持续 5 分钟
- WS 断连率异常升高
- 数据库迁移失败或数据不一致
- 核心功能（对战/登录）不可用

## 10. 安全注意事项

- JWT_SECRET 必须通过环境变量注入，**禁止硬编码**
- Refresh token 以 SHA-256 哈希存储，原始值不落库
- 登录/注册端点已加端点级限流防爆破
- WS 每连接消息限流防消息风暴
- 所有 REST/WS 入参经 Zod schema 严格校验
- 密码使用 argon2id 哈希存储
- 服务端权威校验每步落子合法性（防作弊）

## 11. 容器化部署（Docker 一键部署）

生产环境推荐用 `docker-compose.prod.yml` 一键部署，与 dev 的 `docker-compose.yml`（仅 postgres）相互独立。

### 服务拓扑

```
postgres (healthcheck)
   └─> migrate (一次性，跑完 Exited 0)
          └─> server (Fastify :3000，内部网络)
                 └─> web (nginx :80，反代 /api、/ws → server:3000)
```

- `migrate` 以 `service_completed_successfully` 条件门控 `server`，确保库结构就绪后才起服务
- `web` 经 nginx 同源反代 REST 与 WS，前端无需配置后端地址，无 CORS
- 仅 `web` 暴露宿主机端口（`WEB_PORT`，默认 80）；postgres/server 仅在 compose 内部网络可达

### 部署

```bash
cp .env.prod.example .env
# 编辑 .env，务必修改 JWT_SECRET（openssl rand -hex 32）
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps   # migrate=Exited(0)，其余 Up
curl http://localhost/api/v1/health            # {"ok":true,...}
```

跨平台构建（Apple Silicon → x64 服务器）：

```bash
docker compose -f docker-compose.prod.yml build --build-arg BUILDPLATFORM=linux/amd64
# 或直接
docker buildx build --platform linux/amd64 -f Dockerfile.server -t othello-server .
```

### 升级

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
# migrate 服务自动执行新增迁移；server 在其成功后重建重启
```

升级前建议备份数据库：

```bash
docker exec othello-prod-postgres pg_dump -Fc -U othello othello > backup_$(date +%Y%m%d).dump
```

### 回滚

```bash
git checkout <上一个稳定 tag/commit>
docker compose -f docker-compose.prod.yml up -d --build
# 如需回滚迁移：
docker compose -f docker-compose.prod.yml run --rm migrate \
  pnpm --filter @othello-platform/server exec tsx src/db/migrate.ts down
```

### 日志与诊断

```bash
docker compose -f docker-compose.prod.yml logs -f server   # 跟踪后端日志
docker compose -f docker-compose.prod.yml logs migrate     # 查看迁移结果
docker exec othello-prod-postgres psql -U othello -c '\dt' # 检查表结构
```

### 数据持久化

PostgreSQL 数据存于命名卷 `pgdata`。`docker compose down` 不删卷；`down -v` 会**永久删除数据**，慎用。
