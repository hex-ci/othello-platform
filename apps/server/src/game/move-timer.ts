/**
 * 每步倒计时（F-C-04，服务端权威）。
 * 每手重置为每步预算；归零触发 onTimeout（判负）。
 */
import type { Color } from '@othello-platform/engine'

/** 每步预算（默认 30s，可由 MOVE_TIMEOUT_MS 覆盖） */
export const MOVE_TIMEOUT_MS = Number(process.env['MOVE_TIMEOUT_MS'] ?? 30_000)

/** 人机对局每步预算（120s，避免慢玩家第 0 手超时，可由 AI_MOVE_TIMEOUT_MS 覆盖） */
export const AI_MOVE_TIMEOUT_MS = Number(process.env['AI_MOVE_TIMEOUT_MS'] ?? 120_000)

/** 根据对局模式返回每步超时（人机 120s，人人 30s） */
export function timeoutForMode(mode: 'human_vs_ai' | 'human_vs_human'): number {
  return mode === 'human_vs_ai' ? AI_MOVE_TIMEOUT_MS : MOVE_TIMEOUT_MS
}

export class MoveTimer {
  private timer: NodeJS.Timeout | null = null
  private deadline = 0
  /** 暂停时冻结的剩余毫秒与回合方（断线重连用，T13） */
  private pausedRemaining = 0
  private pausedColor: Color | null = null

  constructor(private readonly onTimeout: (color: Color) => void) {}

  /** 为轮到的一方启动/重置倒计时 */
  reset(color: Color, timeoutMs: number = MOVE_TIMEOUT_MS): void {
    this.clear()
    this.pausedColor = null
    this.deadline = Date.now() + timeoutMs
    this.timer = setTimeout(() => {
      this.timer = null
      this.onTimeout(color)
    }, timeoutMs)
  }

  /** 暂停倒计时（断线时冻结剩余时间，避免与重连窗口竞态，T13） */
  pause(): void {
    if (!this.timer) return
    this.pausedRemaining = this.remainingMs()
    this.clear()
  }

  /** 恢复倒计时（重连成功后用冻结的剩余时间继续，T13） */
  resume(color: Color, fallbackMs: number = MOVE_TIMEOUT_MS): void {
    if (this.timer) return
    const remaining = this.pausedRemaining > 0 ? this.pausedRemaining : fallbackMs
    this.pausedColor = null
    this.pausedRemaining = 0
    this.deadline = Date.now() + remaining
    this.timer = setTimeout(() => {
      this.timer = null
      this.onTimeout(color)
    }, remaining)
  }

  /** 当前回合剩余毫秒（供广播展示） */
  remainingMs(): number {
    if (this.timer) return Math.max(0, this.deadline - Date.now())
    // 暂停中返回冻结值
    if (this.pausedColor !== null || this.pausedRemaining > 0) return this.pausedRemaining
    return 0
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
