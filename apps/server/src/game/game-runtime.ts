/**
 * 单局权威运行时（T08，附录 C §C.4 状态机）。
 * 持有 board/turn/seq，所有状态转移经 engine 纯函数校验；
 * 非法转移返回错误且不改状态（防作弊，F-C-03）。
 * 落库与广播经注入回调完成，运行时本身不触碰 IO。
 */
import {
  createInitialBoard,
  legalMoves,
  applyMove,
  hasLegalMove,
  isGameOver,
  getResult,
  nextTurn,
  countPieces,
  opponent,
  type Board,
  type Color,
  type Pos,
  type GameResult,
} from '@othello-platform/engine'
import type { GameMode, AiLevel } from '@othello-platform/shared'

export interface GamePlayer {
  userId: number | null // null 表示 AI 座位
  isAi: boolean
}

export interface GameConfig {
  gameId: string
  roomId: number | null
  mode: GameMode
  black: GamePlayer
  white: GamePlayer
  aiLevel: AiLevel | null
  aiColor: Color | null
}

export type MoveRejectCode = 'ILLEGAL_MOVE' | 'NOT_YOUR_TURN' | 'GAME_NOT_FOUND'

export interface MoveOk {
  ok: true
  seq: number
  color: Color
  pos: Pos
  flipped: Pos[]
  board: Board
  nextTurn: Color | null
  blackCount: number
  whiteCount: number
  /** 落子后轮到的一方无合法手，需广播 pass 并再换手 */
  passAfter: { passedColor: Color; nextTurn: Color } | null
  gameOver: GameOverInfo | null
}

export interface MoveErr {
  ok: false
  code: MoveRejectCode
}

export interface GameOverInfo {
  result: GameResult
  endReason: 'normal' | 'resign' | 'draw_agree' | 'disconnect' | 'timeout'
  blackCount: number
  whiteCount: number
}

export type MoveResult = MoveOk | MoveErr

export class GameRuntime {
  board: Board = createInitialBoard()
  turn: Color = 'BLACK'
  seq = 0
  status: 'playing' | 'finished' | 'cancelled' = 'playing'
  result: GameResult | null = null
  endReason: GameOverInfo['endReason'] | null = null
  /** 和棋请求发起方（等待对方应答） */
  drawRequestedBy: number | null = null

  constructor(public readonly config: GameConfig) {}

  get gameId(): string {
    return this.config.gameId
  }

  counts(): { blackCount: number; whiteCount: number } {
    const { black, white } = countPieces(this.board)
    return { blackCount: black, whiteCount: white }
  }

  /** 该 userId 在本局执子色（非参与者返回 null） */
  colorOf(userId: number): Color | null {
    if (this.config.black.userId === userId) return 'BLACK'
    if (this.config.white.userId === userId) return 'WHITE'
    return null
  }

  playerOf(color: Color): GamePlayer {
    return color === 'BLACK' ? this.config.black : this.config.white
  }

  /**
   * 尝试落子（服务端权威校验，F-C-03）。
   * 非法手 / 非己方回合 → 返回错误且不改状态。
   */
  tryMove(color: Color, pos: Pos): MoveResult {
    if (this.status !== 'playing') {
      return { ok: false, code: 'GAME_NOT_FOUND' }
    }
    if (color !== this.turn) {
      return { ok: false, code: 'NOT_YOUR_TURN' }
    }
    const moves = legalMoves(this.board, color)
    if (!moves.some((m) => m.x === pos.x && m.y === pos.y)) {
      return { ok: false, code: 'ILLEGAL_MOVE' }
    }

    const applied = applyMove(this.board, color, pos)
    if (!applied) {
      return { ok: false, code: 'ILLEGAL_MOVE' }
    }

    this.board = applied.board
    this.seq += 1
    this.drawRequestedBy = null

    const { blackCount, whiteCount } = this.counts()

    // 终局判定：双方无手
    if (isGameOver(this.board)) {
      const result = getResult(this.board)
      this.finish(result, 'normal')
      return {
        ok: true,
        seq: this.seq,
        color,
        pos,
        flipped: applied.flipped,
        board: this.board,
        nextTurn: null,
        blackCount,
        whiteCount,
        passAfter: null,
        gameOver: { result, endReason: 'normal', blackCount, whiteCount },
      }
    }

    // 计算下一回合（可能 pass）
    const next = nextTurn(this.board, color)
    let passAfter: MoveOk['passAfter'] = null
    let nextTurnColor: Color | null = next

    if (next === null) {
      // nextTurn 返回 null 但非终局：理论上不会发生（终局已判），保底
      nextTurnColor = null
    } else if (!hasLegalMove(this.board, next)) {
      // 轮到 next 无合法手 → pass，再换回 color 方
      passAfter = { passedColor: next, nextTurn: color }
      this.turn = color
    } else {
      this.turn = next
    }

    return {
      ok: true,
      seq: this.seq,
      color,
      pos,
      flipped: applied.flipped,
      board: this.board,
      nextTurn: nextTurnColor,
      blackCount,
      whiteCount,
      passAfter,
      gameOver: null,
    }
  }

  /** 认输（F-C-08）：对方胜 */
  resign(color: Color): GameOverInfo | null {
    if (this.status !== 'playing') return null
    const winner = opponent(color)
    const result: GameResult = winner
    const { blackCount, whiteCount } = this.counts()
    this.finish(result, 'resign')
    return { result, endReason: 'resign', blackCount, whiteCount }
  }

  /** 和棋（F-C-08）：双方 accept → DRAW */
  agreeDraw(): GameOverInfo | null {
    if (this.status !== 'playing') return null
    const { blackCount, whiteCount } = this.counts()
    this.finish('DRAW', 'draw_agree')
    return { result: 'DRAW', endReason: 'draw_agree', blackCount, whiteCount }
  }

  /** 超时判负（F-C-04）：轮到的一方超时，对方胜 */
  timeout(color: Color): GameOverInfo | null {
    if (this.status !== 'playing') return null
    const winner = opponent(color)
    const { blackCount, whiteCount } = this.counts()
    this.finish(winner, 'timeout')
    return { result: winner, endReason: 'timeout', blackCount, whiteCount }
  }

  /** 断线判负（F-E-04/F-C-02）：重连窗口超时仍断线，对方胜 */
  disconnect(color: Color): GameOverInfo | null {
    if (this.status !== 'playing') return null
    const winner = opponent(color)
    const { blackCount, whiteCount } = this.counts()
    this.finish(winner, 'disconnect')
    return { result: winner, endReason: 'disconnect', blackCount, whiteCount }
  }

  /** 取消本局（F-C-08）：不计分 */
  cancel(): void {
    if (this.status !== 'playing') return
    this.status = 'cancelled'
  }

  /**
   * 恢复棋盘状态（T12 悔棋用）：由 room-manager 从 moves 表重建后写回。
   * 仅在 playing 状态有效；重放后回合/手数随之更新。
   */
  restore(board: Board, turn: Color, seq: number): void {
    this.board = board
    this.turn = turn
    this.seq = seq
    this.drawRequestedBy = null
  }

  private finish(result: GameResult, endReason: GameOverInfo['endReason']): void {
    this.status = 'finished'
    this.result = result
    this.endReason = endReason
  }
}
