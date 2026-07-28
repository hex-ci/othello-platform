/**
 * 首帧 auth 处理（T06）：校验 JWT，置连接为已鉴权并加入 hub。
 * 令牌不走 URL 查询串（§4.3），仅经信封 payload.token。
 */
import { AuthPayloadSchema } from '@othello-platform/shared'
import type { JwtPayload } from '../../auth/jwt.js'
import type { WsContext, WsHandler } from '../context.js'

export const authHandler: WsHandler = (ctx: WsContext, payload: unknown) => {
  const { conn, hub, app } = ctx

  if (conn.authed) {
    conn.sendError('VALIDATION_ERROR', '已鉴权，无需重复')
    return
  }

  const parsed = AuthPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    conn.sendError('VALIDATION_ERROR', 'auth 参数无效')
    conn.close()
    return
  }

  let decoded: JwtPayload
  try {
    decoded = app.jwt.verify<JwtPayload>(parsed.data.token)
  } catch {
    conn.sendError('INVALID_TOKEN', 'JWT 无效或已过期')
    conn.close()
    return
  }

  // pg BIGINT-as-string 归一化：JWT 中 userId 可能为字符串，统一转 number
  // 避免 conn.userId 为 string 导致 room-manager 座位比较 (===) 类型不匹配
  const normalizedUserId = Number(decoded.userId)
  conn.markAuthed(normalizedUserId, decoded.username)
  hub.add(conn)
  conn.send('auth_ok', { userId: normalizedUserId, username: decoded.username })
  app.log.info({ userId: normalizedUserId }, 'WS 连接已鉴权')
}
