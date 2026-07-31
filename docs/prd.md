# Othello（黑白棋）全平台产品需求文档

- **日期**：2026-07-22
- **类型**：PRD（产品需求文档 v1.0 需求基线）
- **编写说明**：本文档由产品战略团队需求分析师主导编写，并经现代 Othello/Reversi 竞品对标校准。

---

## 0. 阅读指南

> 本文档用于驱动大模型进行开发。开始编码前请先遵循以下协议，并配合末尾四份附录使用。

- **单一事实来源与优先级**：描述冲突时，优先级为「契约层（附录 C）与 §4 数据/接口定义」> 「验收标准（附录 B）」> 本文正文散文描述。
- **不得臆造**：未在文档/附录中定义的字段、接口、行为、命名，一律不得自行发明；不确定就停下并在「待确认问题」登记后再继续。
- **命名与结构**：严格遵循附录 A 的术语表、命名约定、技术栈版本与目录结构。
- **验收即测试**：按附录 B 的 Given/When/Then 生成单测/E2E，覆盖列出的边界与反例。
- **按切片交付**：按附录 D 的任务顺序（T01→T23）推进，每个任务一个 PR，满足其 DoD 才算完成。
- **非目标**：§九 Non-goals 明确不做的内容不要实现。
- **软件从简**：多方案可选时，选实现/架构更简单者（如单节点、进程内房间状态、`pg` + SQL 而非重型 ORM）。

### 配套子页

- 📎 appendix-a-glossary-and-conventions.md — 术语↔标识符、版本锁、目录结构
- ✅ appendix-b-acceptance-criteria.md — 每条 F-C/F-E 的 Given/When/Then + 边界/反例
- 🔌 appendix-c-ws-contracts-and-state-machines.md — 强类型契约、错误码、消息字典
- 🧱 appendix-d-task-checklist.md — T01-T23，含 DoD 与依赖

---

## 1. TL;DR

- 交付一个**浏览器零安装、服务端权威、可复盘观战、多难度 AI、ELO 匹配、多语言**的黑白棋（Othello/Reversi 8×8）平台。
- 技术栈：前端 Vue3 + TypeScript + Tailwind CSS 4 + Vite 8；后端 Node.js + TypeScript + Fastify + ws（WebSocket 服务端）；数据库 PostgreSQL（含 `games`/`moves` 落子序列表，不用 Redis，房间状态进程内）；AI 为 TS/WASM 移植 NegaScout（bitboard），5 档难度 L1-L5 + L0 热身不计分。
- 核心交付：**WebSocket 服务端权威实时对战 + 每步合法性校验 + 多难度 AI + ELO 与经典积分双评级 + 自动/手动匹配 + 复盘分析 + 观战 + 多语言**。
- 范围纪律：对战与规则引擎为「核心·不可裁剪」；现代新增能力统一标记为「增强·可选/新增」。

---

## 2. 核心结论卡片

| 维度          | 推荐方案                                                                           | 优先级 | 预期影响                                 | 资源需求 | 风险等级 |
| ------------- | ---------------------------------------------------------------------------------- | ------ | ---------------------------------------- | -------- | -------- |
| 技术栈        | Vue3 + TS + Tailwind + Vite 前端 + Node/Fastify+ws 后端 + PostgreSQL（弃用 Redis） | P0     | 跨平台零安装、易维护、可演进（架构简洁） | 中       | 低       |
| 对战架构      | 服务端权威 WebSocket                                                               | P0     | 天然防作弊、状态一致                     | 中       | 中       |
| 规则引擎      | 8 方向翻子 + 服务端权威校验                                                        | P0     | 保证公平性、支持复盘                     | 低       | 低       |
| AI            | NegaScout 移植 TS/WASM + bitboard，5 档难度                                        | P0     | 离线/在线人机                            | 中       | 中       |
| 数据层        | PostgreSQL（含走子历史/对局记录）                                                  | P0     | 支持复盘、观战、审计                     | 低       | 低       |
| 复盘/观战     | 走子历史表 + 复盘查看器 + 观战订阅                                                 | P1     | 留存与学习价值，提升粘性                 | 低       | 低       |
| 评级          | ELO + 经典积分双评级                                                               | P1     | 公平匹配、竞技化                         | 低       | 低       |
| 安全          | 全站 HTTPS、JWT/会话、argon2id、每步校验                                           | P0     | 防作弊、保护账户                         | 低       | 中       |
| i18n / 无障碍 | 现代基准能力                                                                       | P2     | 国际可达、移动端体验                     | 低-中    | 低       |

---

## 一、产品概述

### 1.1 目标

交付一个**浏览器零安装、服务端权威、可复盘观战、多难度 AI、ELO 匹配、多语言**的现代黑白棋平台，覆盖完整的对战、社交、学习与竞技闭环。

**市场定位**：主流方案要么偏异步（GoldToken / LittleGolem / BrainKing，强复盘弱实时），要么实时但无复盘/无强 AI（PlayOK / FlyOrDie）。「实时对战 + 强 AI + 复盘 + 观战 + ELO 匹配」全栈齐备的现代方案存在明显空白，本项目以此作为差异化切入点；Edax 可作为 L5 专家档的中期增强引擎参考。

### 1.2 范围

- Web 客户端（桌面 + 移动响应式）。
- 现代协议（REST + WebSocket），服务端权威。
- TS/WASM AI 引擎，5 档难度 + L0 热身。
- PostgreSQL 数据层（含对局记录与走子历史）。

### 1.3 关键名词

- `T_NONE=0 / T_BLACK=1 / T_WHITE=2`：棋子状态常量（初盘 `(3,3)=白 (3,4)=黑 (4,3)=黑 (4,4)=白`）。
- **NegaScout**：α-β 剪枝变体搜索算法。
- **bitboard**：以 64 位整数表示棋盘，加速合法手与翻子计算。
- **位置权重表**：角 200 / X 位 −100 / C 位 −25 / 边 +15（角、边为正价值，X/C 位为贴角危险负价值；此为 L1-L3 静态启发，L4+ 以搜索为主）。
- **残局穷举**：剩余空格 ≤ 12 时切换到精确解（L4/L5 启用；高档可上调至 18-20）。
- **近终局启发**：剩余空格 ≤ 14 时启用。
- **ELO / 经典积分 / 置换表（Transposition Table）/ 服务端权威**。

