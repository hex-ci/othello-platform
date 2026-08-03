/**
 * WS 消息路由：按 type 分发到 handler（附录 C §C.3）。
 * 未鉴权连接仅允许 auth 消息；其余一律拒绝（T06 DoD）。
 */
import type { ClientConnection } from './connection.js'
import type { WsContext, WsHandler } from './context.js'

/** 未鉴权即可发送的消息（仅 auth） */
const PRE_AUTH_TYPES = new Set(['auth'])

export class WsRouter {
  private handlers = new Map<string, WsHandler>()

  on(type: string, handler: WsHandler): this {
    this.handlers.set(type, handler)
    return this
  }

  async dispatch(ctx: WsContext, raw: string): Promise<void> {
    const conn: ClientConnection = ctx.conn
    let msg: { type?: unknown, payload?: unknown }
    try {
      msg = JSON.parse(raw) as { type?: unknown, payload?: unknown }
    }
    catch {
      conn.sendError('VALIDATION_ERROR', '消息格式无效')
      return
    }

    const type = typeof msg.type === 'string' ? msg.type : null
    if (!type) {
      conn.sendError('VALIDATION_ERROR', '缺少消息类型')
      return
    }

    // 未鉴权拦截：仅放行 auth
    if (!conn.authed && !PRE_AUTH_TYPES.has(type)) {
      conn.sendError('AUTH_REQUIRED', '请先完成鉴权')
      return
    }

    const handler = this.handlers.get(type)
    if (!handler) {
      conn.sendError('VALIDATION_ERROR', `未知消息类型: ${type}`)
      return
    }

    try {
      await handler(ctx, msg.payload)
    }
    catch (err) {
      ctx.app.log.error({ err, type }, 'WS handler 异常')
      conn.sendError('INTERNAL', '服务端内部错误')
    }
  }
}
