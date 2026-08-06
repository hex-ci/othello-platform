import { describe, it, expect } from 'vitest'
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  ForgotRequestSchema,
  ResetRequestSchema,
  RefreshRequestSchema,
  CreateRoomRequestSchema,
  RoomListQuerySchema,
  CreateChatRequestSchema,
  LeaderboardQuerySchema,
  FriendRequestSchema,
  JoinRoomResponseSchema,
  OkResponseSchema,
} from '../rest.js'

describe('REST schema · 认证', () => {
  describe('RegisterRequestSchema', () => {
    it('合法注册请求 parse 成功', () => {
      // Arrange
      const input = { username: 'alice_01', password: 'Password123' }

      // Act
      const result = RegisterRequestSchema.parse(input)

      // Assert
      expect(result.username).toBe('alice_01')
      expect(result.password).toBe('Password123')
      expect(result.email).toBeUndefined()
    })

    it('含中文用户名 parse 成功', () => {
      const input = { username: '玩家甲', password: 'Password123' }
      const result = RegisterRequestSchema.parse(input)
      expect(result.username).toBe('玩家甲')
    })

    it('带可选 email parse 成功', () => {
      const input = { username: 'bob', email: 'bob@example.com', password: 'Password123' }
      const result = RegisterRequestSchema.parse(input)
      expect(result.email).toBe('bob@example.com')
    })

    it('密码不足 8 位 parse 失败', () => {
      const input = { username: 'bob', password: 'short' }
      expect(() => RegisterRequestSchema.parse(input)).toThrow()
    })

    it('用户名含非法字符 parse 失败', () => {
      const input = { username: 'alice@bad', password: 'Password123' }
      expect(() => RegisterRequestSchema.parse(input)).toThrow()
    })

    it('用户名过短 parse 失败', () => {
      const input = { username: 'a', password: 'Password123' }
      expect(() => RegisterRequestSchema.parse(input)).toThrow()
    })
  })

  describe('LoginRequestSchema', () => {
    it('合法登录 parse 成功', () => {
      const input = { username: 'alice', password: 'Password123' }
      const result = LoginRequestSchema.parse(input)
      expect(result.username).toBe('alice')
      expect(result.remember).toBe(false)
    })

    it('带 remember=true parse 成功', () => {
      const input = { username: 'alice', password: 'Password123', remember: true }
      const result = LoginRequestSchema.parse(input)
      expect(result.remember).toBe(true)
    })

    it('空用户名 parse 失败', () => {
      const input = { username: '', password: 'Password123' }
      expect(() => LoginRequestSchema.parse(input)).toThrow()
    })
  })

  describe('ForgotRequestSchema', () => {
    it('合法 email parse 成功', () => {
      const result = ForgotRequestSchema.parse({ email: 'bob@example.com' })
      expect(result.email).toBe('bob@example.com')
    })

    it('非法 email parse 失败', () => {
      expect(() => ForgotRequestSchema.parse({ email: 'not-an-email' })).toThrow()
    })
  })

  describe('ResetRequestSchema', () => {
    it('合法重置请求 parse 成功', () => {
      const input = { token: 'reset-token-abc', password: 'NewPass123' }
      const result = ResetRequestSchema.parse(input)
      expect(result.token).toBe('reset-token-abc')
      expect(result.password).toBe('NewPass123')
    })

    it('空 token parse 失败', () => {
      const input = { token: '', password: 'NewPass123' }
      expect(() => ResetRequestSchema.parse(input)).toThrow()
    })
  })

  describe('RefreshRequestSchema', () => {
    it('合法 64 位 hex token parse 成功', () => {
      const token = '0'.repeat(64)
      const result = RefreshRequestSchema.parse({ refreshToken: token })
      expect(result.refreshToken).toBe(token)
    })

    it('非 64 位字符串 parse 失败', () => {
      expect(() => RefreshRequestSchema.parse({ refreshToken: 'abc' })).toThrow()
    })

    it('含非 hex 字符 parse 失败', () => {
      const token = 'g'.repeat(64)
      expect(() => RefreshRequestSchema.parse({ refreshToken: token })).toThrow()
    })
  })
})