---

## 二、功能需求清单

> 标注说明：**[核心·不可裁剪]** = 缺失将导致产品不可用，必须交付；**[增强·可选/新增]** = 现代新增或优化项，可分期，但不影响核心对战闭环。

### 2.1 游戏核心逻辑

| 编号   | 功能                                                                                                                                                                                                                                                                                         | 标签             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| F-C-01 | 8×8 棋盘规则引擎：初始布局、合法手判定（8 方向射线，遇己方且中间含 ≥1 对方子即合法）、翻子（8 方向翻面）、Pass（无手换对手）、双方无手 → 终局比子（返 WIN/LOSE/DRAW）                                                                                                                        | [核心·不可裁剪]  |
| F-C-02 | 积分公式（经典积分，展示/称号用途；主评级为 ELO，见 F-E-01）：胜 +3 / 负 −2 / 平 +1；低分胜高分追加差值 20%；平局追加 10%（仅当双方对局数差 < 2）；仅「轮到己方且非明显优势时长时间断线」判定为逃跑，每 2 次 −1，真实短时掉线走重连不扣分；注册即 50 分、下限为 0（不为负）；L0 档棋局不计分 | [核心·不可裁剪]  |
| F-C-03 | 服务端每步合法性校验：所有落子经服务端引擎验证，非法手拒绝并记录（防作弊）                                                                                                                                                                                                                   | [核心·不可裁剪]  |
| F-C-04 | 计时与棋数显示 + 回合时间控制（双方剩余子数、当前回合、每步倒计时；超时由服务端判负，`end_reason=timeout`）                                                                                                                                                                                  | [核心·不可裁剪]  |
| F-E-01 | ELO 评级（主评级，仅人人对局计入；K=32、新手前 10 局为定级期；人机对局不计 ELO）+ 基于 ELO 的匹配队列（经典积分并行，仅作展示/称号）                                                                                                                                                         | [增强·可选/新增] |
| F-E-02 | 合法手提示（hint）                                                                                                                                                                                                                                                                           | [增强·可选/新增] |
| F-E-03 | 悔棋（仅人机/练习模式，服务端记录）                                                                                                                                                                                                                                                          | [增强·可选/新增] |

### 2.2 对战模式

| 编号   | 功能                                                           | 标签             |
| ------ | -------------------------------------------------------------- | ---------------- |
| F-C-05 | 人机离线（「马上玩」）                                         | [核心·不可裁剪]  |
| F-C-06 | 人机在线（服务端托管 AI Bot，等同在线对手）                    | [核心·不可裁剪]  |
| F-C-07 | 人人对战：创建房间 / 加入房间 / 自动加入 / 退出房间 / 房间列表 | [核心·不可裁剪]  |
| F-C-08 | 请求和棋、认输、取消本局                                       | [核心·不可裁剪]  |
| F-C-09 | 公共聊天、房间聊天、在线用户列表                               | [核心·不可裁剪]  |
| F-E-04 | 断线重连 + 状态恢复（基于走子历史回放至断线点）                | [增强·可选/新增] |
| F-E-05 | 观战（只读订阅任意对局，实时接收走子）                         | [增强·可选/新增] |
| F-E-06 | 自动匹配队列（按 ELO 或积分）                                  | [增强·可选/新增] |
| F-E-16 | 再战（Rematch）+ 向指定好友发起对战挑战（challenge）           | [增强·可选/新增] |

### 2.3 AI 对手能力等级（5 档 + L0 热身）

> 难度档以搜索深度为主轴，并加入置换表与走法排序增强。

| 档位 | 名称         | 搜索深度 | 近终局启发(≤14空格) | 残局精确解(≤12空格) | 置换表 | 走法排序 | 备注（约强度）                        |
| ---- | ------------ | -------- | ------------------- | ------------------- | ------ | -------- | ------------------------------------- |
| L1   | 入门         | 1        | 否                  | 否                  | 否     | 否       | 深度 1 + 概率性随机选次优手，新手友好 |
| L2   | 简单         | 2        | 否                  | 否                  | 否     | 否       | 休闲玩家水平                          |
| L3   | 中等（默认） | 4        | 是                  | 否                  | 否     | 是       | 普通玩家                              |
| L4   | 困难         | 6        | 是                  | 是                  | 是     | 是       | 强业余，残局精确                      |
| L5   | 专家         | 8-10     | 是                  | 是                  | 是     | 是       | 准职业；中期可封装 Edax/NN 增强       |

- **默认难度**：L3（中等）。
- **L0（热身，不计分）**：练习/教学档，不计积分、不计入 ELO。
- **接口**：AI 显式提供 `think(board, level, color)` 与 `stop()`，并统一提供**提示（hint）**与**悔棋支持**（由服务端/引擎提供，客户端复用）。

### 2.4 账号与社交

| 编号   | 功能                                                                      | 标签             |
| ------ | ------------------------------------------------------------------------- | ---------------- |
| F-C-10 | 注册向导（用户名/口令/邮箱，口令 argon2/bcrypt）                          | [核心·不可裁剪]  |
| F-C-11 | 登录（保存密码 / 自动登录，JWT/会话）、注销                               | [核心·不可裁剪]  |
| F-C-12 | 个人资料查看 / 修改、查看对手资料                                         | [核心·不可裁剪]  |
| F-C-13 | 在线用户列表、房间聊天、公共聊天                                          | [核心·不可裁剪]  |
| F-E-07 | 好友 / 屏蔽（现代表情/富媒体轻社交）                                      | [增强·可选/新增] |
| F-E-08 | 积分/战绩榜（Leaderboard）                                                | [增强·可选/新增] |
| F-E-18 | 赛季 / 段位 / 徽章（ELO 之上叠加赛季重置与段位晋降、成就徽章）            | [增强·可选/新增] |
| F-E-20 | 聊天反滥用：消息限频、屏蔽词过滤、举报、临时禁言；对局内预设快捷短语/表情 | [增强·可选/新增] |

### 2.5 复盘与观战

