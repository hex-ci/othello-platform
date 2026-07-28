/**
 * WebSocket 消息类型 + Zod schema（附录 C §C.3/C.5）。
 * 信封：{ type, payload, ts }
 */
import { z } from 'zod'

// ─── 基础 schema ───

export const PosSchema = z.object({
  x: z.number().int().min(0).max(7),
  y: z.number().int().min(0).max(7),
})

export const ColorSchema = z.enum(['BLACK', 'WHITE'])

// ─── C→S 消息 ───

export const AuthPayloadSchema = z.object({
  token: z.string().min(1),
})

export const RoomJoinPayloadSchema = z.object({
  roomId: z.number().int().positive(),
})

// 房间准备（人人房，未开局）：玩家准备/取消准备（附录C ready 子阶段）
export const RoomReadyPayloadSchema = z.object({
  roomId: z.number().int().positive(),
  ready: z.boolean(),
})

// 房主开局（人人房，双方均准备后生效）
export const RoomStartPayloadSchema = z.object({
  roomId: z.number().int().positive(),
})

// 房间等待期旁观（观战席，T14 扩展）：加入/退出旁观房间
export const RoomSpectateJoinPayloadSchema = z.object({
  roomId: z.number().int().positive(),
})
export const RoomSpectateLeavePayloadSchema = z.object({
  roomId: z.number().int().positive(),
})

// 房主修改房间设置（未开局，双方未准备）
export const RoomUpdateSettingsPayloadSchema = z.object({
  roomId: z.number().int().positive(),
  // 执子分配：'swap' 交换黑白座；'keep' 不变
  colorAssign: z.enum(['swap', 'keep']).optional(),
  // 是否允许观战
  spectatable: z.boolean().optional(),
  // 房间口令（null=清除口令，string=设置/修改口令，undefined=不改）
  password: z.string().min(1).max(64).nullable().optional(),
})

export const MovePayloadSchema = z.object({
  gameId: z.string(),
  seq: z.number().int().positive(),
  color: ColorSchema,
  pos: PosSchema,
})

export const DrawRequestPayloadSchema = z.object({
  gameId: z.string(),
})

export const DrawResponsePayloadSchema = z.object({
  gameId: z.string(),
  accept: z.boolean(),
})

export const ResignPayloadSchema = z.object({
  gameId: z.string(),
  color: ColorSchema,
})

export const RematchRequestPayloadSchema = z.object({
  gameId: z.string(),
})

export const RematchResponsePayloadSchema = z.object({
  gameId: z.string(),
  accept: z.boolean(),
})

// 离开终局对局页（F-E-16）：通知服务端对方已不可再战，避免发起方卡在等待
export const RematchLeavePayloadSchema = z.object({
  gameId: z.string(),
})

export const ChallengePayloadSchema = z.object({
  toUserId: z.number().int().positive(),
  aiLevel: z.number().int().min(0).max(5).nullable(),
})

export const ChallengeResponsePayloadSchema = z.object({
  fromUserId: z.number().int().positive(),
  accept: z.boolean(),
})

export const ReconnectPayloadSchema = z.object({
  gameId: z.string(),
  lastSeq: z.number().int().min(0),
})

export const SpectateJoinPayloadSchema = z.object({
  gameId: z.string(),
})

export const SpectateLeavePayloadSchema = z.object({
  gameId: z.string(),
})

export const ChatPayloadSchema = z.object({
  channel: z.enum(['public', 'room']),
  roomId: z.number().int().positive().optional(),
  message: z.string().min(1).max(500),
})

export const CancelPayloadSchema = z.object({
  gameId: z.string(),
})

// ─── 匹配（T11，F-E-06）───

export const MatchJoinPayloadSchema = z.object({}).optional()

export const MatchLeavePayloadSchema = z.object({}).optional()

export const MatchFoundPayloadSchema = z.object({
  roomId: z.number().int().positive(),
  opponent: z.number().int().nullable().optional(),
})

export const MatchTimeoutPayloadSchema = z.object({}).optional()

// ─── 提示/悔棋（T12，仅人机）───

export const HintRequestPayloadSchema = z.object({
  gameId: z.string(),
})

export const HintResponsePayloadSchema = z.object({
  gameId: z.string(),
  pos: PosSchema.nullable(),
})

export const UndoRequestPayloadSchema = z.object({
  gameId: z.string(),
})

export const UndoResponsePayloadSchema = z.object({
  gameId: z.string(),
  success: z.boolean(),
  board: z.array(z.number().int().min(0).max(2)).length(64),
  turn: ColorSchema,
  moveCount: z.number().int().min(0),
})

