/**
 * AI 工作线程入口（T09）。
 * 在 worker_threads 内运行 engine.think，避免高档位搜索阻塞主事件循环（§6.1）。
 * 协议：主线程 postMessage { id, board:number[], level, color } → 回 { id, pos }。
 */
import { parentPort } from 'node:worker_threads'
import { think, stop, type AiLevel, type Color, type Pos } from '@othello-platform/engine'

interface ThinkTask {
  id: number
  board: number[]
  level: AiLevel
  color: Color
}

interface AbortTask {
  id: number
  type: 'abort'
}

if (!parentPort) {
  throw new Error('ai-worker-thread 必须作为 worker_threads 运行')
}

const port = parentPort
let currentId: number | null = null

port.on('message', async (msg: ThinkTask | AbortTask) => {
  if ('type' in msg && msg.type === 'abort') {
    if (currentId === msg.id) stop()
    return
  }
  const task = msg as ThinkTask
  currentId = task.id
  try {
    const board = new Uint8Array(task.board)
    const pos: Pos | null = await think(board, task.level, task.color)
    port.postMessage({ id: task.id, pos })
  } catch {
    port.postMessage({ id: task.id, pos: null })
  } finally {
    currentId = null
  }
})