| 编号   | 功能                                                                                     | 标签             |
| ------ | ---------------------------------------------------------------------------------------- | ---------------- |
| F-E-09 | 复盘查看器：按走子历史播放 / 单步前进后退 / 跳转至第 N 手 / 显示翻子与比分变化           | [增强·可选/新增] |
| F-E-10 | 观战大厅：浏览进行中对局并一键进入观战                                                   | [增强·可选/新增] |
| F-E-11 | 对局结束后自动生成可分享复盘链接                                                         | [增强·可选/新增] |
| F-E-15 | AI 复盘分析：基于服务端引擎批量分析对局，输出每手评分、评估曲线、妙手/失误标注与建议着法 | [增强·可选/新增] |
| F-E-17 | 战术题库 / 每日挑战：由引擎从历史对局自动生成「找最佳一手」题目 + 每日挑战与连做激励     | [增强·可选/新增] |
| F-E-19 | 标准记谱导出 / 导入（如 f5d6…）：用于分享、导入复盘与题库                                | [增强·可选/新增] |

### 2.6 设置

| 编号   | 功能                                                                                                           | 标签             |
| ------ | -------------------------------------------------------------------------------------------------------------- | ---------------- |
| F-C-14 | AI 难度、离线模式开关、服务器地址、声音/音乐开关、刷新间隔                                                     | [核心·不可裁剪]  |
| F-E-12 | 多语言（i18n）切换                                                                                             | [增强·可选/新增] |
| F-E-13 | 无障碍选项（高对比、键盘可达、屏幕阅读器）；主题模式仅深色（浅色暂不实现）                                     | [增强·可选/新增] |
| F-E-14 | Boss Key 轻量替代（一键将标签页标题/图标切换为中性伪装并模糊页面内容，不依赖浏览器全屏 API，避免触发全屏限制） | [增强·可选/新增] |

> **功能覆盖核对**：核心对战闭环（F-C 系列）已完整定义且不可裁剪；增强能力（F-E 系列）可分期交付，均不影响核心对战闭环。功能面覆盖完整的对战、社交、学习与竞技闭环。

---

## 三、用户故事（场景）

1. **新手首次体验**：作为从未玩过黑白棋的用户，我想注册后立刻用人机「入门」档练习，系统高亮合法手并展示翻子动画，以便我在 5 分钟内理解规则。
2. **换设备继续玩**：作为换设备的用户，我想在任意浏览器登录即玩、无需安装，并查看历史对局用复盘查看器回放学习，以便随时继续我的黑白棋之旅。
3. **对局中断线**：作为在线对战中的用户，我网络闪断后重连，系统基于走子历史恢复棋盘与回合、不扣我分，以便对局继续不受一次波动影响。
4. **观战学习**：作为想提升水平的用户，我从观战大厅进入一场高手对局，实时看到落子与比分而不干扰对局，以便学习。
5. **赛后复盘**：作为竞技用户，对局结束后我打开复盘链接，单步回放关键手、查看每手翻子与比分变化并分享给朋友讨论，以便复盘提高。

---

## 四、数据模型与接口定义

### 4.1 数据库模型（PostgreSQL）

> 采用 UTF8 + 外键约束；`users` 用 argon2id 哈希；ELO 为主评级、`classic_score` 为展示/称号用途；`games`（对局记录）与 `moves`（走子历史）为复盘/观战/重连基础；`chats` 设保留期并按月分区，控制增长。

```sql
-- 用户
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  username      VARCHAR(32)  NOT NULL UNIQUE,
  email         VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,        -- argon2id
  email_verified BOOLEAN NOT NULL DEFAULT false, -- 邮箱验证态
  elo           INT NOT NULL DEFAULT 1500,     -- 现代评级
  classic_score INT NOT NULL DEFAULT 50,       -- 经典积分（注册=50）
  wins          INT NOT NULL DEFAULT 0,
  losses        INT NOT NULL DEFAULT 0,
  draws         INT NOT NULL DEFAULT 0,
  games_played  INT NOT NULL DEFAULT 0,
  status        SMALLINT NOT NULL DEFAULT 1,   -- 1 正常 / 0 禁用 / -1 注销
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ                    -- 软删
);

-- 房间
CREATE TABLE rooms (
  id         BIGSERIAL PRIMARY KEY,
  name       VARCHAR(64) NOT NULL,
  owner_id   BIGINT REFERENCES users(id),
  mode       VARCHAR(16) NOT NULL,   -- human_vs_ai / human_vs_human
  ai_level   SMALLINT,               -- 仅 human_vs_ai 使用
  password   VARCHAR(64),            -- 可选私房口令（哈希存储）
  status     VARCHAR(16) NOT NULL DEFAULT 'waiting', -- waiting/playing/finished
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rooms_status ON rooms(status);

-- 对局记录（复盘/观战/审计基础）
CREATE TABLE games (
  id            BIGSERIAL PRIMARY KEY,
  room_id       BIGINT REFERENCES rooms(id),
  black_id      BIGINT REFERENCES users(id),
  white_id      BIGINT REFERENCES users(id),   -- 人机时为 NULL，ai_level 记录
  ai_level      SMALLINT,                       -- 人机难度档
  ai_color      VARCHAR(8),                     -- 人机对局 AI 执子色 BLACK/WHITE
  mode          VARCHAR(16) NOT NULL,           -- human_vs_ai / human_vs_human
  status        VARCHAR(16) NOT NULL DEFAULT 'playing', -- playing/finished/cancelled
  result        VARCHAR(8),                     -- BLACK / WHITE / DRAW
  end_reason    VARCHAR(16),                    -- normal/resign/draw_agree/disconnect/timeout
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  move_count    INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_games_black ON games(black_id);
CREATE INDEX idx_games_white ON games(white_id);
CREATE INDEX idx_games_status ON games(status);

-- 走子历史（复盘/观战/重连基础）
CREATE TABLE moves (
  id              BIGSERIAL PRIMARY KEY,
  game_id         BIGINT NOT NULL REFERENCES games(id),
  seq             INT NOT NULL,                 -- 第 N 手（含 pass）
  color           VARCHAR(8) NOT NULL,          -- BLACK / WHITE
  pos_x           SMALLINT,                     -- pass 时为 NULL
  pos_y           SMALLINT,
  is_pass         BOOLEAN NOT NULL DEFAULT false,
  flipped         JSONB NOT NULL DEFAULT '[]',  -- [{x,y},...] 被翻棋子
  board_snapshot  JSONB,                         -- 每 N 手存一次全量快照（其余手回放时增量重算），控制存储
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_moves_game_seq ON moves(game_id, seq);

-- 聊天
CREATE TABLE chats (
  id         BIGSERIAL PRIMARY KEY,
  room_id    BIGINT REFERENCES rooms(id),   -- 公共聊天为 NULL
  game_id    BIGINT REFERENCES games(id),
  user_id    BIGINT REFERENCES users(id),
  channel    VARCHAR(16) NOT NULL,          -- public / room
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 评级变更历史（可选）
CREATE TABLE rating_history (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id),
  game_id    BIGINT REFERENCES games(id),
  kind       VARCHAR(8) NOT NULL,           -- elo / classic
  old_value  INT NOT NULL,
  new_value  INT NOT NULL,
  delta      INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 安全审计
CREATE TABLE audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT,
  action     VARCHAR(32) NOT NULL,          -- login / illegal_move / ...
  ip         INET,
  meta       JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 RESTful API（JSON 请求/响应）

> 鉴权：Bearer JWT（HTTP-only Cookie 会话二选一）。

**认证**

```
POST /api/v1/auth/register
{ "username":"alice","email":"a@x.com","password":"***" }
→ 201 { "userId":12,"token":"eyJ...","elo":1500,"classicScore":50 }