// ─── S→C 广播载荷 ───

export const RoomStatePayloadSchema = z.object({
  roomId: z.number().int().positive(),
  gameId: z.string().nullable(),
  blackId: z.number().int().nullable(),
  whiteId: z.number().int().nullable(),
  status: z.enum(['waiting', 'playing', 'finished']),
  // 人人房 ready 子阶段：双方就位、未全部准备（附录C ready 子阶段）
  blackReady: z.boolean().optional(),
  whiteReady: z.boolean().optional(),
  blackName: z.string().nullable().optional(),
  whiteName: z.string().nullable().optional(),
  // 房主 userId（仅房主可开局）
  ownerId: z.number().int().nullable().optional(),
  // 房间名（显示用）
  roomName: z.string().optional(),
  // 房间是否允许观战（房主设置）
  spectatable: z.boolean().optional(),
  // 旁观者列表（房间等待期观战席，T14 扩展）
  spectators: z.array(z.object({ userId: z.number().int(), username: z.string() })).optional(),
})

export const GameStartPayloadSchema = z.object({
  gameId: z.string(),
  blackId: z.number().int().nullable(),
  whiteId: z.number().int().nullable(),
  blackName: z.string().nullable().optional(),
  whiteName: z.string().nullable().optional(),
  turn: ColorSchema,
  board: z.array(z.number().int().min(0).max(2)).length(64),
  aiLevel: z.number().int().min(0).max(5).nullable().optional(),
  aiColor: ColorSchema.nullable().optional(),
  // 当前回合剩余毫秒（服务端权威，前端据此初始化每步倒计时，人机 120s / 人人 30s）
  remainingMs: z.number().int().min(0).optional(),
  // 重入/重连补发时携带已有走子历史，供前端恢复 moveLog（F-E-04）；全新开局省略
  moves: z
    .array(
      z.object({
        seq: z.number().int().positive(),
        color: ColorSchema,
        pos: PosSchema.nullable(),
        isPass: z.boolean(),
      }),
    )
    .optional(),
})

export const MoveBroadcastPayloadSchema = z.object({
  gameId: z.string(),
  seq: z.number().int().positive(),
  color: ColorSchema,
  pos: PosSchema.nullable(),
  flipped: z.array(PosSchema),
  nextTurn: ColorSchema.nullable(),
  board: z.array(z.number().int().min(0).max(2)).length(64),
  blackCount: z.number().int().min(0),
  whiteCount: z.number().int().min(0),
  // 下一回合剩余毫秒（服务端权威，落子后重置倒计时）
  remainingMs: z.number().int().min(0).optional(),
})

export const PassPayloadSchema = z.object({
  gameId: z.string(),
  color: ColorSchema,
  nextTurn: ColorSchema,
  // 下一回合剩余毫秒（服务端权威，pass 后重置倒计时）
  remainingMs: z.number().int().min(0).optional(),
})

export const GameOverPayloadSchema = z.object({
  gameId: z.string(),
  result: z.enum(['BLACK', 'WHITE', 'DRAW']),
  endReason: z.enum(['normal', 'resign', 'draw_agree', 'disconnect', 'timeout']),
  blackCount: z.number().int().min(0),
  whiteCount: z.number().int().min(0),
})

export const StateSyncPayloadSchema = z.object({
  gameId: z.string(),
  turn: ColorSchema,
  board: z.array(z.number().int().min(0).max(2)).length(64),
  blackCount: z.number().int().min(0),
  whiteCount: z.number().int().min(0),
  blackId: z.number().int().nullable(),
  whiteId: z.number().int().nullable(),
  blackName: z.string().nullable().optional(),
  whiteName: z.string().nullable().optional(),
  remainingMs: z.number().int().min(0),
  status: z.enum(['playing', 'finished', 'cancelled']),
  moves: z.array(
    z.object({
      seq: z.number().int().positive(),
      color: ColorSchema,
      pos: PosSchema.nullable(),
      isPass: z.boolean(),
      flipped: z.array(PosSchema),
    }),
  ),
})

export const ChatBroadcastPayloadSchema = z.object({
  channel: z.enum(['public', 'room']),
  roomId: z.number().int().positive().nullable(),
  userId: z.number().int(),
  username: z.string(),
  message: z.string(),
  ts: z.number(),
})

export const OnlineUsersPayloadSchema = z.object({
  users: z.array(
    z.object({
      id: z.number().int(),
      username: z.string(),
    }),
  ),
})

// ─── 再战 / 好友挑战广播（T17，F-E-16）───

/** S→C：对方发起再战请求 */
export const RematchIncomingPayloadSchema = z.object({
  gameId: z.string(),
  fromUserId: z.number().int(),
  fromUsername: z.string(),
})

