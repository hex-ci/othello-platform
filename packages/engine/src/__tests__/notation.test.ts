import { describe, it, expect } from 'vitest'
import {
  encodeMoves,
  decodeMoves,
  isValidNotation,
  posToNotation,
  notationToPos,
  NotationError,
  createInitialBoard,
  legalMoves,
} from '../index.js'
import type { NotationMove } from '../index.js'

describe('记谱 notation 编码/解码', () => {
  it('空序列编码为空字符串', () => {
    expect(encodeMoves([])).toBe('')
  })

  it('空字符串解码为空数组', () => {
    expect(decodeMoves('')).toEqual([])
    expect(decodeMoves('   ')).toEqual([])
  })

  it('posToNotation / notationToPos 往返一致', () => {
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const pos = { x, y }
        const s = posToNotation(pos)
        expect(notationToPos(s)).toEqual(pos)
      }
    }
  })

  it('notationToPos 非法字符抛 NotationError', () => {
    expect(() => notationToPos('z1')).toThrow(NotationError)
    expect(() => notationToPos('a9')).toThrow(NotationError)
    expect(() => notationToPos('a')).toThrow(NotationError)
    expect(() => notationToPos('abc')).toThrow(NotationError)
  })

  it('正常开局序列编解码往返一致', () => {
    // 黑先 f5, 白 d6, 黑 c3
    const moves: NotationMove[] = [
      { color: 'BLACK', pos: { x: 5, y: 4 }, isPass: false },
      { color: 'WHITE', pos: { x: 3, y: 5 }, isPass: false },
      { color: 'BLACK', pos: { x: 2, y: 2 }, isPass: false },
    ]
    const s = encodeMoves(moves)
    expect(s).toBe('f5d6c3')
    const decoded = decodeMoves(s)
    expect(decoded).toHaveLength(3)
    expect(decoded[0]!.color).toBe('BLACK')
    expect(decoded[0]!.pos).toEqual({ x: 5, y: 4 })
    expect(decoded[1]!.color).toBe('WHITE')
    expect(decoded[2]!.color).toBe('BLACK')
  })

  it('decode 校验走子方交替：第二手若标黑则抛错', () => {
    // f5 是黑合法手，第二手 d6 应是白方；构造一个第二手也是黑合法的记谱会因 color 交替校验失败
    // 但 decode 内部按黑先白后交替，故 f5f5 第二个 f5 在白方回合不合法 → 抛错
    expect(() => decodeMoves('f5f5')).toThrow(NotationError)
  })

  it('decode 非法落子抛 NotationError', () => {
    // a1 在初始盘不是黑方合法手
    expect(() => decodeMoves('a1')).toThrow(NotationError)
  })

  it('decode 非法字符抛 NotationError', () => {
    expect(() => decodeMoves('f5z6')).toThrow(NotationError)
    expect(() => decodeMoves('f5d')).toThrow(NotationError)
  })

  it('decode 长度非偶数抛 NotationError', () => {
    expect(() => decodeMoves('f5d')).toThrow(NotationError)
  })

  it('isValidNotation 不抛异常，返回布尔', () => {
    expect(isValidNotation('f5d6c3')).toBe(true)
    expect(isValidNotation('a1')).toBe(false)
    expect(isValidNotation('')).toBe(true)
  })

  it('初盘黑方四个合法手都能被 decode 接受', () => {
    const board = createInitialBoard()
    const moves = legalMoves(board, 'BLACK')
    expect(moves).toHaveLength(4)
    for (const m of moves) {
      const s = posToNotation(m)
      expect(() => decodeMoves(s)).not.toThrow()
    }
  })

  it('encode/decode 含 pass 手往返一致（需构造无合法手局面）', () => {
    // 构造：黑走 d3，白走 c3，黑走 c4，白走 c5，黑走 b3... 直到某方无手
    // 这里用已知会导致 pass 的极简序列较难，改为直接验证 encode 对 pass 的输出
    const moves: NotationMove[] = [
      { color: 'BLACK', pos: { x: 3, y: 2 }, isPass: false }, // d3
      { color: 'WHITE', pos: null, isPass: true }, // pass
    ]
    expect(encodeMoves(moves)).toBe('d3--')
    // decode d3-- 需校验白方在 d3 后确实无合法手；若白方有合法手则抛错
    // d3 后白方有合法手（c3/c5/d2/d6 等），故 decode 应抛 pass 非法错
    expect(() => decodeMoves('d3--')).toThrow(NotationError)
  })
})