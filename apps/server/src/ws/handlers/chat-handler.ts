/**
 * chat 处理（T10，F-C-09 + 基础 F-E-20）。
 * 限频（每用户窗口内上限）+ 屏蔽词过滤 + 持久化 + 广播。
 */
import { ChatPayloadSchema } from '@othello-platform/shared'
import { postChat } from '../../services/chat-service.js'
import type { WsHandler } from '../context.js'

/** 限频：窗口内每用户最多 N 条 */
const RATE_WINDOW_MS = 10_000
const RATE_MAX_PER_WINDOW = 5

/** 基础屏蔽词表（v1 占位，后续可外置） */
const BLOCKED_WORDS = ['傻逼', 'fuck', 'shit']

const rateBuckets = new Map<number, number[]>()

function isRateLimited(userId: number): boolean {
  const now = Date.now()
  let bucket = rateBuckets.get(userId)
  if (!bucket) {
    bucket = []
    rateBuckets.set(userId, bucket)
  }
  const recent = bucket.filter(t => now - t < RATE_WINDOW_MS)
  recent.push(now)
  rateBuckets.set(userId, recent)
  return recent.length > RATE_MAX_PER_WINDOW
}

function sanitize(message: string): string {
  let out = message
  for (const word of BLOCKED_WORDS) {
    out = out.split(word).join('*'.repeat(word.length))
  }
  return out
}

export const chatHandler: WsHandler = async (ctx, payload) => {
  const { conn, hub, rooms } = ctx
  const parsed = ChatPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'chat 参数无效')
    return
  }
  if (conn.userId === null || conn.username === null) return

  if (isRateLimited(conn.userId)) {
    conn.sendError('RATE_LIMITED', '消息发送过于频繁，请稍后再试')
    return
  }

  const message = sanitize(parsed.data.message)
  const roomId = parsed.data.channel === 'room' ? (parsed.data.roomId ?? null) : null

  await postChat({ channel: parsed.data.channel, roomId, userId: conn.userId, message })

  const broadcastPayload = {
    channel: parsed.data.channel,
    roomId,
    userId: conn.userId,
    username: conn.username,
    message,
    ts: Date.now(),
  }

  if (parsed.data.channel === 'public') {
    hub.broadcastToAllOnline('chat', broadcastPayload)
  }
  else if (roomId !== null) {
    hub.sendToUsers(rooms.roomMemberIds(roomId), 'chat', broadcastPayload)
  }
}
