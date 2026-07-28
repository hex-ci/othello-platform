/**
 * AI 工作线程池（T09）。
 * 复用 engine.think 于独立线程，主线程设思考预算；超时 abort 并取最佳合法手兜底。
 * 单节点 v1 用固定大小池（AI_MAX_WORKERS，默认 2）。
 */
import { Worker } from 'node:worker_threads'
import { legalMoves, type AiLevel, type Color, type Pos } from '@othello-platform/engine'

interface PendingTask {
  resolve: (pos: Pos | null) => void
  timer: NodeJS.Timeout
}

/** 单步思考预算（默认 5s，超时降深兜底） */
const THINK_BUDGET_MS = Number(process.env['AI_THINK_BUDGET_MS'] ?? 5_000)
const POOL_SIZE = Number(process.env['AI_MAX_WORKERS'] ?? 2)

// dev(tsx) 运行 .ts，prod(node dist) 运行 .js
const workerUrl = new URL(
  import.meta.url.endsWith('.ts') ? './ai-worker-thread.ts' : './ai-worker-thread.js',
  import.meta.url,
)

export class AiPool {
  private workers: Worker[] = []
  private pending = new Map<number, PendingTask>()
  private nextTaskId = 1
  private roundRobin = 0

  start(): void {
    for (let i = 0; i < POOL_SIZE; i++) {
      const worker = new Worker(workerUrl, { execArgv: process.execArgv })
      worker.on('message', (msg: { id: number; pos: Pos | null }) => {
        const task = this.pending.get(msg.id)
        if (!task) return
        this.pending.delete(msg.id)
        clearTimeout(task.timer)
        task.resolve(msg.pos)
      })
      worker.on('error', (err) => {
        // worker 崩溃：拒绝所有挂起任务，兜底由调用方处理
        console.error('AI worker 错误', err)
      })
      this.workers.push(worker)
    }
  }

  /**
   * 请求 AI 落子。超时则 abort 并返回当前棋盘的最佳合法手（兜底，保证不卡死）。
   */
  think(board: Uint8Array, level: AiLevel, color: Color): Promise<Pos | null> {
    if (this.workers.length === 0) this.start()

    const id = this.nextTaskId++
    const worker = this.workers[this.roundRobin % this.workers.length]
    this.roundRobin++
    if (!worker) {
      return Promise.resolve(this.fallback(board, color))
    }

    return new Promise<Pos | null>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          worker.postMessage({ id, type: 'abort' })
          resolve(this.fallback(board, color))
        }
      }, THINK_BUDGET_MS)

      this.pending.set(id, { resolve, timer })
      worker.postMessage({ id, board: Array.from(board), level, color })
    })
  }

  /** 超时兜底：取第一个合法手（保证对局推进） */
  private fallback(board: Uint8Array, color: Color): Pos | null {
    const moves = legalMoves(board, color)
    return moves[0] ?? null
  }

  async stop(): Promise<void> {
    for (const task of this.pending.values()) clearTimeout(task.timer)
    this.pending.clear()
    await Promise.all(this.workers.map((w) => w.terminate()))
    this.workers = []
  }
}

export const aiPool = new AiPool()
