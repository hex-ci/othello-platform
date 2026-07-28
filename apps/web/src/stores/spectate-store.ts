/**
 * 观战状态（T14，F-E-05/10）。
 * 只读订阅进行中对局：spectate_start 下发当前快照，随后随广播收 move/pass/game_over。
 * 观战者不可落子、不影响对局；棋盘真相以服务端广播为准（§6.2）。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Board, Color, Pos } from '@othello-platform/engine'
import type { MoveBroadcastPayload, PassPayload, GameOverPayload } from '@othello-platform/shared'
import { getWsClient, WS_RECONNECT_EVENT } from '@/api/ws-client'

interface SpectateStartPayload {
  gameId: string
  turn: Color
  board: number[]
  blackCount: number
  whiteCount: number
  blackId: number | null
  whiteId: number | null
  blackName: string | null
  whiteName: string | null
  remainingMs: number
  status: 'playing' | 'finished' | 'cancelled'
  spectatorCount: number
  moves: { seq: number; color: Color; pos: Pos | null; isPass: boolean }[]
}

export const useSpectateStore = defineStore('spectate', () => {
  const gameId = ref<string | null>(null)
  const board = ref<Board>(new Uint8Array(64))
  const turn = ref<Color>('BLACK')
  const blackId = ref<number | null>(null)
  const whiteId = ref<number | null>(null)
  const blackName = ref<string | null>(null)
  const whiteName = ref<string | null>(null)
  const blackCount = ref(2)
  const whiteCount = ref(2)
  const status = ref<'idle' | 'playing' | 'finished'>('idle')
  const result = ref<'BLACK' | 'WHITE' | 'DRAW' | null>(null)
  /** 对局不存在错误态，页面据此渲染错误卡片而非跳转 */
  const errorState = ref<{ kind: 'not_found'; msg: string } | null>(null)
  const endReason = ref<string | null>(null)
  const lastMovePos = ref<Pos | null>(null)
  const moveLog = ref<{ seq: number; color: Color; pos: Pos | null; isPass: boolean }[]>([])
  const remainingSeconds = ref(30)
  /** 每步总秒数（人机 120s / 人人 30s，供 MoveTimer 圆环进度计算） */
  const totalSeconds = ref(30)
  const spectatorCount = ref(0)

  let unsubs: (() => void)[] = []
  let connected = false

  function connect(): void {
    if (connected) return
    connected = true
    const ws = getWsClient()

    unsubs.push(
      ws.on('spectate_start', (p) => {
        const payload = p as SpectateStartPayload
        gameId.value = payload.gameId
        board.value = new Uint8Array(payload.board) as Board
        turn.value = payload.turn
        blackId.value = payload.blackId
        whiteId.value = payload.whiteId
        blackName.value = payload.blackName ?? null
        whiteName.value = payload.whiteName ?? null
        blackCount.value = payload.blackCount
        whiteCount.value = payload.whiteCount
        status.value = payload.status === 'playing' ? 'playing' : 'finished'
        totalSeconds.value = payload.whiteId === null ? 120 : 30
        remainingSeconds.value = Math.ceil(payload.remainingMs / 1000)
        spectatorCount.value = payload.spectatorCount
        moveLog.value = payload.moves.map((m) => ({
          seq: m.seq,
          color: m.color,
          pos: m.pos,
          isPass: m.isPass,
        }))
        lastMovePos.value = moveLog.value[moveLog.value.length - 1]?.pos ?? null
      }),
    )

    unsubs.push(
      ws.on('move', (p) => {
        const payload = p as MoveBroadcastPayload
        if (payload.gameId !== gameId.value) return
        board.value = new Uint8Array(payload.board) as Board
        if (payload.nextTurn) turn.value = payload.nextTurn
        blackCount.value = payload.blackCount
        whiteCount.value = payload.whiteCount
        lastMovePos.value = payload.pos
        if (payload.pos) {
          moveLog.value.push({
            seq: payload.seq,
            color: payload.color,
            pos: payload.pos,
            isPass: false,
          })
        }
        if (payload.remainingMs != null) {
          remainingSeconds.value = Math.ceil(payload.remainingMs / 1000)
        }
      }),
    )

    unsubs.push(
      ws.on('pass', (p) => {
        const payload = p as PassPayload
        if (payload.gameId !== gameId.value) return
        turn.value = payload.nextTurn
        if (payload.remainingMs != null) {
          remainingSeconds.value = Math.ceil(payload.remainingMs / 1000)
        }
      }),
    )

    unsubs.push(
      ws.on('game_over', (p) => {
        const payload = p as GameOverPayload
        if (payload.gameId !== gameId.value) return
        status.value = 'finished'
        result.value = payload.result
        endReason.value = payload.endReason
        blackCount.value = payload.blackCount
        whiteCount.value = payload.whiteCount
      }),
    )

    // 断线重连：重新订阅观战（T13/T14）
    unsubs.push(
      ws.on(WS_RECONNECT_EVENT, () => {
        if (gameId.value && status.value === 'playing') {
          ws.send('spectate_join', { gameId: gameId.value })
        }
      }),
    )

    // 错误处理：对局不存在 → 设 errorState，页面渲染错误卡片（不跳转）
    unsubs.push(
      ws.on('error', (p) => {
        const payload = p as { code?: string; msg?: string }
        if (payload.code === 'GAME_NOT_FOUND') {
          errorState.value = { kind: 'not_found', msg: payload.msg ?? '对局不存在或已结束' }
        }
      }),
    )
  }

  function spectateJoin(id: string): void {
    getWsClient().send('spectate_join', { gameId: id })
  }

  function spectateLeave(): void {
    if (gameId.value) getWsClient().send('spectate_leave', { gameId: gameId.value })
  }

  function disconnect(): void {
    spectateLeave()
    for (const off of unsubs) off()
    unsubs = []
    connected = false
    reset()
  }

  function reset(): void {
    gameId.value = null
    board.value = new Uint8Array(64)
    turn.value = 'BLACK'
    status.value = 'idle'
    result.value = null
    moveLog.value = []
    spectatorCount.value = 0
    remainingSeconds.value = 30
    totalSeconds.value = 30
    errorState.value = null
  }

  function tickRemaining(): void {
    if (remainingSeconds.value > 0) remainingSeconds.value -= 1
  }

  return {
    gameId,
    board,
    turn,
    blackId,
    whiteId,
    blackName,
    whiteName,
    blackCount,
    whiteCount,
    status,
    result,
    errorState,
    endReason,
    lastMovePos,
    moveLog,
    remainingSeconds,
    totalSeconds,
    spectatorCount,
    connect,
    disconnect,
    spectateJoin,
    spectateLeave,
    tickRemaining,
  }
})
