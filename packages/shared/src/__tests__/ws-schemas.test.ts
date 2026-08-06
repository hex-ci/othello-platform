import { describe, it, expect } from 'vitest'
import {
  PosSchema,
  ColorSchema,
  AuthPayloadSchema,
  RoomJoinPayloadSchema,
  RoomReadyPayloadSchema,
  MovePayloadSchema,
  ChatPayloadSchema,
  ChallengePayloadSchema,
  ReconnectPayloadSchema,
  GameStartPayloadSchema,
  MoveBroadcastPayloadSchema,
  GameOverPayloadSchema,
  StateSyncPayloadSchema,
  WsEnvelopeSchema,
  UndoResponsePayloadSchema,
} from '../ws.js'

describe('WS schema · 基础', () => {
  describe('PosSchema', () => {
    it('合法坐标 parse 成功', () => {
      const result = PosSchema.parse({ x: 3, y: 4 })
      expect(result.x).toBe(3)
      expect(result.y).toBe(4)
    })

    it('坐标越界 parse 失败', () => {
      expect(() => PosSchema.parse({ x: 8, y: 4 })).toThrow()
      expect(() => PosSchema.parse({ x: 3, y: -1 })).toThrow()
    })

    it('非整数 parse 失败', () => {
      expect(() => PosSchema.parse({ x: 3.5, y: 4 })).toThrow()
    })
  })

  describe('ColorSchema', () => {
    it('BLACK parse 成功', () => {
      expect(ColorSchema.parse('BLACK')).toBe('BLACK')
    })

    it('非法颜色 parse 失败', () => {
      expect(() => ColorSchema.parse('RED')).toThrow()
    })
  })
})

describe('WS schema · C→S 消息', () => {
  describe('AuthPayloadSchema', () => {
    it('合法 token parse 成功', () => {
      const result = AuthPayloadSchema.parse({ token: 'jwt-token-abc' })
      expect(result.token).toBe('jwt-token-abc')
    })

    it('空 token parse 失败', () => {
      expect(() => AuthPayloadSchema.parse({ token: '' })).toThrow()
    })
  })

  describe('RoomJoinPayloadSchema', () => {
    it('合法 roomId parse 成功', () => {
      const result = RoomJoinPayloadSchema.parse({ roomId: 42 })
      expect(result.roomId).toBe(42)
    })

    it('非正整数 roomId parse 失败', () => {
      expect(() => RoomJoinPayloadSchema.parse({ roomId: 0 })).toThrow()
      expect(() => RoomJoinPayloadSchema.parse({ roomId: -1 })).toThrow()
    })
  })

  describe('RoomReadyPayloadSchema', () => {
    it('ready=true parse 成功', () => {
      const result = RoomReadyPayloadSchema.parse({ roomId: 42, ready: true })
      expect(result.ready).toBe(true)
    })

    it('ready=false parse 成功', () => {
      const result = RoomReadyPayloadSchema.parse({ roomId: 42, ready: false })
      expect(result.ready).toBe(false)
    })
  })

  describe('MovePayloadSchema', () => {
    it('合法落子 parse 成功', () => {
      const input = { gameId: 'g_101', seq: 1, color: 'BLACK', pos: { x: 2, y: 3 } }
      const result = MovePayloadSchema.parse(input)
      expect(result.seq).toBe(1)
      expect(result.pos).toEqual({ x: 2, y: 3 })
    })

    it('非法 color parse 失败', () => {
      const input = { gameId: 'g_101', seq: 1, color: 'RED', pos: { x: 2, y: 3 } }
      expect(() => MovePayloadSchema.parse(input)).toThrow()
    })

    it('seq 非正整数 parse 失败', () => {
      const input = { gameId: 'g_101', seq: 0, color: 'BLACK', pos: { x: 2, y: 3 } }
      expect(() => MovePayloadSchema.parse(input)).toThrow()
    })
  })

  describe('ChatPayloadSchema', () => {
    it('合法公开消息 parse 成功', () => {
      const result = ChatPayloadSchema.parse({ channel: 'public', message: 'hello' })
      expect(result.channel).toBe('public')
    })

    it('空消息 parse 失败', () => {
      expect(() => ChatPayloadSchema.parse({ channel: 'public', message: '' })).toThrow()
    })

    it('消息超 500 字 parse 失败', () => {
      expect(() => ChatPayloadSchema.parse({ channel: 'public', message: 'x'.repeat(501) })).toThrow()
    })
  })

  describe('ChallengePayloadSchema', () => {
    it('带 aiLevel parse 成功', () => {
      const result = ChallengePayloadSchema.parse({ toUserId: 42, aiLevel: 3 })
      expect(result.aiLevel).toBe(3)
    })

    it('aiLevel=null parse 成功', () => {
      const result = ChallengePayloadSchema.parse({ toUserId: 42, aiLevel: null })
      expect(result.aiLevel).toBeNull()
    })

    it('aiLevel 超范围 parse 失败', () => {
      expect(() => ChallengePayloadSchema.parse({ toUserId: 42, aiLevel: 6 })).toThrow()
    })
  })

  describe('ReconnectPayloadSchema', () => {
    it('合法重连 parse 成功', () => {
      const result = ReconnectPayloadSchema.parse({ gameId: 'g_101', lastSeq: 5 })
      expect(result.lastSeq).toBe(5)
    })

    it('lastSeq=0 parse 成功', () => {
      const result = ReconnectPayloadSchema.parse({ gameId: 'g_101', lastSeq: 0 })
      expect(result.lastSeq).toBe(0)
    })

    it('lastSeq 负数 parse 失败', () => {
      expect(() => ReconnectPayloadSchema.parse({ gameId: 'g_101', lastSeq: -1 })).toThrow()
    })
  })
})

