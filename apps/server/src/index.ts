import { buildApp } from './app.js'

const app = await buildApp()

try {
  await app.listen({ port: Number(process.env['PORT'] ?? 3000), host: process.env['HOST'] ?? '0.0.0.0' })
  app.log.info(`Server listening on ${app.server.address()}`)
}
catch (err) {
  app.log.error(err)
  process.exit(1)
}

/**
 * 优雅重启（T23，§6.1）：SIGTERM/SIGINT → 停止接收新连接、等在飞消息落盘后退出。
 * 在局对局每手已同步落库 moves，drain 窗口足以让在飞消息完成；超时强退避免挂死。
 */
const SHUTDOWN_TIMEOUT_MS = Number(process.env['SHUTDOWN_TIMEOUT_MS'] ?? 10_000)

let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info({ signal }, '收到终止信号，停止接收新连接，开始优雅退出')

  const force = setTimeout(() => {
    app.log.error({ signal }, '优雅退出超时，强制退出')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  force.unref()

  try {
    await app.close() // 触发 onClose 钩子：WS drain + AI 池终止
    app.log.info('优雅退出完成')
    process.exit(0)
  }
  catch (err) {
    app.log.error(err, '优雅退出过程出错')
    process.exit(1)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
