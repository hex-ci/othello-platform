/**
 * WebSocket 压测脚本（T23 §6.1）。
 * 目标：单节点 ≥5000 并发连接，端到端延迟 p95 < 100ms。
 *
 * 用法：
 *   ulimit -n 65535   # 先调高 fd 上限
 *   npx tsx --env-file=.env scripts/ws-load-test.ts [target] [stages]
 *   例：npx tsx --env-file=.env scripts/ws-load-test.ts 5000 "1000,3000,5000"
 *
 * 每连接用 JWT_SECRET 直接签 token 完成首帧 auth（避免 N 次登录）。
 * 鉴权后周期发 ping 测往返延迟，统计 p50/p95/p99 + 错误率。
 */
import { WebSocket } from 'ws'
import { createHmac } from 'node:crypto'

// ─── 配置 ───
const WS_URL = process.env['LOAD_TEST_URL'] ?? 'ws://localhost:3000/ws'
const JWT_SECRET = process.env['JWT_SECRET']
if (!JWT_SECRET) {
  console.error('JWT_SECRET not configured')
  process.exit(1)
}

const TARGET = Number(process.argv[2] ?? 5000)
const STAGES = (process.argv[3] ?? '1000,3000,5000').split(',').map(Number)
const PING_INTERVAL_MS = 1_000 // 每连接 ping 间隔
const SETTLE_MS = 6_000 // 每档稳定等待（须 > PING_INTERVAL 以收集样本）
const CONNECT_BATCH = 200 // 每批并发建连数
const CONNECT_BATCH_DELAY_MS = 100 // 批间间隔

// ─── JWT 签发（HS256，与 @fastify/jwt 兼容）───
function base64url(data: string): string {
  return Buffer.from(data).toString('base64url')
}

function signJwt(userId: number, username: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = base64url(JSON.stringify({ userId, username, iat: now, exp: now + 3600 }))
  const sig = createHmac('sha256', JWT_SECRET!).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

// ─── 统计 ───
interface Stats {
  latencies: number[]
  errors: number
  authFailures: number
  disconnects: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.max(0, Math.ceil(sorted.length * (p / 100)) - 1)
  return sorted[idx] ?? 0
}

function reportStats(label: string, stats: Stats, activeCount: number): void {
  const sorted = [...stats.latencies].sort((a, b) => a - b)
  const total = stats.latencies.length
  console.log(`\n═══ ${label} ═══`)
  console.log(`  活跃连接: ${activeCount}`)
  console.log(`  延迟样本: ${total}`)
  if (total > 0) {
    const maxLatency = sorted[sorted.length - 1] ?? 0
    console.log(`  p50: ${percentile(sorted, 50).toFixed(1)}ms`)
    console.log(`  p95: ${percentile(sorted, 95).toFixed(1)}ms`)
    console.log(`  p99: ${percentile(sorted, 99).toFixed(1)}ms`)
    console.log(`  max: ${maxLatency.toFixed(1)}ms`)
  }
  console.log(
    `  错误: 建连失败=${stats.errors} 鉴权失败=${stats.authFailures} 断连=${stats.disconnects}`,
  )
  const errRate =
    total > 0
      ? ((stats.errors + stats.authFailures) / (total + stats.errors + stats.authFailures)) * 100
      : 0
  console.log(`  错误率: ${errRate.toFixed(2)}%`)
}

// ─── 单连接管理 ───
interface Conn {
  ws: WebSocket
  pingTimer: ReturnType<typeof setInterval> | null
  alive: boolean
}

function createConnection(id: number, stats: Stats): Promise<Conn> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    const conn: Conn = { ws, pingTimer: null, alive: false }
    let authed = false

    const timeout = setTimeout(() => {
      stats.errors++
      ws.terminate()
      reject(new Error(`conn ${id} timeout`))
    }, 10_000)

    ws.on('open', () => {
      // 首帧 auth
      ws.send(JSON.stringify({ type: 'auth', payload: { token: signJwt(id, `load_${id}`) } }))
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string }
        if (msg.type === 'auth_ok') {
          authed = true
          conn.alive = true
          clearTimeout(timeout)
          // 启动 ping 循环测延迟
          conn.pingTimer = setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) return
            const start = performance.now()
            ws.send(JSON.stringify({ type: 'ping' }))
            // pong 到达时在 message handler 里计时
            ;(conn as Conn & { _pingStart?: number })._pingStart = start
          }, PING_INTERVAL_MS)
          resolve(conn)
        } else if (msg.type === 'pong') {
          const c = conn as Conn & { _pingStart?: number }
          if (c._pingStart) {
            stats.latencies.push(performance.now() - c._pingStart)
            c._pingStart = undefined
          }
        } else if (msg.type === 'error') {
          if (!authed) {
            stats.authFailures++
            clearTimeout(timeout)
            ws.terminate()
            reject(new Error(`conn ${id} auth error`))
          }
        }
      } catch {
        // 忽略解析错误
      }
    })

    ws.on('close', () => {
      if (conn.alive) stats.disconnects++
      conn.alive = false
      if (conn.pingTimer) clearInterval(conn.pingTimer)
    })

    ws.on('error', () => {
      if (!authed) {
        stats.errors++
        clearTimeout(timeout)
        reject(new Error(`conn ${id} ws error`))
      }
    })
  })
}

