import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { registerJwt } from './auth/jwt.js'
import { registerErrorHandler } from './middleware/error-handler.js'
import { authRoutes } from './routes/auth.js'
import { userRoutes } from './routes/users.js'
import { roomRoutes } from './routes/rooms.js'
import { gameRoutes } from './routes/games.js'
import { chatRoutes } from './routes/chats.js'
import { friendRoutes } from './routes/friends.js'
import { puzzleRoutes } from './routes/puzzles.js'
import { seasonRoutes } from './routes/seasons.js'
import { setupWsServer } from './ws/ws-server.js'
import { aiPool } from './ai/ai-pool.js'
import { cleanupStaleWaitingRooms } from './services/room-service.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
    // T23 安全修复 H2：反向代理后正确识别真实客户端 IP，使限流按真实 IP 生效。
    // 部署在 nginx/LB 后时启用；裸机直连可设 false。
    trustProxy: process.env['TRUST_PROXY'] === 'true',
  })

  // T23 安全修复 H1：CORS 来源白名单（不再反射任意 Origin + credentials）。
  // 生产经 CORS_ORIGINS 配置前端来源；未配置时默认本地开发来源。
  const allowedOrigins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
  })

  // 限流：可经环境变量调阈值（RATE_LIMIT_MAX / RATE_LIMIT_WINDOW）。
  // keyGenerator 优先用 JWT payload 里的 userId 做键——已登录用户按人限流，
  // 避免上线后多人共用 NAT 出口 IP 时配额被瓜分误伤；未登录（如 /auth/login）回退 IP。
  // userId 从 Authorization 头同步解出 base64 payload（不验签名，仅作分桶键），onRequest 阶段即可用。
  await app.register(rateLimit, {
    max: Number(process.env['RATE_LIMIT_MAX'] ?? 300),
    timeWindow: process.env['RATE_LIMIT_WINDOW'] ?? '1 minute',
    keyGenerator: (request) => {
      const auth = request.headers.authorization
      if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
        const token = auth.slice(7)
        const parts = token.split('.')
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
              userId?: string | number
            }
            if (payload.userId !== undefined) return `u:${payload.userId}`
          } catch {
            // token 非 JSON 或格式异常 → 回退 IP
          }
        }
      }
      return request.ip
    },
  })

  await registerJwt(app)
  registerErrorHandler(app)

  // WebSocket 服务端（T06）：noServer 挂载 + 房间/对局协调器
  const ws = setupWsServer(app)

  // 路由
  await app.register(authRoutes)
  await app.register(userRoutes)
  await app.register(roomRoutes(ws.rooms))
  await app.register(gameRoutes)
  await app.register(chatRoutes(ws.hub))
  await app.register(friendRoutes(ws.hub))
  await app.register(puzzleRoutes)
  await app.register(seasonRoutes)

  // 可观测性指标（T23 §6.5）：在线连接数、进行中对局数、运行时长
  const startedAt = Date.now()
  app.get('/api/v1/health', async () => ({
    ok: true,
    online: ws.hub.onlineUserIds().length,
    activeGames: ws.rooms.activeGameCount(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  }))

  // AI 工作线程池（T09）
  aiPool.start()

  // 崩溃回放恢复（T23 §6.1）：重建重启前的进行中对局，使重连/续玩可用
  await ws.rooms.restoreActiveGames()

  // 启动清理：重启后内存座位已丢失，将残留的 waiting 房间标记为 finished，避免大厅出现僵尸房
  const cleaned = await cleanupStaleWaitingRooms()
  if (cleaned > 0) app.log.info({ cleaned }, '启动清理：已将残留 waiting 房间标记为 finished')

  // 优雅关闭：停止 WS（drain 在飞消息）、终止 AI 池（§6.1，T23）
  app.addHook('onClose', async () => {
    await ws.close()
    await aiPool.stop()
  })

  return app
}
