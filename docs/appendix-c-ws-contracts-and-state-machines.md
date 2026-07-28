# 附录 C · 数据/接口/WebSocket 契约与状态机

> 强类型契约层：以 `packages/shared` 为**单一来源**（TS 类型 + Zod schema）。REST 见主文档 §4.2、WS 见 §4.3、库表见 §4.1；本页把它们固化为可直接落地的类型与状态机。**契约与其他层冲突时以本页/§4 为准；不得新增未定义字段。**

---

## C.1 共享类型（`packages/shared`）

```tsx
// contracts.ts — 领域基础类型
export type Color = 'BLACK' | 'WHITE'
export type Cell = 0 | 1 | 2 // T_NONE | T_BLACK | T_WHITE
export type Pos = { x: number; y: number } // 0..7
export type AiLevel = 0 | 1 | 2 | 3 | 4 | 5 // L0 热身不计分

export type GameMode = 'human_vs_ai' | 'human_vs_human'
export type GameResult = 'BLACK' | 'WHITE' | 'DRAW'
export type EndReason = 'normal' | 'resign' | 'draw_agree' | 'disconnect' | 'timeout'
export type RoomStatus = 'waiting' | 'playing' | 'finished'
export type GameStatus = 'playing' | 'finished' | 'cancelled'

export interface MoveDTO {
  seq: number
  color: Color
  pos: Pos | null // null 表示 pass
  isPass: boolean
  flipped: Pos[]
}

export interface GameStateDTO {
  gameId: string
  board: Cell[] // 长度 64
  turn: Color
  blackCount: number
  whiteCount: number
  status: GameStatus
}

export interface RoomDTO {
  id: number
  name: string
  mode: GameMode
  aiLevel: AiLevel | null
  status: RoomStatus
}
```

> DTO 为 `camelCase`，与库表 `snake_case`（§4.1）的映射集中在 `packages/shared/src/dto.ts`。

---

## C.2 统一错误码表

> REST 返回 `{ error: { code, msg } }`；WS 返回 `{ type: 'error', payload: { code, msg } }`。

| code             | 场景                      | 载体 / HTTP   |
| ---------------- | ------------------------- | ------------- |
| AUTH_REQUIRED    | 未鉴权或首帧未发 auth     | WS 断开 / 401 |
| INVALID_TOKEN    | JWT 无效/过期             | WS / 401      |
| ILLEGAL_MOVE     | 非法落子（F-C-03）        | WS error      |
| NOT_YOUR_TURN    | 非该方回合落子            | WS error      |
| ROOM_FULL        | 房间已满                  | WS / 409      |
| ROOM_NOT_FOUND   | 房间不存在                | WS / 404      |
| GAME_NOT_FOUND   | 对局不存在                | WS / 404      |
| RATE_LIMITED     | 限频（登录/聊天/WS 消息） | WS / 429      |
| VALIDATION_ERROR | Zod 入参校验失败          | WS / 400      |
| INTERNAL         | 未预期服务端错误          | WS / 500      |

---

## C.3 WebSocket 消息字典

> 信封：`{ type, payload, ts }`。方向：C→S 客户端发，S→C 服务端发。字段细节见主文档 §4.3。

| type                               | 方向       | 触发时机                            | 关键字段                                                                               |
| ---------------------------------- | ---------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| auth                               | C→S        | 连接后首帧（必须）                  | token                                                                                  |
| room_join                          | C→S        | 加入房间                            | roomId                                                                                 |
| room_state                         | S→C        | 房间/座位变化                       | roomId, gameId, status, blackId, whiteId, blackReady, whiteReady, blackName, whiteName |
| room_ready                         | C→S        | 玩家准备/取消准备（人人房，未开局） | roomId, ready                                                                          |
| room_start                         | C→S        | 房主开局（双方均准备）              | roomId                                                                                 |
| game_start                         | S→C        | 对局开始                            | gameId, turn, board                                                                    |
| move                               | C→S 并 S→C | 落子（显式携 color）/ 广播结果      | gameId, seq, color, pos, flipped, nextTurn, board, counts                              |
| pass                               | S→C        | 无合法手自动换手                    | gameId, color, nextTurn                                                                |
| game_over                          | S→C        | 服务端判定终局                      | gameId, result, endReason, counts                                                      |
| draw_request / draw_response       | C→S        | 和棋请求/应答                       | gameId, accept                                                                         |
| resign                             | C→S        | 认输                                | gameId, color                                                                          |
| rematch_request / rematch_response | C→S        | 再战（F-E-16）                      | gameId, accept                                                                         |
| challenge                          | C→S        | 好友挑战（F-E-16）                  | toUserId, aiLevel                                                                      |
| reconnect / state_sync             | C→S / S→C  | 断线重连（F-E-04）                  | gameId, lastSeq / board, moves                                                         |
| spectate_join / spectate_leave     | C→S        | 观战订阅（F-E-05）                  | gameId                                                                                 |
| chat                               | C→S 并 S→C | 聊天（限频/过滤 F-E-20）            | channel, roomId, message                                                               |
| ping / pong                        | C→S / S→C  | 心跳                                | —                                                                                      |
| error                              | S→C        | 任何错误                            | code, msg                                                                              |

---

## C.4 状态机

**房间（Room）**

```
waiting ──双方就位──► ready ──双方准备+房主开局──► playing ──终局/取消──► finished
   │
   └──房主解散/无人──► finished(关闭)
```

> `ready` 为 `waiting` 状态下的子阶段：双方已就位但未全部准备。`rooms.status` 仍只用 `waiting/playing/finished`，就位与准备通过 `black_ready/white_ready` 字段区分。人人房须双方点准备 + 房主点 `room_start` 才进入 `playing`；人机房 `room_join` 即开局。

**对局（Game）**

```
playing ──normal/resign/draw_agree/timeout/disconnect──► finished(写 result)
playing ──未开局或双方同意──► cancelled(不计分)
```

**回合（Turn）**

```
BLACK ─(合法手/pass)→ WHITE ─(合法手/pass)→ BLACK ...
双方连续 pass → 触发 game_over(normal)
```

- 所有状态转移以**服务端为权威**；非法转移（如已 finished 再收 move）返回 `error` 且不改状态。

---

## C.5 Zod 契约示例（入参校验，F-C-03 / §6.2）

```tsx
// ws/move.schema.ts
import { z } from 'zod'

export const PosSchema = z.object({
  x: z.number().int().min(0).max(7),
  y: z.number().int().min(0).max(7),
})

export const MovePayloadSchema = z.object({
  gameId: z.string(),
  seq: z.number().int().positive(),
  color: z.enum(['BLACK', 'WHITE']),
  pos: PosSchema,
})
export type MovePayload = z.infer<typeof MovePayloadSchema>
```

> 服务端对每个 WS/REST 入参先过 Zod 校验，失败返 `VALIDATION_ERROR`；通过后再经引擎 `legalMoves` 校验合法性。
