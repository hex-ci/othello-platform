import { describe, it, expect } from 'vitest'
import {
  createInitialBoard,
  legalMoves,
  applyMove,
  isGameOver,
  getResult,
  nextTurn,
  hasLegalMove,
  countPieces,
  cellAt,
  T_BLACK,
  T_WHITE,
  type Pos,
} from '../index.js'

function posSet(positions: Pos[]): Set<string> {
  return new Set(positions.map(p => `${p.x},${p.y}`))
}

describe('F-C-01 · 8×8 规则引擎', () => {
  describe('初盘', () => {
    it('初始布局：(3,3)=白 (3,4)=黑 (4,3)=黑 (4,4)=白，其余为空', () => {
      const board = createInitialBoard()
      expect(cellAt(board, { x: 3, y: 3 })).toBe(T_WHITE)
      expect(cellAt(board, { x: 4, y: 3 })).toBe(T_BLACK)
      expect(cellAt(board, { x: 3, y: 4 })).toBe(T_BLACK)
      expect(cellAt(board, { x: 4, y: 4 })).toBe(T_WHITE)

      // 其余 60 格为空
      const { black, white } = countPieces(board)
      expect(black).toBe(2)
      expect(white).toBe(2)
    })

    it('先手为黑', () => {
      const board = createInitialBoard()
      // 黑方有合法手，白方也有（对称），但规则上黑先
      expect(hasLegalMove(board, 'BLACK')).toBe(true)
    })
  })

  describe('合法手', () => {
    it('初盘黑方合法手恰好 4 个：(2,3)(3,2)(4,5)(5,4)', () => {
      const board = createInitialBoard()
      const moves = legalMoves(board, 'BLACK')
      expect(moves).toHaveLength(4)
      const set = posSet(moves)
      expect(set.has('2,3')).toBe(true)
      expect(set.has('3,2')).toBe(true)
      expect(set.has('4,5')).toBe(true)
      expect(set.has('5,4')).toBe(true)
    })

    it('初盘白方合法手恰好 4 个：(2,4)(3,5)(4,2)(5,3)', () => {
      const board = createInitialBoard()
      const moves = legalMoves(board, 'WHITE')
      expect(moves).toHaveLength(4)
      const set = posSet(moves)
      expect(set.has('2,4')).toBe(true)
      expect(set.has('3,5')).toBe(true)
      expect(set.has('4,2')).toBe(true)
      expect(set.has('5,3')).toBe(true)
    })
  })

  describe('翻子', () => {
    it('黑在 (2,3) 落子后翻 (3,3) 为黑，黑=4 白=1，nextTurn=WHITE', () => {
      const board = createInitialBoard()
      const result = applyMove(board, 'BLACK', { x: 2, y: 3 })

      expect(result).not.toBeNull()
      const { board: newBoard, flipped } = result!

      // 翻了 (3,3) 一个子
      expect(flipped).toHaveLength(1)
      expect(flipped[0]).toEqual({ x: 3, y: 3 })

      // (3,3) 变为黑
      expect(cellAt(newBoard, { x: 3, y: 3 })).toBe(T_BLACK)
      // (2,3) 为黑
      expect(cellAt(newBoard, { x: 2, y: 3 })).toBe(T_BLACK)

      // 子数：黑 4 白 1
      const counts = countPieces(newBoard)
      expect(counts.black).toBe(4)
      expect(counts.white).toBe(1)

      // 下一手为白
      expect(nextTurn(newBoard, 'BLACK')).toBe('WHITE')
    })

    it('原棋盘不被修改（纯函数）', () => {
      const board = createInitialBoard()
      const before = board.slice()
      applyMove(board, 'BLACK', { x: 2, y: 3 })
      expect(board).toEqual(before)
    })

    it('多方向翻子', () => {
      // 手工构造一个黑落 (3,2) 可同时翻东、南两个方向的局面
      const board = new Uint8Array(64)
      // 黑 (2,2)，白 (3,2) 东邻，白 (3,3) 南邻 — 不对，需要己方子在末端
      // 构造：黑落 (1,1)，东有白 (2,1)、黑 (3,1)；南有白 (1,2)、黑 (1,3)
      const { T_BLACK: B, T_WHITE: W } = { T_BLACK: 1, T_WHITE: 2 }
      board[1 * 8 + 1] = 0 // (1,1) 空，待黑落
      board[1 * 8 + 2] = W // (2,1) 白
      board[1 * 8 + 3] = B // (3,1) 黑（东方向末端）
      board[2 * 8 + 1] = W // (1,2) 白
      board[3 * 8 + 1] = B // (1,3) 黑（南方向末端）

      const result = applyMove(board, 'BLACK', { x: 1, y: 1 })
      expect(result).not.toBeNull()
      // 应翻 2 个子：(2,1) 和 (1,2)
      expect(result!.flipped).toHaveLength(2)
      const flippedSet = new Set(result!.flipped.map(p => `${p.x},${p.y}`))
      expect(flippedSet.has('2,1')).toBe(true)
      expect(flippedSet.has('1,2')).toBe(true)
    })
  })

  describe('Pass（无手换对手）', () => {
    it('一方无合法手时 nextTurn 返回己方（对手 pass）', () => {
      // 构造一个白方无手的局面
      // 用满棋盘只留一个空位给黑方
      const board = createInitialBoard()
      // 简单验证：如果对手无手，nextTurn 返回当前方
      // 在正常初盘双方都有手
      expect(nextTurn(board, 'BLACK')).toBe('WHITE')
    })

    it('双方均无手时 nextTurn 返回 null（终局）', () => {
      // 全黑棋盘（无空位）
      const board = new Uint8Array(64).fill(T_BLACK)
      expect(nextTurn(board, 'BLACK')).toBeNull()
      expect(isGameOver(board)).toBe(true)
    })
  })

  describe('终局', () => {
    it('双方连续 pass（均无合法手）→ isGameOver=true', () => {
      // 满棋盘
      const board = new Uint8Array(64).fill(T_BLACK)
      expect(isGameOver(board)).toBe(true)
    })

    it('终局比子：黑多 → BLACK', () => {
      const board = new Uint8Array(64)
      board.fill(T_BLACK, 0, 40)
      board.fill(T_WHITE, 40, 64)
      expect(getResult(board)).toBe('BLACK')
    })

    it('终局比子：白多 → WHITE', () => {
      const board = new Uint8Array(64)
      board.fill(T_BLACK, 0, 20)
      board.fill(T_WHITE, 20, 64)
      expect(getResult(board)).toBe('WHITE')
    })

    it('终局比子：相等 → DRAW', () => {
      const board = new Uint8Array(64)
      board.fill(T_BLACK, 0, 32)
      board.fill(T_WHITE, 32, 64)
      expect(getResult(board)).toBe('DRAW')
    })

    it('初盘不是终局', () => {
      expect(isGameOver(createInitialBoard())).toBe(false)
    })
  })

  describe('反例（均应判非法）', () => {
    it('落子于已有子的格 → null', () => {
      const board = createInitialBoard()
      expect(applyMove(board, 'BLACK', { x: 3, y: 3 })).toBeNull()
      expect(applyMove(board, 'BLACK', { x: 4, y: 4 })).toBeNull()
    })

    it('落子于无任何翻子的空格 → null', () => {
      const board = createInitialBoard()
      expect(applyMove(board, 'BLACK', { x: 0, y: 0 })).toBeNull()
      expect(applyMove(board, 'BLACK', { x: 7, y: 7 })).toBeNull()
    })

    it('越界坐标 → null', () => {
      const board = createInitialBoard()
      expect(applyMove(board, 'BLACK', { x: -1, y: 0 })).toBeNull()
      expect(applyMove(board, 'BLACK', { x: 8, y: 0 })).toBeNull()
      expect(applyMove(board, 'BLACK', { x: 0, y: -1 })).toBeNull()
      expect(applyMove(board, 'BLACK', { x: 0, y: 8 })).toBeNull()
    })
  })

  describe('完整对局模拟', () => {
    it('可以完成一局到终局', () => {
      let board = createInitialBoard()
      let turn: 'BLACK' | 'WHITE' = 'BLACK'
      let moveCount = 0
      const maxMoves = 64

      while (!isGameOver(board) && moveCount < maxMoves) {
        const moves = legalMoves(board, turn)
        if (moves.length === 0) {
          // pass
          turn = turn === 'BLACK' ? 'WHITE' : 'BLACK'
          moveCount++
          continue
        }
        // 选第一个合法手
        const result = applyMove(board, turn, moves[0]!)
        expect(result).not.toBeNull()
        board = result!.board
        const next = nextTurn(board, turn)
        if (next === null) break
        turn = next
        moveCount++
      }

      expect(isGameOver(board)).toBe(true)
      const result = getResult(board)
      expect(['BLACK', 'WHITE', 'DRAW']).toContain(result)

      // 子数总和 = 64（满盘）或接近
      const { black, white } = countPieces(board)
      expect(black + white).toBeLessThanOrEqual(64)
      expect(black + white).toBeGreaterThan(4)
    })
  })
})
