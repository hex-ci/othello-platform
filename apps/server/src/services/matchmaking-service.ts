/**
 * 自动匹配队列（T11，F-E-06）。
 * 进程内队列：按 ELO 邻近区间匹配，等待越久区间越宽；匹配成功自动建房开局。
 * 仅人人对局（human_vs_human）；匹配到的双方互换随机执子由建房座位顺序决定。
 */
import type { ConnectionHub } from '../ws/hub.js'
import type { RoomManager } from '../room/room-manager.js'
import * as roomService from '../services/room-service.js'
import { query } from '../db/pool.js'

interface QueueEntry {
  userId: number
  username: string
  elo: number
  enqueuedAt: number
}

const TICK_MS = 3_000
const BASE_RANGE = 100 // 初始匹配区间 ±100
const RANGE_GROWTH = 100 // 每段放宽步长
const RANGE_GROWTH_MS = 10_000 // 每 10s 放宽一次
const MAX_RANGE = 500 // 区间上限 ±500
const QUEUE_TIMEOUT_MS = 60_000 // 排队超时

export class MatchmakingService {
  private queue = new Map<number, QueueEntry>()
  private timer: ReturnType<typeof setInterval> | null = null
  /** 串行化锁：避免 tick 与入队/离队并发 */
  private busy = false

  constructor(
    private readonly hub: ConnectionHub,
    private readonly rooms: RoomManager,
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(), TICK_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  enqueue(userId: number, username: string): void {
    void this.fetchElo(userId).then((elo) => {
      this.queue.set(userId, { userId, username, elo, enqueuedAt: Date.now() })
      // 入队完成后再通知，保证 size 准确
      this.hub.sendToUser(userId, 'match_queued', { size: this.queue.size })
    })
  }

  dequeue(userId: number): void {
    this.queue.delete(userId)
  }

  queueSize(): number {
    return this.queue.size
  }

  /** 玩家断线时移出队列 */
  handleDisconnect(userId: number): void {
    this.queue.delete(userId)
  }

  private async fetchElo(userId: number): Promise<number> {
    try {
      const res = await query('SELECT elo FROM users WHERE id = $1', [userId])
      return (res.rows[0]?.elo as number | undefined) ?? 1500
    }
    catch {
      return 1500
    }
  }

  /** 某条目当前可接受的 ELO 区间半径（随等待时间放宽） */
  private rangeOf(entry: QueueEntry, now: number): number {
    const waited = now - entry.enqueuedAt
    const steps = Math.floor(waited / RANGE_GROWTH_MS)
    return Math.min(MAX_RANGE, BASE_RANGE + steps * RANGE_GROWTH)
  }

  private async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const now = Date.now()
      const entries = [...this.queue.values()]

      // 超时清理
      for (const e of entries) {
        if (now - e.enqueuedAt > QUEUE_TIMEOUT_MS) {
          this.queue.delete(e.userId)
          this.hub.sendToUser(e.userId, 'match_timeout', {})
        }
      }

      // 两两匹配：双向区间均满足才配对
      const remaining = [...this.queue.values()]
      const matched = new Set<number>()
      for (let i = 0; i < remaining.length; i++) {
        const a = remaining[i]
        if (!a || matched.has(a.userId)) continue
        for (let j = i + 1; j < remaining.length; j++) {
          const b = remaining[j]
          if (!b || matched.has(b.userId)) continue
          const diff = Math.abs(a.elo - b.elo)
          if (diff <= this.rangeOf(a, now) && diff <= this.rangeOf(b, now)) {
            matched.add(a.userId)
            matched.add(b.userId)
            this.queue.delete(a.userId)
            this.queue.delete(b.userId)
            await this.createMatch(a, b)
            break
          }
        }
      }
    }
    finally {
      this.busy = false
    }
  }

  /** 匹配成功：建房 → 双方入座开局 → 通知导航 */
  private async createMatch(a: QueueEntry, b: QueueEntry): Promise<void> {
    try {
      const room = await roomService.createRoom({
        name: `匹配对局 · ${a.username} vs ${b.username}`,
        ownerId: a.userId,
        mode: 'human_vs_human',
        aiLevel: null,
      })
      // 双方依次入座，第二人入座后 RoomManager 自动开局
      await this.rooms.joinRoom(a.userId, a.username, room.id)
      await this.rooms.joinRoom(b.userId, b.username, room.id)
      this.hub.sendToUsers([a.userId, b.userId], 'match_found', {
        roomId: room.id,
        opponent: null,
      })
    }
    catch (err) {
      // 建房失败：通知双方重试
      this.hub.sendToUsers([a.userId, b.userId], 'match_timeout', {})
      throw err
    }
  }
}