/** S→C：再战已开局，导航到新房间 */
export const RematchStartedPayloadSchema = z.object({
  roomId: z.number().int().positive(),
  gameId: z.string(),
})

/** S→C：收到好友挑战 */
export const ChallengeIncomingPayloadSchema = z.object({
  fromUserId: z.number().int(),
  fromUsername: z.string(),
})

/** S→C：挑战结果（accepted → 导航到新房；declined → 提示） */
export const ChallengeResultPayloadSchema = z.object({
  accepted: z.boolean(),
  roomId: z.number().int().positive().nullable(),
  gameId: z.string().nullable(),
  opponentUsername: z.string().nullable().optional(),
})

// ─── 信封 ───

export const WsEnvelopeSchema = z.object({
  type: z.string(),
  payload: z.unknown().optional(),
  ts: z.number().optional(),
})

// ─── 类型导出 ───

export type PosInput = z.infer<typeof PosSchema>
export type AuthPayload = z.infer<typeof AuthPayloadSchema>
export type RoomJoinPayload = z.infer<typeof RoomJoinPayloadSchema>
export type RoomReadyPayload = z.infer<typeof RoomReadyPayloadSchema>
export type RoomStartPayload = z.infer<typeof RoomStartPayloadSchema>
export type RoomSpectateJoinPayload = z.infer<typeof RoomSpectateJoinPayloadSchema>
export type RoomSpectateLeavePayload = z.infer<typeof RoomSpectateLeavePayloadSchema>
export type RoomUpdateSettingsPayload = z.infer<typeof RoomUpdateSettingsPayloadSchema>
export type MovePayload = z.infer<typeof MovePayloadSchema>
export type DrawRequestPayload = z.infer<typeof DrawRequestPayloadSchema>
export type DrawResponsePayload = z.infer<typeof DrawResponsePayloadSchema>
export type ResignPayload = z.infer<typeof ResignPayloadSchema>
export type RematchRequestPayload = z.infer<typeof RematchRequestPayloadSchema>
export type RematchResponsePayload = z.infer<typeof RematchResponsePayloadSchema>
export type RematchLeavePayload = z.infer<typeof RematchLeavePayloadSchema>
export type ChallengePayload = z.infer<typeof ChallengePayloadSchema>
export type ChallengeResponsePayload = z.infer<typeof ChallengeResponsePayloadSchema>
export type ReconnectPayload = z.infer<typeof ReconnectPayloadSchema>
export type SpectateJoinPayload = z.infer<typeof SpectateJoinPayloadSchema>
export type SpectateLeavePayload = z.infer<typeof SpectateLeavePayloadSchema>
export type ChatPayload = z.infer<typeof ChatPayloadSchema>
export type CancelPayload = z.infer<typeof CancelPayloadSchema>
export type MatchJoinPayload = z.infer<typeof MatchJoinPayloadSchema>
export type MatchLeavePayload = z.infer<typeof MatchLeavePayloadSchema>
export type MatchFoundPayload = z.infer<typeof MatchFoundPayloadSchema>
export type MatchTimeoutPayload = z.infer<typeof MatchTimeoutPayloadSchema>
export type HintRequestPayload = z.infer<typeof HintRequestPayloadSchema>
export type HintResponsePayload = z.infer<typeof HintResponsePayloadSchema>
export type UndoRequestPayload = z.infer<typeof UndoRequestPayloadSchema>
export type UndoResponsePayload = z.infer<typeof UndoResponsePayloadSchema>

// S→C 广播载荷类型
export type RoomStatePayload = z.infer<typeof RoomStatePayloadSchema>
export type GameStartPayload = z.infer<typeof GameStartPayloadSchema>
export type MoveBroadcastPayload = z.infer<typeof MoveBroadcastPayloadSchema>
export type PassPayload = z.infer<typeof PassPayloadSchema>
export type GameOverPayload = z.infer<typeof GameOverPayloadSchema>
export type StateSyncPayload = z.infer<typeof StateSyncPayloadSchema>
export type ChatBroadcastPayload = z.infer<typeof ChatBroadcastPayloadSchema>
export type OnlineUsersPayload = z.infer<typeof OnlineUsersPayloadSchema>
export type RematchIncomingPayload = z.infer<typeof RematchIncomingPayloadSchema>
export type RematchStartedPayload = z.infer<typeof RematchStartedPayloadSchema>
export type ChallengeIncomingPayload = z.infer<typeof ChallengeIncomingPayloadSchema>
export type ChallengeResultPayload = z.infer<typeof ChallengeResultPayloadSchema>
