/**
 * 好友/屏蔽服务单测（F-E-07，BIGINT-as-string 回归防护）。
 * 覆盖 listFriends 的 pg BIGINT-as-string 归一化：
 * user_id/friend_id 经 pg 返回为字符串，与 number 类型的 userId 比较会始终 false，
 * 导致 otherId/direction/online 全错乱，前端 unblock 传错 userId → 404。
 * Mock query 避免真实 DB 依赖，断言返回字段类型与方向语义正确。
 */
import { describe, test, expect, beforeEach, vi } from 'vitest'

vi.mock('../db/pool.js', () => ({
  query: vi.fn(),
}))

import { query } from '../db/pool.js'
import { listFriends, getRelation } from '../services/friend-service.js'

const mockQuery = query as unknown as ReturnType<typeof vi.fn>

/**
 * 构造 friends 表行：pg 实际把 BIGINT id/user_id/friend_id 返回为字符串，
 * 模拟真实 pg 行为（回归测试的核心：不能写成 number）。
 */
function pgRow(
  id: number,
  userId: number,
  friendId: number,
  status: 'pending' | 'accepted' | 'blocked',
) {
  return {
    id: String(id),
    user_id: String(userId),
    friend_id: String(friendId),
    status,
    username: 'someone',
    elo: 1500,
  }
}

describe('listFriends · BIGINT-as-string 归一化', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  test('blocked 列表：A 屏蔽 B，返回 userId=对方(number)、direction=outgoing', async () => {
    // A(198) 屏蔽 B(199)：记录 user_id=198, friend_id=199
    mockQuery.mockResolvedValueOnce({
      rows: [pgRow(16, 198, 199, 'blocked')],
      rowCount: 1,
    })

    const result = await listFriends(198, [], 'blocked')

    expect(result).toHaveLength(1)
    const f = result[0]!
    // 核心：userId 必须是对方 199（number），不能是字符串 "198"（自己）
    expect(f.userId).toBe(199)
    expect(typeof f.userId).toBe('number')
    expect(f.direction).toBe('outgoing')
  })

  test('blocked 列表：unblock 用返回的 userId 能命中（不再 404 根因）', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [pgRow(16, 198, 199, 'blocked')],
      rowCount: 1,
    })

    const result = await listFriends(198, [], 'blocked')
    const blockedUserId = result[0]!.userId

    // 前端 store.unblock(b.userId) 传给 unblockUser，SQL 是
    //   DELETE WHERE user_id=$1 AND friend_id=$2 AND status='blocked'
    // userId=198(me), friendId=199(返回的 blockedUserId) → 能命中
    expect(blockedUserId).toBe(199)
    expect(blockedUserId).not.toBe(198) // 修复前会返回 198 → 404
  })

  test('accepted 列表：A 看 B 是 incoming，B 看 A 是 outgoing', async () => {
    // B(199) 发起请求给 A(198)：记录 user_id=199, friend_id=198
    // A 查 accepted → otherId=199, direction=incoming（B 发起的）
    mockQuery.mockResolvedValueOnce({
      rows: [pgRow(10, 199, 198, 'accepted')],
      rowCount: 1,
    })
    const aView = await listFriends(198, [], 'accepted')
    expect(aView[0]!.userId).toBe(199)
    expect(aView[0]!.direction).toBe('incoming')

    // B 查 accepted → otherId=198, direction=outgoing
    mockQuery.mockResolvedValueOnce({
      rows: [pgRow(10, 199, 198, 'accepted')],
      rowCount: 1,
    })
    const bView = await listFriends(199, [], 'accepted')
    expect(bView[0]!.userId).toBe(198)
    expect(bView[0]!.direction).toBe('outgoing')
  })

  test('online 状态：otherId 为 number 时能命中 onlineSet（修复前 string vs number Set.has 永远 false）', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [pgRow(16, 198, 199, 'blocked')],
      rowCount: 1,
    })
    // 199 在线
    const result = await listFriends(198, [199], 'blocked')
    expect(result[0]!.online).toBe(true)
  })

  test('id 字段归一化为 number', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [pgRow(16, 198, 199, 'blocked')],
      rowCount: 1,
    })
    const result = await listFriends(198, [], 'blocked')
    expect(result[0]!.id).toBe(16)
    expect(typeof result[0]!.id).toBe('number')
  })
})

describe('getRelation · 关系状态判定（T17/F-E-16）', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  test('无记录 → none', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    expect(await getRelation(198, 199)).toBe('none')
  })

  test('查自己 → none（不查库）', async () => {
    expect(await getRelation(198, 198)).toBe('none')
    expect(mockQuery).not.toHaveBeenCalled()
  })

  test('accepted → accepted', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'accepted', user_id: String(199) }],
      rowCount: 1,
    })
    expect(await getRelation(198, 199)).toBe('accepted')
  })

  test('pending 且 user_id=我 → pending-out', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'pending', user_id: String(198) }],
      rowCount: 1,
    })
    expect(await getRelation(198, 199)).toBe('pending-out')
  })

  test('pending 且 user_id=对方 → pending-in（BIGINT 字符串归一化）', async () => {
    // pg 返回 user_id 为字符串 "199"，与 number 198 比较前必须 Number()
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'pending', user_id: String(199) }],
      rowCount: 1,
    })
    expect(await getRelation(198, 199)).toBe('pending-in')
  })

  test('blocked 且 user_id=我 → blocked', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'blocked', user_id: String(198) }],
      rowCount: 1,
    })
    expect(await getRelation(198, 199)).toBe('blocked')
  })

  test('blocked 且 user_id=对方（对方屏蔽我）→ none', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'blocked', user_id: String(199) }],
      rowCount: 1,
    })
    expect(await getRelation(198, 199)).toBe('none')
  })
})