// ─── 主流程 ───
async function main(): Promise<void> {
  console.log(`WS 压测目标: ${TARGET} 并发, 分档: [${STAGES.join(', ')}]`)
  console.log(`目标地址: ${WS_URL}`)
  console.log(`ping 间隔: ${PING_INTERVAL_MS}ms, 每档稳定: ${SETTLE_MS}ms`)

  const allConns: Conn[] = []
  const globalStats: Stats = { latencies: [], errors: 0, authFailures: 0, disconnects: 0 }

  for (const stage of STAGES) {
    const stageStats: Stats = { latencies: [], errors: 0, authFailures: 0, disconnects: 0 }
    const toOpen = Math.min(stage, TARGET) - allConns.length
    if (toOpen <= 0) continue

    console.log(`\n▶ 爬坡至 ${Math.min(stage, TARGET)} 连接（新增 ${toOpen}）...`)

    // 分批建连
    for (let i = 0; i < toOpen; i += CONNECT_BATCH) {
      const batch = Math.min(CONNECT_BATCH, toOpen - i)
      const promises: Promise<Conn>[] = []
      for (let j = 0; j < batch; j++) {
        const id = allConns.length + j + 1
        promises.push(createConnection(id, stageStats).catch(() => null as unknown as Conn))
      }
      const results = await Promise.all(promises)
      for (const c of results) {
        if (c) allConns.push(c)
      }
      if (i + CONNECT_BATCH < toOpen) {
        await new Promise((r) => setTimeout(r, CONNECT_BATCH_DELAY_MS))
      }
    }

    // 稳定等待，收集延迟样本
    console.log(`  已建连 ${allConns.length}，等待 ${SETTLE_MS}ms 收集延迟样本...`)
    await new Promise((r) => setTimeout(r, SETTLE_MS))

    const activeCount = allConns.filter((c) => c.alive).length
    reportStats(`档位 ${Math.min(stage, TARGET)}`, stageStats, activeCount)

    // 合并到全局
    globalStats.latencies.push(...stageStats.latencies)
    globalStats.errors += stageStats.errors
    globalStats.authFailures += stageStats.authFailures
    globalStats.disconnects += stageStats.disconnects
  }

  // 最终报告
  const activeCount = allConns.filter((c) => c.alive).length
  reportStats(`最终（目标 ${TARGET}）`, globalStats, activeCount)

  // 清理
  console.log('\n清理连接...')
  for (const c of allConns) {
    if (c.pingTimer) clearInterval(c.pingTimer)
    c.ws.terminate()
  }

  // 判定
  const sorted = [...globalStats.latencies].sort((a, b) => a - b)
  const p95 = percentile(sorted, 95)
  const errRate =
    globalStats.latencies.length > 0
      ? ((globalStats.errors + globalStats.authFailures) /
          (globalStats.latencies.length + globalStats.errors + globalStats.authFailures)) *
        100
      : 0
  const pass = activeCount >= TARGET && p95 < 100 && errRate < 1
  console.log(`\n${'═'.repeat(40)}`)
  console.log(`结论: ${pass ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`  并发: ${activeCount}/${TARGET} ${activeCount >= TARGET ? '✅' : '❌'}`)
  console.log(`  p95: ${p95.toFixed(1)}ms ${p95 < 100 ? '✅ <100ms' : '❌ ≥100ms'}`)
  console.log(`  错误率: ${errRate.toFixed(2)}% ${errRate < 1 ? '✅ <1%' : '❌ ≥1%'}`)
  console.log(`${'═'.repeat(40)}`)

  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('压测异常:', err)
  process.exit(1)
})