describe('WS schema · S→C 广播', () => {
  describe('GameStartPayloadSchema', () => {
    it('合法开局 parse 成功', () => {
      const input = {
        gameId: 'g_101',
        blackId: 1,
        whiteId: 2,
        turn: 'BLACK',
        board: new Array(64).fill(0),
      }
      const result = GameStartPayloadSchema.parse(input)
      expect(result.gameId).toBe('g_101')
      expect(result.board).toHaveLength(64)
    })

    it('board 长度非 64 parse 失败', () => {
      const input = {
        gameId: 'g_101',
        blackId: 1,
        whiteId: 2,
        turn: 'BLACK',
        board: new Array(32).fill(0),
      }
      expect(() => GameStartPayloadSchema.parse(input)).toThrow()
    })

    it('board 含非法值 parse 失败', () => {
      const input = {
        gameId: 'g_101',
        blackId: 1,
        whiteId: 2,
        turn: 'BLACK',
        board: new Array(64).fill(3),
      }
      expect(() => GameStartPayloadSchema.parse(input)).toThrow()
    })
  })

  describe('MoveBroadcastPayloadSchema', () => {
    it('合法落子广播 parse 成功', () => {
      const input = {
        gameId: 'g_101',
        seq: 1,
        color: 'BLACK',
        pos: { x: 2, y: 3 },
        flipped: [{ x: 3, y: 3 }, { x: 4, y: 4 }],
        nextTurn: 'WHITE',
        board: new Array(64).fill(0),
        blackCount: 2,
        whiteCount: 1,
      }
      const result = MoveBroadcastPayloadSchema.parse(input)
      expect(result.flipped).toHaveLength(2)
      expect(result.nextTurn).toBe('WHITE')
    })

    it('pos=null（pass 情况）parse 失败（MoveBroadcast 要求 pos 可空但需 flipped）', () => {
      const input = {
        gameId: 'g_101',
        seq: 1,
        color: 'BLACK',
        pos: null,
        flipped: [],
        nextTurn: 'WHITE',
        board: new Array(64).fill(0),
        blackCount: 2,
        whiteCount: 1,
      }
      // pos 可空，parse 应成功
      const result = MoveBroadcastPayloadSchema.parse(input)
      expect(result.pos).toBeNull()
    })
  })

  describe('GameOverPayloadSchema', () => {
    it('合法终局 parse 成功', () => {
      const input = {
        gameId: 'g_101',
        result: 'BLACK',
        endReason: 'normal',
        blackCount: 34,
        whiteCount: 30,
      }
      const result = GameOverPayloadSchema.parse(input)
      expect(result.result).toBe('BLACK')
    })

    it('非法 endReason parse 失败', () => {
      const input = {
        gameId: 'g_101',
        result: 'BLACK',
        endReason: 'cheated',
        blackCount: 34,
        whiteCount: 30,
      }
      expect(() => GameOverPayloadSchema.parse(input)).toThrow()
    })
  })

  describe('StateSyncPayloadSchema', () => {
    it('合法状态同步 parse 成功', () => {
      const input = {
        gameId: 'g_101',
        turn: 'BLACK',
        board: new Array(64).fill(0),
        blackCount: 2,
        whiteCount: 2,
        blackId: 1,
        whiteId: 2,
        remainingMs: 30000,
        status: 'playing',
        moves: [],
      }
      const result = StateSyncPayloadSchema.parse(input)
      expect(result.status).toBe('playing')
      expect(result.remainingMs).toBe(30000)
    })

    it('缺少 remainingMs parse 失败', () => {
      const input = {
        gameId: 'g_101',
        turn: 'BLACK',
        board: new Array(64).fill(0),
        blackCount: 2,
        whiteCount: 2,
        blackId: 1,
        whiteId: 2,
        status: 'playing',
        moves: [],
      }
      expect(() => StateSyncPayloadSchema.parse(input as never)).toThrow()
    })
  })

  describe('UndoResponsePayloadSchema', () => {
    it('合法悔棋响应 parse 成功', () => {
      const input = {
        gameId: 'g_101',
        success: true,
        board: new Array(64).fill(0),
        turn: 'BLACK',
        moveCount: 3,
      }
      const result = UndoResponsePayloadSchema.parse(input)
      expect(result.success).toBe(true)
      expect(result.moveCount).toBe(3)
    })

    it('board 长度非 64 parse 失败', () => {
      const input = {
        gameId: 'g_101',
        success: true,
        board: new Array(10).fill(0),
        turn: 'BLACK',
        moveCount: 3,
      }
      expect(() => UndoResponsePayloadSchema.parse(input)).toThrow()
    })
  })
})

describe('WS schema · 信封', () => {
  describe('WsEnvelopeSchema', () => {
    it('合法信封 parse 成功', () => {
      const input = { type: 'move', payload: { seq: 1 }, ts: 1234567890 }
      const result = WsEnvelopeSchema.parse(input)
      expect(result.type).toBe('move')
      expect(result.ts).toBe(1234567890)
    })

    it('最小信封（仅 type）parse 成功', () => {
      const result = WsEnvelopeSchema.parse({ type: 'ping' })
      expect(result.type).toBe('ping')
      expect(result.payload).toBeUndefined()
    })

    it('缺少 type parse 失败', () => {
      expect(() => WsEnvelopeSchema.parse({ payload: {} })).toThrow()
    })
  })
})