POST /api/v1/auth/login
{ "username":"alice","password":"***","remember":true }
→ 200 { "token":"eyJ...","user":{...} }

POST /api/v1/auth/logout
→ 200 { "ok":true }

POST /api/v1/auth/forgot        # 发送重置邮件
{ "email":"a@x.com" }
→ 200 { "ok":true }

POST /api/v1/auth/reset         # 用邮件令牌重置口令
{ "token":"...","password":"***" }
→ 200 { "ok":true }

GET  /api/v1/auth/verify?token=...   # 邮箱验证
→ 200 { "ok":true }
```

**用户**

```
GET  /api/v1/users/:id
→ 200 { "id":12,"username":"alice","elo":1520,"classicScore":63,"wins":10,"losses":4,"draws":1 }

PATCH /api/v1/users/:id
{ "avatar":"...","bio":"..." }
→ 200 { "ok":true }
```

**房间 / 对局**

```
GET  /api/v1/rooms?status=waiting&page=1
→ 200 { "items":[{ "id":5,"name":"友好房","mode":"human_vs_human","status":"waiting" }], "total":20 }

POST /api/v1/rooms
{ "name":"练习","mode":"human_vs_ai","aiLevel":3 }
→ 201 { "id":6,"mode":"human_vs_ai","aiLevel":3 }

POST /api/v1/rooms/:id/join
→ 200 { "gameId":"g_101","color":"WHITE" }

POST /api/v1/rooms/:id/quit
→ 200 { "ok":true }

GET  /api/v1/games/:id
→ 200 { "id":"g_101","blackId":12,"whiteId":null,"aiLevel":3,"status":"playing","moveCount":8 }

POST /api/v1/games            # 发起对局（匹配或建房后）
POST /api/v1/games/:id/cancel # 取消本局
# 终局由服务端引擎判定（双方无手/认输/超时）后自动写库并广播 game_over，无客户端上报入口

GET  /api/v1/games/:id/moves  # 复盘/重连拉取走子历史
→ 200 { "moves":[ {"seq":1,"color":"BLACK","pos":{"x":2,"y":3},"flipped":[{"x":3,"y":3}]}, ... ] }
```

**聊天 / 在线 / 榜单**

```
GET  /api/v1/chats?channel=public&since=1700000000
POST /api/v1/chats  { "channel":"room","roomId":6,"message":"gg" }
GET  /api/v1/online → 200 { "users":[{ "id":12,"username":"alice" }] }
GET  /api/v1/leaderboard?by=elo&limit=50
```

### 4.3 WebSocket 实时对战协议（服务端权威）

> 连接：`wss://host/ws`，建立后首帧发送 `{ "type":"auth", "payload":{ "token":"JWT" } }` 完成鉴权（令牌不走 URL 查询串，避免被代理/日志记录）。统一信封：`{ "type":"<事件>", "payload":{...}, "ts":<ms> }`。
> 落子消息显式携带 `color`，避免靠顺序推断执子色；服务端校验后广播。

```json
// 房间 / 对局生命周期
{ "type":"room_join",   "payload":{ "roomId":6 } }
{ "type":"room_state",  "payload":{ "roomId":6,"gameId":"g_101","blackId":12,"whiteId":9,"status":"playing" } }
{ "type":"game_start",  "payload":{ "gameId":"g_101","blackId":12,"whiteId":9,"turn":"BLACK","board":"<64格初始>" } }

// 落子（显式携带颜色）
{ "type":"move",
  "payload":{
    "gameId":"g_101","seq":9,"color":"BLACK",
    "pos":{"x":2,"y":3},
    "flipped":[{"x":3,"y":3},{"x":3,"y":4}],
    "nextTurn":"WHITE",
    "board":"<走子后 64 格>",
    "blackCount":34,"whiteCount":30
  }}

// 无合法手 → Pass
{ "type":"pass", "payload":{ "gameId":"g_101","color":"BLACK","nextTurn":"WHITE" } }

// 终局（endReason: normal/resign/draw_agree/disconnect/timeout；超时由服务端回合倒计时到点判负）
{ "type":"game_over", "payload":{ "gameId":"g_101","result":"BLACK","endReason":"normal","blackCount":42,"whiteCount":22 } }

// 和棋 / 认输
{ "type":"draw_request",  "payload":{ "gameId":"g_101" } }
{ "type":"draw_response", "payload":{ "gameId":"g_101","accept":true } }
{ "type":"resign",        "payload":{ "gameId":"g_101","color":"WHITE" } }

// 再战 / 好友挑战
{ "type":"rematch_request",  "payload":{ "gameId":"g_101" } }
{ "type":"rematch_response", "payload":{ "gameId":"g_101","accept":true } }
{ "type":"challenge",        "payload":{ "toUserId":9,"aiLevel":null } }

// 断线重连（基于走子历史回放）
{ "type":"reconnect", "payload":{ "gameId":"g_101","lastSeq":10 } }
→ 服务端回 { "type":"state_sync", "payload":{ "gameId":"g_101","turn":"WHITE","board":"...","moves":[ /* seq 11.. */ ] } }

// 观战（只读订阅）
{ "type":"spectate_join",  "payload":{ "gameId":"g_101" } }
{ "type":"spectate_leave", "payload":{ "gameId":"g_101" } }

// 心跳 / 错误
{ "type":"ping" }  → { "type":"pong" }
{ "type":"error", "payload":{ "code":"ILLEGAL_MOVE","msg":"非法落子" } }
```