describe('REST schema · 房间', () => {
  describe('CreateRoomRequestSchema', () => {
    it('合法人机房 parse 成功', () => {
      const input = { name: '我的房间', mode: 'human_vs_ai', aiLevel: 3 }
      const result = CreateRoomRequestSchema.parse(input)
      expect(result.name).toBe('我的房间')
      expect(result.mode).toBe('human_vs_ai')
      expect(result.aiLevel).toBe(3)
    })

    it('合法人人房（无 aiLevel）parse 成功', () => {
      const input = { name: '对决', mode: 'human_vs_human' }
      const result = CreateRoomRequestSchema.parse(input)
      expect(result.aiLevel).toBeUndefined()
    })

    it('带口令 parse 成功', () => {
      const input = { name: '私密房', mode: 'human_vs_human', password: 'secret' }
      const result = CreateRoomRequestSchema.parse(input)
      expect(result.password).toBe('secret')
    })

    it('空房间名 parse 失败', () => {
      const input = { name: '', mode: 'human_vs_ai' }
      expect(() => CreateRoomRequestSchema.parse(input)).toThrow()
    })

    it('非法 mode parse 失败', () => {
      const input = { name: 'test', mode: 'invalid' }
      expect(() => CreateRoomRequestSchema.parse(input)).toThrow()
    })

    it('aiLevel 超范围 parse 失败', () => {
      const input = { name: 'test', mode: 'human_vs_ai', aiLevel: 6 }
      expect(() => CreateRoomRequestSchema.parse(input)).toThrow()
    })
  })

  describe('RoomListQuerySchema', () => {
    it('默认值 parse 成功（page=1, limit=20）', () => {
      const result = RoomListQuerySchema.parse({})
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
    })

    it('字符串 coerce 为数字 parse 成功', () => {
      const result = RoomListQuerySchema.parse({ page: '3', limit: '50' })
      expect(result.page).toBe(3)
      expect(result.limit).toBe(50)
    })

    it('limit 超上限 parse 失败', () => {
      expect(() => RoomListQuerySchema.parse({ limit: 101 })).toThrow()
    })
  })
})

describe('REST schema · 聊天', () => {
  describe('CreateChatRequestSchema', () => {
    it('合法公开消息 parse 成功', () => {
      const input = { channel: 'public', message: '你好' }
      const result = CreateChatRequestSchema.parse(input)
      expect(result.channel).toBe('public')
      expect(result.message).toBe('你好')
    })

    it('合法房间消息 parse 成功', () => {
      const input = { channel: 'room', roomId: 42, message: 'good move' }
      const result = CreateChatRequestSchema.parse(input)
      expect(result.roomId).toBe(42)
    })

    it('空消息 parse 失败', () => {
      const input = { channel: 'public', message: '' }
      expect(() => CreateChatRequestSchema.parse(input)).toThrow()
    })

    it('消息超 500 字 parse 失败', () => {
      const input = { channel: 'public', message: 'x'.repeat(501) }
      expect(() => CreateChatRequestSchema.parse(input)).toThrow()
    })

    it('非法 channel parse 失败', () => {
      const input = { channel: 'private', message: 'hello' }
      expect(() => CreateChatRequestSchema.parse(input)).toThrow()
    })
  })
})

describe('REST schema · 榜单与好友', () => {
  describe('LeaderboardQuerySchema', () => {
    it('默认 by=elo, limit=50 parse 成功', () => {
      const result = LeaderboardQuerySchema.parse({})
      expect(result.by).toBe('elo')
      expect(result.limit).toBe(50)
    })

    it('by=classic parse 成功', () => {
      const result = LeaderboardQuerySchema.parse({ by: 'classic' })
      expect(result.by).toBe('classic')
    })
  })

  describe('FriendRequestSchema', () => {
    it('数字 friendId parse 成功', () => {
      const result = FriendRequestSchema.parse({ friendId: 42 })
      expect(result.friendId).toBe(42)
    })

    it('字符串 friendId coerce 成功（bigint 兼容）', () => {
      const result = FriendRequestSchema.parse({ friendId: '42' })
      expect(result.friendId).toBe(42)
    })

    it('非正整数 friendId parse 失败', () => {
      expect(() => FriendRequestSchema.parse({ friendId: -1 })).toThrow()
    })
  })
})

describe('REST schema · 响应', () => {
  describe('JoinRoomResponseSchema', () => {
    it('有效响应 parse 成功', () => {
      const input = { gameId: 'g_101', color: 'BLACK' as const }
      const result = JoinRoomResponseSchema.parse(input)
      expect(result.gameId).toBe('g_101')
      expect(result.color).toBe('BLACK')
    })

    it('null 值 parse 成功', () => {
      const input = { gameId: null, color: null }
      const result = JoinRoomResponseSchema.parse(input)
      expect(result.gameId).toBeNull()
      expect(result.color).toBeNull()
    })

    it('非法 color parse 失败', () => {
      const input = { gameId: 'g_101', color: 'RED' }
      expect(() => JoinRoomResponseSchema.parse(input)).toThrow()
    })
  })

  describe('OkResponseSchema', () => {
    it('ok=true parse 成功', () => {
      const result = OkResponseSchema.parse({ ok: true })
      expect(result.ok).toBe(true)
    })

    it('ok=false parse 失败', () => {
      expect(() => OkResponseSchema.parse({ ok: false })).toThrow()
    })
  })
})
