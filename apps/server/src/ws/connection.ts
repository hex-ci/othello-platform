/**
 * 单个 WebSocket 客户端连接封装。
 * 统一信封 { type, payload, ts }（附录 C §C.3）；首帧鉴权超时清理（T06）。
 */
import type { WebSocket } from 'ws'
import type { ErrorCode } from '@othello-platform/shared'

/** 连接后须在此时间内完成首帧 auth，否则断开（§6.2） */
export const AUTH_TIMEOUT_MS = 5_000

/** WS 每连接消息频率限流（T23 §6.2）：滑窗内超频视为消息风暴，断开连接 */
const RATE_WINDOW_MS = 1_000
const RATE_MAX_MESSAGES = 20

export class ClientConnection {
  authed = false
  userId: number | null = null
  username: string | null = null
  isAlive = true

  private authTimer: NodeJS.Timeout | null = null
  private onAuthTimeout: () => void
  /** 滑窗限流：最近窗口内的消息时间戳 */
  private msgTimestamps: number[] = []

  constructor(
    public readonly ws: WebSocket,
    onAuthTimeout?: () => void,
  ) {
    this.onAuthTimeout = onAuthTimeout ?? (() => this.close())
    this.authTimer = setTimeout(() => {
      if (!this.authed) {
        this.sendError('AUTH_REQUIRED', '未在规定时间内完成鉴权')
        this.onAuthTimeout()
      }
    }, AUTH_TIMEOUT_MS)
  }

  /**
   * 检查消息频率是否超限（滑窗）。超限返回 true，调用方应断开连接。
   * 正常对战每步一条消息 + 心跳，20 msg/s 余量充足，仅防消息风暴。
   */
  isRateLimited(): boolean {
    const now = Date.now()
    this.msgTimestamps = this.msgTimestamps.filter((t) => now - t < RATE_WINDOW_MS)
    this.msgTimestamps.push(now)
    return this.msgTimestamps.length > RATE_MAX_MESSAGES
  }

  markAuthed(userId: number, username: string): void {
    this.authed = true
    this.userId = userId
    this.username = username
    if (this.authTimer) {
      clearTimeout(this.authTimer)
      this.authTimer = null
    }
  }

  send(type: string, payload?: unknown): void {
    if (this.ws.readyState !== this.ws.OPEN) return
    this.ws.send(JSON.stringify({ type, payload, ts: Date.now() }))
  }

  sendError(code: ErrorCode, msg: string): void {
    this.send('error', { code, msg })
  }

  close(): void {
    if (this.authTimer) {
      clearTimeout(this.authTimer)
      this.authTimer = null
    }
    try {
      this.ws.close()
    } catch {
      // 连接可能已关闭
    }
  }
}