---

## 五、前端界面需求

### 5.1 页面与组件建议

| 页面                 | 核心组件                                                                                                                                            | 说明                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 首页（Home）         | `HeroBoard`（装饰棋盘）、`QuickStartCard`（快速开局矩阵）、`LiveGames`（直播观战）、`RecentGames`（最近对局）                                       | 落地页双态：未登录=试玩漏斗（F-C-05 入口），已登录=行动中枢                            |
| 大厅（Lobby）        | `LobbyHeader`、`RoomList`、`MatchmakingCard`、`LeaderboardPreview`                                                                                  | 房间列表、一键匹配、快速人机入口                                                       |
| 房间（Room）         | `RoomCard`、`PlayerSlot`、`ChatPanel`、`ReadyButton`                                                                                                | 建房/加入/自动加入、房间聊天                                                           |
| 对局页（Game）       | `BoardCanvas`（Canvas/SVG）、`Piece`、`.legal-hint`、`TurnIndicator`、`Timer`、`ScoreBar`、`MoveLog`、`ControlBar`（认输/和棋/提示/悔棋/退出/再战） | 棋盘交互、合法手高亮、计时棋数                                                         |
| 离线练习（Local）    | `BoardCanvas`、`ScoreBar`、`ControlSidebar`（比分/回合/难度/提示/悔棋/新对局/小贴士）                                                               | F-C-05 人机离线「马上玩」，`/local` 全高棋盘页，免登录·不计分，顶栏含返回首页/大厅出口 |
| 个人中心（Profile）  | `ProfileCard`、`StatsBoard`（ELO/战绩）、`GameHistory`                                                                                              | 资料查看/修改、历史对局                                                                |
| 设置（Settings）     | `SettingsForm`（难度/语言/主题/声音/无障碍/BossKey）                                                                                                | 基础设置 + 现代项                                                                      |
| 复盘查看器（Replay） | `ReplayBoard`、`Timeline`、`StepControls`（播放/暂停/单步/跳转）、`EvalChart`（AI 评估曲线）、`ShareLink`                                           | 基于走子历史回放 + AI 复盘分析                                                         |
| 404（NotFound）      | `NotFoundBoard`（棋子拼「404」+ 初始局面迷失格）                                                                                                    | 未匹配路由兜底页，含回首页/去大厅/马上玩三出口                                         |

### 5.2 交互要点

- **棋盘交互**：点击空格落子；合法手以圆点/高亮提示；落子动画翻子；支持触屏点击（移动端）。
- **响应式**：桌面双栏（棋盘 + 侧栏聊天/棋谱）；移动端单栏堆叠，聊天可收起。
- **无障碍**：棋盘格子带 `aria-label`（如 “D3 黑”）；全键盘可达（焦点在 8×8 栅格间移动、回车落子）；高对比主题；色盲友好（黑白子除颜色外以描边/纹理区分）；尊重 `prefers-reduced-motion`。
- **组件化**：状态用 Pinia（Vue3）；棋盘渲染与引擎解耦，便于 WASM AI 接入。

---

## 六、非功能性需求

### 6.1 性能

- **WebSocket 并发**：单节点支撑 ≥ 5,000 并发连接（进程内房间状态，不使用 Redis 降低复杂度）；进程崩溃/发布通过 `moves` 表回放恢复对局，并支持优雅重启（停止接收新连接、等待在局对局落盘后退出）；跨节点广播抽象为一个轻量 pub/sub 接口层（v1 单节点空实现，后续可接 Redis/NATS，避免返工）；消息端到端延迟 < 100ms（同区）。
- **落子广播**：服务端校验 + 广播 < 50ms（不含 AI 思考）。
- **复盘加载**：千手对局 `moves` 拉取 < 300ms。

### 6.2 安全性

- 鉴权 **JWT（短期访问 + 刷新令牌）/ HTTP-only 会话**。
- 口令 **argon2id** 哈希存储；房间私房口令同样哈希存储。
- **服务端校验每步合法性**（`F-C-03`）：非法手拒绝 + 审计记录，天然防作弊。
- **防作弊**：凡计分对局，AI 与对局结果均由服务端产生（在线人机为服务端托管 Bot）；离线练习（F-C-05）在浏览器内跑 WASM AI 但不计分/不计 ELO；客户端不得自行决定计分对局结果，终局以服务端 `game_over` 为准。
- **输入校验**：所有 REST/WS 入参严格 schema 校验（坐标范围、seq 连续性、token 有效）。
- 限流：登录/注册防爆破；WS 消息频率限流；聊天含屏蔽词过滤、举报与临时禁言（见 F-E-20）。

### 6.3 兼容性

- 跨平台现代浏览器（Chrome/Edge/Firefox/Safari 最近 2 大版本）；iOS/Android 移动端响应式。

### 6.4 可维护性

- 前后端 TypeScript 强类型；接口契约（OpenAPI + WS schema）单一来源；规则引擎纯函数化、单测覆盖（含初盘、Pass、终局比子边界）。
- 模块化：规则引擎 / AI / 匹配 / 房间 / 聊天 解耦。

### 6.5 可观测性

- 结构化日志（请求/WS 事件/AI 思考耗时/非法手）；指标（在线数、对局数、AI 时延分位、WS 错误率）；分布式追踪；告警（WS 断连率、AI 超时率）。

### 6.6 i18n

- 所有 UI 文案走 i18n 资源（zh-CN 默认，en 等可扩展）。

---

## 七、需求池（P0/P1/P2）

> 编号沿用功能清单 F 系列；工作量估算单位：人日（pd）。

