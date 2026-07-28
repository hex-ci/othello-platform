/**
 * 心跳处理（T06）：C→S ping → S→C pong。
 * 协议级心跳（ws ping/pong 帧）由 ws-server 的 isAlive 巡检处理。
 */
import type { WsHandler } from '../context.js'

export const pingHandler: WsHandler = (ctx) => {
  ctx.conn.send('pong')
}
