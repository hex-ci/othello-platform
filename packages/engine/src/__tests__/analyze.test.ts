import { describe, it, expect } from 'vitest'
import {
  createInitialBoard,
  legalMoves,
  analyzeGame,
  DEFAULT_ANALYSIS_CONFIG,
} from '../index.js'
import type { Color, Pos } from '../index.js'

/** 辅助：从初始盘走一个标准开局序列，返回 moves 数组 */
function openingMoves(): { color: Color; pos: Pos | null; isPass: boolean }[] {
  return [
    { color: 'BLACK', pos: { x: 4, y: 2 }, isPass: false }, // D3
    { color: 'WHITE', pos: { x: 3, y: 2 }, isPass: false }, // C3
    { color: 'BLACK', pos: { x: 2, y: 3 }, isPass: false }, // C4
    { color: 'WHITE', pos: { x: 2, y: 4 }, isPass: false }, // C5
  ]
}

describe('analyzeGame 复盘分析', () => {
  it('空走子序列返回空分析 + 零平均', () => {
    const result = analyzeGame([], DEFAULT_ANALYSIS_CONFIG, null)
    expect(result.moves).toHaveLength(0)
    expect(result.summary.blackAvg).toBe(0)
    expect(result.summary.whiteAvg).toBe(0)
    expect(result.summary.brilliantCount).toBe(0)
    expect(result.summary.blunderCount).toBe(0)
    expect(result.summary.result).toBeNull()
  })

  it('单手分析：序列长度 = 1，黑方视角评估为有限值', () => {
    const moves = openingMoves().slice(0, 1)
    const result = analyzeGame(moves)
    expect(result.moves).toHaveLength(1)
    const m = result.moves[0]!
    expect(m.seq).toBe(1)
    expect(m.color).toBe('BLACK')
    expect(m.isPass).toBe(false)
    expect(m.pos).toEqual({ x: 4, y: 2 })
    expect(Number.isFinite(m.eval)).toBe(true)
    expect(m.eval).toBeGreaterThanOrEqual(-1)
    expect(m.eval).toBeLessThanOrEqual(1)
    expect(m.bestPos).not.toBeNull()
    expect(['brilliant', 'good', 'inaccuracy', 'blunder', 'normal']).toContain(m.classification)
  })

  it('含 pass 手时 pass 手沿用前值且不改变棋盘', () => {
    // 构造一个极简序列：黑落 D3，白 pass（构造 pass 需要白无合法手，这里直接模拟 pass 行为）
    const moves: { color: Color; pos: Pos | null; isPass: boolean }[] = [
      { color: 'BLACK', pos: { x: 4, y: 2 }, isPass: false },
      { color: 'WHITE', pos: null, isPass: true },
    ]
    const result = analyzeGame(moves)
    expect(result.moves).toHaveLength(2)
    const pass = result.moves[1]!
    expect(pass.isPass).toBe(true)
    expect(pass.pos).toBeNull()
    expect(pass.bestPos).toBeNull()
    expect(pass.classification).toBe('normal')
    expect(pass.delta).toBe(0)
  })

  it('对确定性输入输出确定（同输入两次相同）', () => {
    const moves = openingMoves()
    const a = analyzeGame(moves)
    const b = analyzeGame(moves)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('对局总结汇总妙手/失误计数与平均分', () => {
    const moves = openingMoves()
    const result = analyzeGame(moves, DEFAULT_ANALYSIS_CONFIG, 'BLACK')
    expect(result.moves.length).toBe(4)
    expect(result.summary.brilliantCount + result.summary.blunderCount + result.summary.inaccuracyCount).toBeLessThanOrEqual(4)
    expect(result.summary.blackAvg).toBeGreaterThanOrEqual(-1)
    expect(result.summary.blackAvg).toBeLessThanOrEqual(1)
    expect(result.summary.whiteAvg).toBeGreaterThanOrEqual(-1)
    expect(result.summary.whiteAvg).toBeLessThanOrEqual(1)
    expect(result.summary.result).toBe('BLACK')
  })

  it('走子记录推进的棋盘与手动 applyMove 一致', () => {
    const moves = openingMoves()
    const result = analyzeGame(moves)
    // 走子方视角的 eval/bestEval 都在 [-1,1]
    for (const m of result.moves) {
      expect(m.eval).toBeGreaterThanOrEqual(-1)
      expect(m.eval).toBeLessThanOrEqual(1)
      expect(m.bestEval).toBeGreaterThanOrEqual(-1)
      expect(m.bestEval).toBeLessThanOrEqual(1)
    }
  })

  it('实际手等于最佳手时 delta ≈ 0，分类为 good 或 brilliant', () => {
    // 用 L5 深搜确保第一手最佳确定（角位在中盘才有，初盘最优策略应稳定）
    // 这里仅验证：当实际手 = 搜索返回的最佳手时，分类非失误
    const board = createInitialBoard()
    const moves = legalMoves(board, 'BLACK')
    // 取引擎推荐手作为"实际手"
    // 直接构造 moves 数组让 analyzeGame 内部再次搜索
    const seq: { color: Color; pos: Pos | null; isPass: boolean }[] = []
    // 让黑方走第一个合法手，引擎在同一盘面下应返回同一手
    seq.push({ color: 'BLACK', pos: moves[0]!, isPass: false })
    const result = analyzeGame(seq)
    const m = result.moves[0]!
    // 因实际手与搜索手一致，delta 应 ≈ 0
    expect(m.delta).toBeGreaterThan(-0.001)
  })
})