| 编号            | 需求                             | 优先级 | 验收标准（Given/When/Then 摘要）                                                                | 估算 |
| --------------- | -------------------------------- | ------ | ----------------------------------------------------------------------------------------------- | ---- |
| F-C-01          | 8×8 规则引擎                     | P0     | Given 初盘，When 任意合法手，Then 8 方向正确翻子；双方无手 Then 终局比子返结果                  | 5pd  |
| F-C-02          | 积分公式                         | P0     | Given 对局结束，When 写分，Then 按公式(±3/±2/+1/追加/断线)更新 classic_score                    | 2pd  |
| F-C-03          | 服务端每步校验                   | P0     | Given 客户端发落子，When 服务端验为非法，Then 拒收+记录审计+不断局                              | 3pd  |
| F-C-04          | 计时/棋数 + 回合时间控制         | P0     | Given 对局中，When 任一手或倒计时归零，Then 子数/回合/倒计时实时更新，超时判负                  | 2pd  |
| F-C-05/06/07    | 人机离线/在线 + 人人房间         | P0     | Given 用户建房/加入/人机，When 开始，Then 进入对局且服务端权威                                  | 8pd  |
| F-C-08          | 和棋/认输/取消                   | P0     | Given 对局中，When 认输，Then 对方胜、写库、不计断线                                            | 2pd  |
| F-C-09          | 聊天/在线列表                    | P0     | Given 房间/公共，When 发消息，Then 广播且持久化 chats                                           | 3pd  |
| F-C-10/11/12/13 | 账号/资料/社交查看               | P0     | Given 注册，When 登录，Then 签发 JWT；资料可改可查                                              | 6pd  |
| F-C-14          | 基础设置                         | P0     | Given 设置页，When 改难度/声音/服务器，Then 持久化并生效                                        | 2pd  |
| F-E-01          | ELO + 匹配                       | P1     | Given 两对手（仅人人对局），When 对局结束，Then 按 ELO 公式(K=32)更新双方 elo；人机对局不计 ELO | 3pd  |
| F-E-02/03       | 提示/悔棋                        | P1     | Given 人机模式，When 请求提示，Then 返回最优/合法手；悔棋回退一手                               | 3pd  |
| F-E-04          | 断线重连                         | P1     | Given 断线，When 重连带 lastSeq，Then 回放 moves 恢复状态                                       | 4pd  |
| F-E-05/10       | 观战 + 观战大厅                  | P1     | Given 旁观者，When 订阅 gameId，Then 实时收到走子且不改变对局                                   | 3pd  |
| F-E-09/11       | 复盘查看器 + 分享                | P1     | Given 已结束对局，When 打开复盘，Then 可步进/跳转/分享链接                                      | 4pd  |
| F-E-06          | 自动匹配队列                     | P2     | Given 排队，When 匹配到相近 ELO，Then 自动建房开局                                              | 3pd  |
| F-E-07/08       | 好友/屏蔽 + 榜单                 | P2     | Given 用户，When 加好友/看榜，Then 关系与排名正确                                               | 3pd  |
| F-E-12/13/14    | i18n/主题/无障碍/BossKey         | P2     | Given 设置，When 切换语言/主题/无障碍，Then UI 即时生效且可访问                                 | 5pd  |
| F-E-15/17       | AI 复盘分析 / 战术题库·每日挑战  | P2     | Given 已结束对局或题目，When 请求分析/答题，Then 输出评估曲线/失误标注或判定答案                | 4pd  |
| F-E-16/19       | 再战·好友挑战 / 标准记谱导出导入 | P2     | Given 对局结束或选定好友，When 发起再战/挑战/导出，Then 建立新局或生成可导入记谱                | 3pd  |
| F-E-18/20       | 赛季段位徽章 / 聊天反滥用        | P2     | Given 赛季或聊天，When 结算段位/触发滥用规则，Then 正确晋降并限频/屏蔽/禁言                     | 4pd  |

---

## 八、关键流程 / UI 草图

### 8.1 落子流程（服务端权威）

```
玩家A 点击空格
   │
   ▼
客户端 → WS: {type:"move", gameId, color:"BLACK", pos}
   │
   ▼
服务端引擎: 校验合法手? ──否──► WS: {type:"error", code:"ILLEGAL_MOVE"}
   │ 是
   ▼
计算 flipped + 翻子 + 切换 turn + 写入 moves(seq)
   │
   ▼
WS 广播: {type:"move", payload:{seq,color,pos,flipped,nextTurn,board,counts}}
   │
   ▼
双方客户端渲染翻子动画；若对方无手→发 pass；双方无手→game_over
```

### 8.2 WebSocket 对战时序（人机在线）

```
ClientA ──room_join──► Server ──spawn AI Bot(white)──►
Server ──game_start(BLACK=A, WHITE=Bot)──► ClientA
ClientA ──move(BLACK)──► Server ──校验/翻子/写moves──► 广播 move
Server ──think(WHITE, level)──► AI Engine(WASM)
AI Engine ──move(WHITE)──► Server ──校验/写moves──► 广播 move ──► ClientA
   ...循环至 game_over → 写 games.result + 更新积分/ELO
```

### 8.3 AI 调用流程（服务端托管）

```
对局需要 AI 落子
   │
   ▼
Server: think(board_bitboard, level, color)
   │  (WASM NegaScout + 权重表)
   ▼  empties≤12? ──是──► 残局穷举(精确)
      empties≤14? ──是──► 近终局启发
      置换表命中? ──是──► 直接取值
   ▼
返回 {pos, flipped} ──超时降级深度──► 返回次优合法手
```

### 8.4 大厅 / 对局页 UI 草图（ASCII）

```
┌─────────────────────────── Lobby ──────────────────────────┐
│ [匹配队列] [人机:难度▾]   在线:1280   积分榜▸                  │
│ ┌─ 房间列表 ─────────────┐ ┌─ 公共聊天 ───────────────┐      │
│ │ #1 友好房  人人  等待   │ │ alice: hi               │      │
│ │ #2 练习   人机L3 进行   │ │ bob:   gg               │      │
│ └───────────────────────┘ └────────────────────────┘       │
└────────────────────────────────────────────────────────────┘

┌──────────── Game ────────────┐ ┌─ Side ─┐
│  ┌──┐┌──┐┌──┐ ... 8×8 Board  │ │ 黑 34  │
│  │● ││  ││○ │     ●合法点高亮  │ │ 白 30  │
│  └──┘└──┘└──┘                │ │ 回合:黑 │
│                              │ │ [提示]  │
│  [认输][和棋][悔棋][退出]       │ │ [聊]   │
└───────────────────────────────┘ └───────┘
```

