/**
 * RoomManager.challenge 好友/在线校验单测（T17，F-E-16）。
 * 服务端对 challenge 强制校验：非好友 → NOT_FRIEND error；对方离线 → OPPONENT_OFFLINE error；
 * 好友在线 → 正常走 pendingChallenges + 通知对方。
 * Mock friendService.getRelation + hub（isOnline/sendToUser）+ db query（usernameOf）。
 */
import { describe, test, expect, beforeEach, vi } from 'vitest'

vi.mock('../db/pool.js', () => ({
  query: vi.fn(),
}))

vi.mock('../services/friend-service.js', () => ({
  getRelation: vi.fn(),
}))

import { query } from '../db/pool.js'
import * as friendService from '../services/friend-service.js'
import { RoomManager } from '../room/room-manager.js'

const mockQuery = query as unknown as ReturnType<typeof vi.fn>
const mockGetRelation = friendService.getRelation as unknown as ReturnType<typeof vi.fn>

function makeHub() {
  return {
    isOnline: vi.fn(),
    sendToUser: vi.fn(),
    sendToUsers: vi.fn(),
  }
}

describe('RoomManager.challenge · 好友/在线校验', () => {
  let hub: ReturnType<typeof makeHub>
  let rooms: RoomManager

  beforeEach(() => {
    vi.clearAllMocks()
    hub = makeHub()
    // app 参数 challenge 路径不用，传最小 stub
    rooms = new RoomManager({} as never, hub as never)
  })

  test('挑战自己 → VALIDATION_ERROR', async () => {
    await rooms.challenge(198, 198, null)
    expect(hub.sendToUser).toHaveBeenCalledWith(
      198,
      'error',
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    )
    expect(mockGetRelation).not.toHaveBeenCalled()
  })

  test('非好友（none）→ NOT_FRIEND error，不通知对方', async () => {
    mockGetRelation.mockResolvedValue('none')
    await rooms.challenge(198, 199, null)
    expect(hub.sendToUser).toHaveBeenCalledWith(
      198,
      'error',
      expect.objectContaining({ code: 'NOT_FRIEND' }),
    )
    // 不应向对方发 challenge
    expect(hub.sendToUser).not.toHaveBeenCalledWith(199, 'challenge', expect.anything())
  })

  test('pending 关系 → NOT_FRIEND error', async () => {
    mockGetRelation.mockResolvedValue('pending-out')
    await rooms.challenge(198, 199, null)
    expect(hub.sendToUser).toHaveBeenCalledWith(
      198,
      'error',
      expect.objectContaining({ code: 'NOT_FRIEND' }),
    )
  })

  test('好友但对方离线 → OPPONENT_OFFLINE error', async () => {
    mockGetRelation.mockResolvedValue('accepted')
    hub.isOnline.mockReturnValue(false)
    await rooms.challenge(198, 199, null)
    expect(hub.sendToUser).toHaveBeenCalledWith(
      198,
      'error',
      expect.objectContaining({ code: 'OPPONENT_OFFLINE' }),
    )
    expect(hub.sendToUser).not.toHaveBeenCalledWith(199, 'challenge', expect.anything())
  })

  test('好友且在线 → 通知对方 challenge', async () => {
    mockGetRelation.mockResolvedValue('accepted')
    hub.isOnline.mockReturnValue(true)
    // usernameOf 查用户名
    mockQuery.mockResolvedValue({ rows: [{ username: 'regress' }], rowCount: 1 })
    await rooms.challenge(198, 199, null)
    expect(hub.sendToUser).toHaveBeenCalledWith(
      199,
      'challenge',
      expect.objectContaining({ fromUserId: 198, fromUsername: 'regress' }),
    )
    // 不应有 error
    expect(hub.sendToUser).not.toHaveBeenCalledWith(198, 'error', expect.anything())
  })
})
