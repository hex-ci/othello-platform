/**
 * WebSocket 服务端（T06）。
 * - 原生 ws@8，noServer 模式，在 HTTP upgrade 时按 WS_PATH 挂载（§4.3）。
 * - 统一信封 { type, payload, ts }；首帧 auth 强制鉴权；协议级心跳巡检。
 * - handler 经 WsRouter 按 type 分发（附录 C §C.3）。
 */
import { WebSocketServer, type WebSocket } from 'ws'
import type { FastifyInstance } from 'fastify'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { ClientConnection } from './connection.js'
import { ConnectionHub } from './hub.js'
import { WsRouter } from './router.js'
import type { WsContext } from './context.js'
import { RoomManager } from '../room/room-manager.js'
import { MatchmakingService } from '../services/matchmaking-service.js'
import { registerWsHandlers } from './handlers/index.js'

/** 协议级心跳间隔：超过 2 个周期未响应则清理（§6.1） */
const HEARTBEAT_INTERVAL_MS = 30_000

export interface WsServer {
  hub: ConnectionHub
  rooms: RoomManager
  match: MatchmakingService
  /** 当前活跃连接数（可观测性指标，T23 §6.5） */
  connectionCount(): number
  close(): Promise<void>
}

export function setupWsServer(app: FastifyInstance): WsServer {
  const wss = new WebSocketServer({ noServer: true })
  const hub = new ConnectionHub()
  const rooms = new RoomManager(app, hub)
  const match = new MatchmakingService(hub, rooms)
  match.start()
  const router = new WsRouter()
  registerWsHandlers(router)
  const connections = new Set<ClientConnection>()
  /** 优雅退出标志（T23 §6.1）：置位后拒绝新 upgrade，仅等在飞消息落盘 */
  let draining = false

  const wsPath = process.env['WS_PATH'] ?? '/ws'

  app.server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname !== wsPath || draining) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  })

  wss.on('connection', (ws: WebSocket) => {
    const conn = new ClientConnection(ws, () => conn.close())
    connections.add(conn)

    const ctx: WsContext = { app, hub, rooms, match, conn }

    ws.on('message', (data) => {
      conn.isAlive = true
      // 每连接消息频率限流（T23 §6.2）：超频断开，防消息风暴
      if (conn.isRateLimited()) {
        app.log.warn({ userId: conn.userId }, 'WS 消息频率超限，断开连接')
        conn.sendError('RATE_LIMITED', '消息频率过高')
        conn.close()
        return
      }
      void router.dispatch(ctx, data.toString())
    })

    ws.on('pong', () => {
      conn.isAlive = true
    })

    ws.on('close', () => {
      connections.delete(conn)
      hub.remove(conn)
      if (conn.userId !== null) match.handleDisconnect(conn.userId)
      rooms.handleDisconnect(conn)
      conn.close()
    })

    ws.on('error', (err) => {
      app.log.warn({ err }, 'WS 连接错误')
    })
  })

  // 协议级心跳巡检：ping 帧探活，未响应者 terminate
  const heartbeat = setInterval(() => {
    for (const conn of connections) {
      if (!conn.isAlive) {
        connections.delete(conn)
        conn.close()
        continue
      }
      conn.isAlive = false
      if (conn.ws.readyState === conn.ws.OPEN) conn.ws.ping()
    }
  }, HEARTBEAT_INTERVAL_MS)

  app.log.info({ wsPath }, 'WebSocket 服务端已挂载')

  return {
    hub,
    rooms,
    match,
    connectionCount: () => connections.size,
    async close() {
      draining = true
      clearInterval(heartbeat)
      match.stop()
      app.log.info({ connections: connections.size }, 'WS 停止接收新连接，等待在飞消息落盘')

      // 通知客户端服务端即将关闭（便于前端触发重连至新实例）
      for (const conn of connections) conn.send('server_shutdown', {})

      // 等待既有连接关闭（在飞落子已同步落库，此处仅等客户端确认断开），上限 5s
      const deadline = Date.now() + 5_000
      while (connections.size > 0 && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 50))
      }
      for (const conn of connections) conn.close()
      await new Promise<void>(resolve => wss.close(() => resolve()))
      app.log.info('WS 服务端已关闭')
    },
  }
}