---

## 九、Non-goals（本产品不做什么）

- ❌ 不做跨棋种（仅 Othello/Reversi 8×8 标准规则，不做 10×10 等变体）。
- ❌ v1 不做社交图谱/动态 feed、战队/公会、赛事系统（留待 P2+）。
- ❌ 不训练需大量算力的完整 AlphaZero 自对弈（仅作为 L5 长期可选增强，非基线）。
- ❌ v1 不做 Socks5/HTTP 代理作为核心能力（Web 通常无需，仅可选）。
- ❌ v1 不做国际化完整多语言包（框架就位，首批 zh-CN + en，其余 P2）。

---

## 十、路线图与里程碑

> **规划假设**：4 人核心团队（2 后端 / 1 前端 / 1 全栈兼 AI 工程），设计兼职；迭代 2 周；有效交付速率 ≈ 12 pd/迭代。§7 需求池的 pd 为**净功能开发估算**（约 75 pd，含新增增强项），叠加基础设施、联调、测试、压测、安全审计、缺陷修复与缓冲后，端到端交付工作量 ≈ 160-180 pd，对应 **14-16 迭代（约 7-8 个月）**；

### 10.1 路线图阶段表

| 阶段                | 主题                                | 关键交付（需求编号）                                                                                                                                           | 负责人角色                        | 主要风险                                                      |
| ------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| **M0 奠基**         | 基础设施 + 规则内核 + 数据层 + 账号 | 脚手架/CI-CD、PostgreSQL 数据模型（含 moves 落子序列表，弃用 Redis）、F-C-01 规则引擎、F-C-02 积分公式、F-C-10/11/12/13 账号/资料/社交查看、AI WASM 可行性验证 | 后端负责人、前端负责人、AI 工程师 | 技术栈搭建延期；AI WASM 性能未验证即承诺排期；数据模型返工    |
| **M1 核心对战闭环** | 服务端权威实时对战                  | F-C-03 每步校验、F-C-04 计时/棋数、F-C-05/06/07 人机离线/在线+人人房间、F-C-08 和棋/认输/取消、F-C-09 聊天/在线、F-C-14 基础设置                               | 后端负责人、前端负责人、AI 工程师 | WebSocket 并发与状态一致性；AI 移植性能；离线/在线状态机复杂  |
| **M2 增强能力**     | 匹配 · 复盘 · 观战 · 社交           | F-E-01 ELO+匹配、F-E-02/03 提示/悔棋、F-E-04 断线重连、F-E-05/10 观战+大厅、F-E-09/11 复盘+分享、F-E-06 自动匹配队列、F-E-07/08 好友/屏蔽+榜单                 | 后端负责人、前端负责人            | 匹配并发与 ELO 冷启动；断线重连状态恢复；复盘数据量与存储成本 |
| **M3 打磨与上线**   | 国际化 · 无障碍 · 压测 · GA         | F-E-12/13/14 i18n/主题/无障碍/BossKey、安全审计、压测、Beta→GA                                                                                                 | 前端负责人、后端负责人、QA/DevOps | 多语言/无障碍返工；上线稳定性                                 |

### 10.2 迭代级时间线（2 周迭代）

| 迭代    | 阶段 | 目标摘要                                                       |
| ------- | ---- | -------------------------------------------------------------- |
| S1-S3   | M0   | 脚手架、数据层（moves 表）、规则引擎 v1、账号体系、AI WASM PoC |
| S4-S7   | M1   | 服务端校验 + WebSocket 对战 + 人机/人人房间 + 聊天/在线        |
| S8-S12  | M2   | ELO 匹配、提示/悔棋、断线重连、观战、复盘、社交/榜单           |
| S13-S18 | M3   | i18n/主题/无障碍、压测/审计、Beta→GA                           |

> 注：M3 含 1-2 迭代弹性用于缺陷修复与上线守稳定。

### 10.3 里程碑出口（每阶段可验证出口）

- **M0 出口 —「地基可用」**：CI/CD 贯通；规则引擎单测覆盖 ≥95% 且通过棋规一致性校验；PostgreSQL 表结构冻结（含 moves 落子序列表）；账号注册/登录/资料 API 联调通过；AI WASM PoC 在浏览器内完成单步搜索并定下性能基线（延时上限）。
- **M1 出口 —「对战闭环」**：人机（离线+在线）与人人 WebSocket 对战可玩；服务端每步校验生效（客户端非法走子被拒，防作弊）；计时/棋数/和棋/认输/取消全流程可用；聊天与在线列表上线。
- **M2 出口 —「增强可用」**：ELO rating 生效并驱动匹配；提示/悔棋可用；断线重连成功率达标；观战大厅 + 复盘查看器 + 分享可用；好友/屏蔽/榜单上线。
- **M3 出口 —「生产上线」**：i18n 多语言 + 主题/无障碍/BossKey 上线；压测达目标并发；安全审计通过；Beta→GA 正式发布。

### 10.4 优先级排序说明

- **P0 先于 P1/P2 的根本原因**：P0 定义了「可玩且可信」的最小产品——规则内核、服务端权威校验（防作弊）、人机/人人对战、账号体系。缺失任一即无产品。P1 是留存/参与增强（匹配、复盘、观战），P2 是体验打磨（i18n、无障碍）与可选社交。先交付 P0 可尽早进入内部可玩验证，降低架构返工风险。
- **可前置的 P1/P2 项（与数据层/架构同期设计，避免返工）**：
  - **F-E-09/11 复盘查看器 + 分享** 强依赖 moves 落子序列表，若不在 M0 数据层一并设计，M2 需返工存储 → **moves 表在 M0 冻结**。
  - **F-E-04 断线重连** 需在 M1 WebSocket 会话/状态机设计时预留重连令牌与房间状态快照接口，否则 M2 补做成本高 → **M1 预留架构钩子**。
  - **F-E-02/03 提示/悔棋** 复用 F-C-01 规则引擎的合法走子枚举，引擎稳定后可在 M1 末或 M2 初低成本前置。
  - **F-E-01 ELO + F-E-06 自动匹配队列** 依赖账号与对局结果写入，M1 对局闭环完成后即可启动，故置于 M2 靠前。

