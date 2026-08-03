/**
 * 经典积分结算单测（F-C-02，D5 缺陷修复）。
 * 覆盖 settleClassicScore 的胜/负/平/L0 不结算/低分胜高分追加/平局奖励 6 个用例。
 * Mock query 避免真实 DB 依赖。
 */
import { describe, test, expect, beforeEach, vi } from 'vitest'
import type { GameResult, AiLevel } from '@othello-platform/shared'

// Mock pool.query（pool.js 模块加载即抛错，必须 mock）
vi.mock('../db/pool.js', () => ({
  query: vi.fn(),
}))

import { query } from '../db/pool.js'
import { settleClassicScore } from '../services/rating-service.js'

type QueryRow = { id: number, classic_score: number, games_played: number }

const mockQuery = query as unknown as ReturnType<typeof vi.fn>

/**
 * 构造 query 应答序列：
 *  - SELECT users（fetchScore）返回 1 行
 *  - UPDATE users（applyDelta）返回空行
 *  顺序由 settleClassicScore 决定：black fetch → white fetch → black apply → white apply
 */
function setUsers(black: QueryRow | null, white: QueryRow | null): void {
  // 仅列出会被 fetchScore 命中的用户行（null 时不入列：blackId/whiteId === null 会跳过 fetchScore）
  const selectResults: QueryRow[] = []
  if (black) selectResults.push(black)
  if (white) selectResults.push(white)
  let selectIdx = 0
  mockQuery.mockImplementation(async () => {
    const row = selectResults[selectIdx]
    selectIdx += 1
    return { rows: row ? [row] : [] }
  })
}

function resetMock(): void {
  mockQuery.mockReset()
}

describe('settleClassicScore（F-C-02 经典积分）', () => {
  beforeEach(resetMock)

  test('L0 热身不结算（aiLevel=0 → 不调用 query）', async () => {
    setUsers(
      { id: 1, classic_score: 100, games_played: 5 },
      { id: 2, classic_score: 100, games_played: 5 },
    )
    await settleClassicScore({
      blackId: 1,
      whiteId: 2,
      aiLevel: 0 as AiLevel,
      result: 'BLACK' as GameResult,
    })
    expect(mockQuery).not.toHaveBeenCalled()
  })

  test('胜 +3', async () => {
    setUsers(
      { id: 1, classic_score: 100, games_played: 5 },
      { id: 2, classic_score: 100, games_played: 5 },
    )
    await settleClassicScore({
      blackId: 1,
      whiteId: 2,
      aiLevel: null,
      result: 'BLACK' as GameResult,
    })
    // black apply delta=3（胜方基础），white apply delta=-2（负方基础）
    const updateCalls = mockQuery.mock.calls.filter((c: unknown[]) =>
      /UPDATE users/i.test(String(c[0])),
    )
    expect(updateCalls).toHaveLength(2)
    const blackUpdate = updateCalls[0]
    const whiteUpdate = updateCalls[1]
    expect(blackUpdate?.[1]).toEqual([1, 3, 1, 0, 0]) // [userId, delta, winInc, lossInc, drawInc]
    expect(whiteUpdate?.[1]).toEqual([2, -2, 0, 1, 0])
  })

  test('负 -2', async () => {
    setUsers(
      { id: 1, classic_score: 100, games_played: 5 },
      { id: 2, classic_score: 100, games_played: 5 },
    )
    await settleClassicScore({
      blackId: 1,
      whiteId: 2,
      aiLevel: null,
      result: 'WHITE' as GameResult,
    })
    const updateCalls = mockQuery.mock.calls.filter((c: unknown[]) =>
      /UPDATE users/i.test(String(c[0])),
    )
    expect(updateCalls).toHaveLength(2)
    const blackUpdate = updateCalls[0]
    const whiteUpdate = updateCalls[1]
    // black 负 -2，white 胜 +3
    expect(blackUpdate?.[1]).toEqual([1, -2, 0, 1, 0])
    expect(whiteUpdate?.[1]).toEqual([2, 3, 1, 0, 0])
  })

  test('平 +1（双方对局数差 ≥2，无追加奖励）', async () => {
    setUsers(
      { id: 1, classic_score: 100, games_played: 10 },
      { id: 2, classic_score: 100, games_played: 5 },
    )
    await settleClassicScore({
      blackId: 1,
      whiteId: 2,
      aiLevel: null,
      result: 'DRAW' as GameResult,
    })
    const updateCalls = mockQuery.mock.calls.filter((c: unknown[]) =>
      /UPDATE users/i.test(String(c[0])),
    )
    expect(updateCalls).toHaveLength(2)
    // black delta=1（平局基础），无追加
    expect(updateCalls[0]?.[1]).toEqual([1, 1, 0, 0, 1])
    expect(updateCalls[1]?.[1]).toEqual([2, 1, 0, 0, 1])
  })

  test('低分胜高分追加 +floor(分差 × 20%)', async () => {
    // black=100（低）胜 white=200（高），分差 100 → 追加 floor(100*0.2)=20，总 delta=23
    setUsers(
      { id: 1, classic_score: 100, games_played: 5 },
      { id: 2, classic_score: 200, games_played: 5 },
    )
    await settleClassicScore({
      blackId: 1,
      whiteId: 2,
      aiLevel: null,
      result: 'BLACK' as GameResult,
    })
    const updateCalls = mockQuery.mock.calls.filter((c: unknown[]) =>
      /UPDATE users/i.test(String(c[0])),
    )
    expect(updateCalls[0]?.[1]).toEqual([1, 23, 1, 0, 0])
    expect(updateCalls[1]?.[1]).toEqual([2, -2, 0, 1, 0])
  })

  test('平局且双方对局数差 <2 → 各额外 +1', async () => {
    setUsers(
      { id: 1, classic_score: 100, games_played: 5 },
      { id: 2, classic_score: 100, games_played: 5 },
    )
    await settleClassicScore({
      blackId: 1,
      whiteId: 2,
      aiLevel: null,
      result: 'DRAW' as GameResult,
    })
    const updateCalls = mockQuery.mock.calls.filter((c: unknown[]) =>
      /UPDATE users/i.test(String(c[0])),
    )
    // black delta=1+1=2，white delta=1+1=2
    expect(updateCalls[0]?.[1]).toEqual([1, 2, 0, 0, 1])
    expect(updateCalls[1]?.[1]).toEqual([2, 2, 0, 0, 1])
  })

  test('blackId 为 null（AI 对手）→ 仅结算 white', async () => {
    setUsers(null, { id: 2, classic_score: 100, games_played: 5 })
    await settleClassicScore({
      blackId: null,
      whiteId: 2,
      aiLevel: 3 as AiLevel,
      result: 'WHITE' as GameResult,
    })
    const updateCalls = mockQuery.mock.calls.filter((c: unknown[]) =>
      /UPDATE users/i.test(String(c[0])),
    )
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]?.[1]).toEqual([2, 3, 1, 0, 0])
  })
})
