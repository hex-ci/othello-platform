# 04 · 工程决策与共享契约

> 记录对公开读者有价值的工程决策与共享契约。BIGINT 根因结论的速览版在 CLAUDE.md「关键 gotchas」。

## pg BIGINT-as-string：根因与方案取舍

**根因已从源头修复，新代码无需再处理**。node-postgres 刻意把 `int8`（OID 20）返回为**字符串**（避免静默精度损失），`int4` 则返回 number。项目所有主键/外键用 `BIGSERIAL`/`BIGINT`，导致 DB → JWT → WS hub `Map<number>` 全链路 string/number 键类型不匹配。

**根因修复**：`apps/server/src/db/pool.ts` + `apps/server/src/db/migrate.ts` 在 `new Pool` 前全局注册：

```typescript
pg.types.setTypeParser(pg.types.builtins.INT8, (val: string) => {
  const n = Number(val)
  if (!Number.isSafeInteger(n)) {
    throw new Error(`BIGINT 值 ${val} 超过 Number.MAX_SAFE_INTEGER，精度损失。`)
  }
  return n
})
```

**为何安全**：项目 id 为自增 BIGSERIAL，2^53 ≈ 9×10^15，每秒插 100 万条也需 285 年触达；超限有显式护栏报错不静默损失。`migrate.ts` 是独立进程，单独注册（迁移表 `_migrations.id` 也是 BIGSERIAL）。

**业界方案对比（为何选 setTypeParser）**：

- **A. 全局 setTypeParser（采用）**：一行治本，零依赖零重构，适合自增 id 不超 2^53 的项目
- **B. ORM（Prisma/Drizzle）**：类型安全不丢精度，但项目选型已定「原生 SQL 无 ORM」，改写全部数据层成本远超收益
- **C. 全程 bigint**：绝对不丢精度，但 bigint 不能 JSON.stringify，WS/JWT/前端全要手动转，改造面积更大
- **D. 主键改 SERIAL（int4）**：根治但 21 亿上限，为工程问题降低数据库上限方向不对

**遗留边界**：`route.params.id` 来自 URL 天然是字符串，前端那几处 `Number()` 仍必要，与 pg 无关。

## 共享契约：engine ↔ 前端

以下约定是 `packages/engine` 与前端共同依赖的公共知识，改动任一功能前必读。

### AI 复盘分析（analyzeGame）

- 评估归一化：`tanh(score/100)`，**黑方视角**（正=黑优）
- 分类阈值：blunder < -0.15；inaccuracy < -0.05；good ≥ -0.02 且 |eval| < 0.2；brilliant ≥ -0.02 且 |eval| ≥ 0.2
- **pass 手**：eval 沿用前值、bestPos=null、delta=0、classification=normal，不计入妙手/失误统计
- 缓存幂等：命中直接返回，否则 `INSERT ... ON CONFLICT DO UPDATE`

### 记谱格式（notation）

- 格式 `f5d6c3`；**pass 用 `--`**；decode 严格校验字符/长度/走子方交替/落子合法性
- 题目盘面 board 为长度 64 数组（0=空/1=黑/2=白），索引 `y*8+x`

### 每日挑战统计口径

- `solved = COUNT(DISTINCT puzzle_id)`（解出**不同题数**，防同题重做刷高；业界惯例 Chess.com/Lichess 均去重），total=尝试过不同题数，accuracy=两者比；avg_rating 仍按作答记录均值
- 连做天数按 `created_at::date` 连续且仅计 correct=true；时区用 `AT TIME ZONE 'Asia/Shanghai'`，DATE 统一转 `YYYY-MM-DD` 字符串再比较
- 作答评级：S≤15s / A≤30s / B≤60s / C
- 题目种子用引擎 `playRandomGame + search` 生成确保 best_pos 合法

### 赛季/段位

- `tierOfElo(elo)` + `TIER_THRESHOLDS`（king≥2000 / master≥1800 / diamond≥1600 / platinum≥1400 / gold≥1200 / silver<1200）在 `packages/shared` 单一来源，前后端共用（勿在前端硬编码）
- 赛季仅记录 ELO 峰值与段位快照，**不重置 `users.elo`**（绝对值保持）
- 徽章幂等发放（`UNIQUE(user_id, badge_type)` + `ON CONFLICT DO NOTHING`）

## 安全与运维要点

- **refresh-token 家族吊销 SQL 必须在事务外执行**：在 ROLLBACK 之后才执行级联吊销，否则被回滚（首次实现把吊销放在事务内导致新 token 未被吊销）
- **game_start 竞态**：客户端进对局页前会错过服务端首帧 game_start 广播。进页注册好 handler 后主动发 WS `room_join`，服务端检测重入已开局则补发 game_start（`room-manager.syncGameToUser`）
- **AI 限时与人人限时分离**：`move-timer.ts` 的 `timeoutForMode()`——在线人机 `AI_MOVE_TIMEOUT_MS=120s`、人人 30s，避免慢玩家第 0 手超时
- **观战列表只列人人对局**（人机对局不展示），`spectate_start` 下发当前快照，观战页只读