### 10.5 关键风险与缓解

| 风险                                        | 影响                               | 缓解措施                                                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AI WASM 性能**（NegaScout/bitboard 移植） | 高难度搜索延时高，影响在线人机体验 | M0 即做 PoC 定性能基线；分级搜索深度 + 迭代加深 + 超时兜底；难度档位对应固定搜索预算                                                                                                                   |
| **WebSocket 并发与服务端权威状态一致**      | 对战高峰连接/消息风暴、状态错乱    | 进程内房间状态（弃用 Redis，降低复杂度）；崩溃/发布借 `moves` 表回放恢复 + 优雅重启；跨节点广播预留轻量 pub/sub 抽象层（后续可接 Redis/NATS）；每步服务端校验（F-C-03）；连接限流与心跳；M3 前完成压测 |
| **断线重连与状态恢复复杂度**                | 重连后棋局不一致、观战错位         | M1 预留重连令牌/快照接口（见 §10.4）；房间状态以服务端为准；客户端幂等重放                                                                                                                             |

### 10.6 干系人沟通要点

**高管版（战略 / 业务）**

- 按 M0→M3 四阶段推进，目标完成现代化平台 GA，实现跨端、防作弊、实时对战的体验。
- 核心不可裁剪范围（P0）优先保障；匹配/复盘/观战等增强能力在 M2 兑现，直接提升留存与参与预期。
- 需决策：是否接受春节前后的排期弹性。

**工程版（技术 / 排期）**

- 技术栈 Vue3+TS+Tailwind / Node·Fastify+ws / PostgreSQL（不使用 Redis）；AI 以 TS/WASM 移植 NegaScout，M0 须完成性能 PoC 与 moves 表冻结。
- M1 实现服务端每步校验（F-C-03）+ WebSocket 权威对战；重连/复盘相关存储与接口请在 M0/M1 同期预留，避免 M2 返工。
- 关键路径：数据层 → 规则引擎 → 对战闭环 → 匹配/复盘；M3 前完成压测与安全审计。

**设计版（体验 / 视觉）**

- M1 交付对战核心界面与计时/棋数/聊天等基础交互；M2 补充分享、观战、社交与榜单等多人场景界面。
- M3 统一 i18n 文案框架、主题切换与无障碍（WCAG）规范，请在 M2 末提供设计语言与组件库，避免上线前大规模返工。
- BossKey/代理等桌面端特性需明确交互与平台边界，建议 M3 早期对齐。

---

## 行动清单

| #   | 行动                                                                                                                                   | 负责方       | 时间窗         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------- |
| 1   | 冻结技术栈与脚手架（Vue3+TS+Tailwind+Vite / Node·Fastify+ws / PostgreSQL，弃用 Redis），打通 CI/CD                                     | 工程负责人   | M0             |
| 2   | 设计 PostgreSQL 数据模型（含 `games`/`moves` 落子序列表）并冻结                                                                        | 后端负责人   | M0             |
| 3   | 移植 8×8 规则引擎（F-C-01）+ 积分公式（F-C-02），单测覆盖 ≥95%                                                                         | 后端负责人   | M0             |
| 4   | 完成 AI WASM PoC（NegaScout+bitboard）并定性能基线（各档时延上限）                                                                     | AI 工程师    | M0             |
| 5   | 实现账号体系（F-C-10/11/12/13）+ 基础设置（F-C-14），签发 JWT、argon2id 哈希                                                           | 后端+前端    | M0             |
| 6   | 服务端权威 WebSocket 对战闭环（F-C-03/04/05/06/07/08/09）+ 每步校验防作弊                                                              | 后端+前端    | M1             |
| 7   | M1 预留断线重连令牌/房间快照接口，moves 表支撑后续重连/复盘                                                                            | 后端负责人   | M1             |
| 8   | 增强能力：ELO 匹配 / 提示悔棋 / 断线重连 / 观战 / 复盘分享 / 社交榜单（F-E-01~11）+ AI 复盘分析 / 再战·挑战 / 标准记谱（F-E-15/16/19） | 后端+前端    | M2             |
| 9   | 国际化 / 主题 / 无障碍 / BossKey（F-E-12~14）+ 战术题库·赛季·聊天治理（F-E-17/18/20）+ 压测与安全审计                                  | 前端+后端+QA | M3             |
| 10  | 决策待确认问题（评级策略、i18n 首批语言、复盘权限），对齐高管与产品负责人                                                              | 产品负责人   | 启动前 / M0 内 |

---

## 待确认问题

1. **~~评级策略~~**（已定）：**ELO 为主评级**并驱动匹配（仅人人对局、K=32、前 10 局定级期，人机不计 ELO）；经典积分保留为展示/称号用途，设 0 下限。
2. **AI 托管成本**：L4/L5 在线人机并发时的算力预算与实例数（是否按需启 WASM 工作进程）？
3. **匹配范围**：v1 是否必须上线自动匹配队列（F-E-06），还是先以房间制为主？
4. **复盘存储**：`moves.board_snapshot` 每手全量快照（存储大）还是仅存增量（回放时重算）？需定存储/性能取舍。
5. **i18n 首批语言**：除 zh-CN 外，en 是否 v1 必交付？其他语种优先级？
6. **观战与复盘权限**：是否允许旁观未结束对局？复盘链接是否公开可分享（涉隐私）？
7. **Boss Key**：浏览器环境下隐藏/模糊的合规与体验细节（避免触发浏览器全屏限制）？

---

## 文档说明

本文档由产品战略团队需求分析师主导编写，并经现代 Othello/Reversi 竞品对标校准。重要决策请由产品负责人审定。

[附录 A · 术语表 · 命名与工程约定](appendix-a-glossary-and-conventions.md)

[附录 B · 需求验收标准](appendix-b-acceptance-criteria.md)

[附录 C · 数据/接口/WebSocket 契约与状态机](appendix-c-ws-contracts-and-state-machines.md)

[附录 D · 开发任务清单](appendix-d-task-checklist.md)
