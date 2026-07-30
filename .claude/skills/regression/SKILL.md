---
name: regression
description: 多账号 playwright-cli 功能回归向导，封装双玩家/三账号隔离测试模式。用 /regression 触发，需要场景描述作为参数。
disable-model-invocation: true
---

# regression

用 playwright-cli 命名会话做多账号功能回归测试。参数 `$ARGUMENTS` 描述要测的场景（如"好友挑战流程"、"观战+聊天"、"三账号房间满员"）。

## 前置确认

开始前确认（任一缺失则停止并提示用户先启动）。后端端口从 `apps/server/.env` 的 `PORT` 读取（默认 3000），前端端口从 `apps/web/.env` 的 `VITE_PORT` 读取（默认 5173）：

```bash
# 动态解析本机端口（无 .env 时用默认值）
PORT=$(grep -E '^PORT=' apps/server/.env 2>/dev/null | cut -d= -f2 || echo 3000)
WEB_PORT=$(grep -E '^VITE_PORT=' apps/web/.env 2>/dev/null | cut -d= -f2 || echo 5173)
```

1. **后端在跑**: `ss -ltnp | grep "$PORT"` 应有 othello 进程；没有则提示 `pnpm dev:server`
2. **前端在跑**: `curl -s -o /dev/null -w '%{http_code}' http://localhost:$WEB_PORT` 应返回 200；没有则提示 `pnpm dev:web`
3. **PostgreSQL 在跑**: `docker compose ps` 应显示 postgres-othello running；没有则提示 `docker compose up -d`

## 测试流程

### 1. 规划账号

根据 `$ARGUMENTS` 场景决定需要几个账号、命名会话名（用真实用户名如 `alice`/`bob`，不用 `session1`）：

- 双玩家对战/挑战：2 个会话
- 观战：3 个会话（两人对局 + 一人观战）
- 房间满员：按房间上限决定

### 2. 登录（优先 UI 表单）

**优先用 UI 表单登录**，不注入 token，避免 WS 鉴权时序问题（下例端口用前置确认解析出的 `$WEB_PORT`，默认 5173）：

```bash
playwright-cli -s=alice open http://localhost:$WEB_PORT/login
playwright-cli -s=alice snapshot                    # 拿 input/button 的 ref
playwright-cli -s=alice fill <username-input-ref> "alice"
playwright-cli -s=alice fill <password-input-ref> "<password>"
playwright-cli -s=alice click <submit-button-ref>
playwright-cli -s=alice eval "() => location.href"   # 确认离开 /login
```

对每个账号重复（**串行**登录，避免 429 限流；若触发 429 等 15s 恢复）。

只在需要快速复现特定账号状态时才注入 token：

```bash
playwright-cli -s=alice localstorage-set token "<jwtA>"
playwright-cli -s=alice eval "() => location.href"  # 注入后确认 URL 稳定
```

### 3. 执行场景

按 `$ARGUMENTS` 描述的场景操作各会话。常用操作：

```bash
playwright-cli -s=alice snapshot                     # 拿最新 ref
playwright-cli -s=alice click <ref>                   # 点击
playwright-cli -s=alice fill <ref> "value"            # 填表
playwright-cli -s=alice eval "() => location.href"   # 读 URL 验证
playwright-cli -s=alice eval "() => document.querySelector('#app').__vue_app__.config.globalProperties.\$pinia._s.get('store-name')"  # 读 Pinia store
```

落子定位：`button[role="gridcell"][aria-label="D3"]`，合法手有 `cursor-pointer` class。

### 4. 验证 + 收尾

每个账号：

- `playwright-cli -s=<name> console error` 确认无 console error
- `playwright-cli -s=<name> eval "() => location.href"` 确认 URL 符合预期

测试结束逐个关闭：

```bash
playwright-cli -s=alice close
playwright-cli -s=bob close
```

或一次性：`playwright-cli close-all`

## 输出要求

- 每步附上命令实际输出（关键行），不只说"通过"
- 发现问题：描述症状 + 涉及账号 + 命令输出，给出排查方向
- 全程通过：明确说"回归通过，无 console error"
