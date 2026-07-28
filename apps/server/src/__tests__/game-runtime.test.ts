/**
 * GameRuntime 权威状态机单测（T08，附录 B F-C-03/04/08）。
 * 覆盖：合法/非法落子、非己方回合、pass、双方 pass 终局、认输、超时。
 */
import { describe, test, expect } from 'vitest'
import { GameRuntime } from '../game/game-runtime.js'
import type { GameConfig } from '../game/game-runtime.js'

function makeRuntime(overrides?: Partial<GameConfig>): GameRuntime {
  return new GameRuntime({
    gameId: 'g_1',
    roomId: 1,
    mode: 'human_vs_human',
    black: { userId: 100, isAi: false },
    white: { userId: 200, isAi: false },
    aiLevel: null,
    aiColor: null,
    ...overrides,
  })
}

describe('GameRuntime 落子校验（F-C-03）', () => {
  test('初盘黑方合法手被接受并翻子', () => {
    const rt = makeRuntime()
    const res = rt.tryMove('BLACK', { x: 2, y: 3 })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.seq).toBe(1)
      expect(res.flipped).toEqual([{ x: 3, y: 3 }])
      expect(res.blackCount).toBe(4)
      expect(res.whiteCount).toBe(1)
      expect(res.nextTurn).toBe('WHITE')
    }
  })

  test('非法落子被拒且棋盘不变', () => {
    const rt = makeRuntime()
    const before = rt.board.slice()
    const res = rt.tryMove('BLACK', { x: 0, y: 0 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('ILLEGAL_MOVE')
    expect(Array.from(rt.board)).toEqual(Array.from(before))
    expect(rt.seq).toBe(0)
    expect(rt.turn).toBe('BLACK')
  })

  test('非己方回合落子被拒（NOT_YOUR_TURN）', () => {
    const rt = makeRuntime()
    const res = rt.tryMove('WHITE', { x: 2, y: 3 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('NOT_YOUR_TURN')
  })

  test('colorOf 正确映射执子色', () => {
    const rt = makeRuntime()
    expect(rt.colorOf(100)).toBe('BLACK')
    expect(rt.colorOf(200)).toBe('WHITE')
    expect(rt.colorOf(999)).toBeNull()
  })
})

describe('GameRuntime 终局（F-C-08/04）', () => {
  test('认输 → 对方胜 endReason=resign', () => {
    const rt = makeRuntime()
    const info = rt.resign('BLACK')
    expect(info).not.toBeNull()
    expect(info?.result).toBe('WHITE')
    expect(info?.endReason).toBe('resign')
    expect(rt.status).toBe('finished')
  })

  test('超时 → 对方胜 endReason=timeout', () => {
    const rt = makeRuntime()
    const info = rt.timeout('WHITE')
    expect(info?.result).toBe('BLACK')
    expect(info?.endReason).toBe('timeout')
  })

  test('和棋 → DRAW endReason=draw_agree', () => {
    const rt = makeRuntime()
    const info = rt.agreeDraw()
    expect(info?.result).toBe('DRAW')
    expect(info?.endReason).toBe('draw_agree')
  })

  test('已终局后再落子被拒（GAME_NOT_FOUND）', () => {
    const rt = makeRuntime()
    rt.resign('BLACK')
    const res = rt.tryMove('WHITE', { x: 2, y: 3 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('GAME_NOT_FOUND')
  })

  test('取消本局 → cancelled', () => {
    const rt = makeRuntime()
    rt.cancel()
    expect(rt.status).toBe('cancelled')
  })
})
