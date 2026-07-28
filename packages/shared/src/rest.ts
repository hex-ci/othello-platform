/**
 * REST 请求/响应 Zod schema（§4.2）。
 */
import { z } from 'zod'

// ─── 认证 ───

export const RegisterRequestSchema = z.object({
  username: z.string().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128),
})

export const LoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  remember: z.boolean().optional().default(false),
})

export const ForgotRequestSchema = z.object({
  email: z.string().email(),
})

export const ResetRequestSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
})

// F-C-10 refresh-token（64 位 hex = 32 字节随机）
export const RefreshRequestSchema = z.object({
  refreshToken: z.string().length(64).regex(/^[0-9a-f]{64}$/),
})

export const LogoutRequestSchema = z.object({
  refreshToken: z.string().optional(),
})

// ─── 用户 ───

export const UpdateUserRequestSchema = z.object({
  avatar: z.string().url().optional(),
  bio: z.string().max(200).optional(),
})

// ─── 房间 ───

export const CreateRoomRequestSchema = z.object({
  name: z.string().min(1).max(64),
  mode: z.enum(['human_vs_ai', 'human_vs_human']),
  aiLevel: z.number().int().min(0).max(5).optional(),
  password: z.string().max(64).optional(),
})

export const RoomListQuerySchema = z.object({
  status: z.enum(['waiting', 'playing', 'finished']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

// ─── 聊天 ───

export const CreateChatRequestSchema = z.object({
  channel: z.enum(['public', 'room']),
  roomId: z.number().int().positive().optional(),
  message: z.string().min(1).max(500),
})

export const ChatListQuerySchema = z.object({
  channel: z.enum(['public', 'room']),
  since: z.coerce.number().int().optional(),
  roomId: z.coerce.number().int().positive().optional(),
})

// ─── 榜单 ───

export const LeaderboardQuerySchema = z.object({
  by: z.enum(['elo', 'classic']).optional().default('elo'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
})

// ─── 好友 / 屏蔽（T16，F-E-07）───

export const FriendRequestSchema = z.object({
  // bigint 列经 node-postgres 返回为字符串，coerce 兼容字符串/数字两种形式
  friendId: z.coerce.number().int().positive(),
})

export const FriendListQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'blocked']).optional(),
})

// ─── 响应 ───

export const JoinRoomResponseSchema = z.object({
  gameId: z.string().nullable(),
  color: z.enum(['BLACK', 'WHITE']).nullable(),
})

export const OkResponseSchema = z.object({
  ok: z.literal(true),
})

// ─── 类型导出 ───

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>
export type LoginRequest = z.infer<typeof LoginRequestSchema>
export type ForgotRequest = z.infer<typeof ForgotRequestSchema>
export type ResetRequest = z.infer<typeof ResetRequestSchema>
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>
export type RoomListQuery = z.infer<typeof RoomListQuerySchema>
export type CreateChatRequest = z.infer<typeof CreateChatRequestSchema>
export type ChatListQuery = z.infer<typeof ChatListQuerySchema>
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>
export type FriendRequest = z.infer<typeof FriendRequestSchema>
export type FriendListQuery = z.infer<typeof FriendListQuerySchema>
export type JoinRoomResponse = z.infer<typeof JoinRoomResponseSchema>
export type OkResponse = z.infer<typeof OkResponseSchema>
