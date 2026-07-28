/**
 * 在线对局状态（T08）。
 * 消费 WS 事件（game_start/move/pass/game_over/draw_request），
 * 客户端仅渲染，棋盘真相以服务端广播为准（§6.2 防作弊）。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { legalMoves, type Board, type Color, type Pos, type Cell } from '@othello-platform/engine'
import type {
  GameStartPayload,
  MoveBroadcastPayload,
  PassPayload,
  GameOverPayload,
  StateSyncPayload,
} from '@othello-platform/shared'
import { getWsClient, WS_RECONNECT_EVENT } from '@/api/ws-client'
import { i18n } from '@/i18n'

export const useOnlineGameStore = defineStore('online-game', () => {
  const router = useRouter()
  const gameId = ref<string | null>(null)
  const board = ref<Board>(new Uint8Array(64))
  const turn = ref<Color>('BLACK')
  const myColor = ref<Color | null>(null)
  const blackId = ref<number | null>(null)
  const whiteId = ref<number | null>(null)
  const blackName = ref<string | null>(null)
  const whiteName = ref<string | null>(null)
  const blackCount = ref(2)
  const whiteCount = ref(2)
  const status = ref<'idle' | 'playing' | 'finished'>('idle')
  const result = ref<'BLACK' | 'WHITE' | 'DRAW' | null>(null)
  const endReason = ref<string | null>(null)
  const lastMovePos = ref<Pos | null>(null)
  const moveLog = ref<{ seq: number; color: Color; pos: Pos | null; isPass: boolean }[]>([])
  const drawRequestedBy = ref<number | null>(null)
  const myUserId = ref<number | null>(null)
  /** 对局/房间错误态：not_found/finished，页面据此渲染错误卡片而非跳转 */
  const errorState = ref<{ kind: 'not_found' | 'finished'; msg: string } | null>(null)
  /** 当前回合剩余秒数（本地倒计时，服务端超时为权威） */
  const remainingSeconds = ref(30)
  /** 每步总秒数（人机 120s / 人人 30s，供 MoveTimer 圆环进度计算） */
  const totalSeconds = ref(30)
  /** 断线重连中（T13，F-E-04）：显示重连遮罩 */
  const reconnecting = ref(false)
  /** 提示的最优手位置（T12，短暂高亮后清除） */
  const hintPos = ref<Pos | null>(null)

  // ─── 再战（T17，F-E-16）───
  /** 对方发起再战请求时的发起方信息 */
  const rematchRequestedBy = ref<{ userId: number; username: string } | null>(null)
  /** 我已发起再战，等待对方应答 */
  const rematchWaiting = ref(false)
  /** 再战等待超时计时器（对方在线但不响应时兜底，避免无限等待） */
  let rematchTimer: ReturnType<typeof setTimeout> | null = null
  /** 再战等待超时阈值：30s（与每步限时一致） */
  const REMATCH_WAIT_TIMEOUT_MS = 30_000

  function clearRematchTimer(): void {
    if (rematchTimer !== null) {
      clearTimeout(rematchTimer)
      rematchTimer = null
    }
  }

  const isMyTurn = computed(() => status.value === 'playing' && turn.value === myColor.value)

  /** 是否人机对局（白座为 AI，userId 为 null）→ 决定提示/悔棋可用性（T12） */
  const isAiGame = computed(() => whiteId.value === null && status.value !== 'idle')

  const legalMovesList = computed<Pos[]>(() => {
    if (!isMyTurn.value) return []
    return legalMoves(board.value, turn.value)
  })

  function isLegalMove(pos: Pos): boolean {
    return legalMovesList.value.some((p) => p.x === pos.x && p.y === pos.y)
  }

  let unsubs: (() => void)[] = []
  let connected = false

  function connect(userId: number): void {
    if (connected) return
    connected = true
    // pg BIGINT-as-string 坑：auth.userId 来自 JWT 为字符串，统一 Number() 归一化（CLAUDE.md）
    myUserId.value = Number(userId)
    const ws = getWsClient()

    unsubs.push(
      ws.on('game_start', (p) => {
        const payload = p as GameStartPayload
        gameId.value = payload.gameId
        board.value = new Uint8Array(payload.board) as Board
        turn.value = payload.turn
        blackId.value = payload.blackId
        whiteId.value = payload.whiteId
        blackName.value = payload.blackName ?? null
        whiteName.value = payload.whiteName ?? null
        myColor.value = payload.blackId === myUserId.value ? 'BLACK' : 'WHITE'
        const counts = countFromBoard(board.value)
        blackCount.value = counts.black
        whiteCount.value = counts.white
        status.value = 'playing'
        result.value = null
        endReason.value = null
        drawRequestedBy.value = null
        // 人机对局每步 120s，人人 30s（与服务端 timeoutForMode 一致）
        totalSeconds.value = payload.whiteId === null ? 120 : 30
        remainingSeconds.value =
          payload.remainingMs != null ? Math.ceil(payload.remainingMs / 1000) : totalSeconds.value
        // 重入/重连补发时携带 moves → 恢复走子记录；全新开局无 moves → 清空（F-E-04）
        if (payload.moves && payload.moves.length > 0) {
          moveLog.value = payload.moves.map((m) => ({
            seq: m.seq,
            color: m.color,
            pos: m.pos,
            isPass: m.isPass,
          }))
          lastMovePos.value = moveLog.value[moveLog.value.length - 1]?.pos ?? null
        } else {
          moveLog.value = []
          lastMovePos.value = null
        }
      }),
    )

    unsubs.push(
      ws.on('move', (p) => {
        const payload = p as MoveBroadcastPayload
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
        drawRequestedBy.value = null
        if (payload.remainingMs != null) {
          remainingSeconds.value = Math.ceil(payload.remainingMs / 1000)
        }
      }),
    )

    unsubs.push(
      ws.on('pass', (p) => {
        const payload = p as PassPayload
        turn.value = payload.nextTurn
        if (payload.remainingMs != null) {
          remainingSeconds.value = Math.ceil(payload.remainingMs / 1000)
        }
      }),
    )

    unsubs.push(
      ws.on('game_over', (p) => {
        const payload = p as GameOverPayload
        status.value = 'finished'
        result.value = payload.result
        endReason.value = payload.endReason
        blackCount.value = payload.blackCount
        whiteCount.value = payload.whiteCount
      }),
    )

    unsubs.push(
      ws.on('draw_request', (p) => {
        const payload = p as { byUserId: number }
        if (payload.byUserId !== myUserId.value) drawRequestedBy.value = payload.byUserId
      }),
    )

    // 断线重连：state_sync 恢复棋盘 + 增量走子（T13，F-E-04）
    unsubs.push(
      ws.on('state_sync', (p) => {
        const payload = p as StateSyncPayload
        board.value = new Uint8Array(payload.board) as Board
        turn.value = payload.turn
        blackId.value = payload.blackId
        whiteId.value = payload.whiteId
        blackName.value = payload.blackName ?? null
        whiteName.value = payload.whiteName ?? null
        myColor.value = payload.blackId === myUserId.value ? 'BLACK' : 'WHITE'
        blackCount.value = payload.blackCount
        whiteCount.value = payload.whiteCount
        status.value = payload.status === 'playing' ? 'playing' : 'finished'
        totalSeconds.value = payload.whiteId === null ? 120 : 30
        remainingSeconds.value = Math.ceil(payload.remainingMs / 1000)
        // 增量走子合并进 moveLog（去重：仅追加 seq 更大的）
        const lastSeq = moveLog.value[moveLog.value.length - 1]?.seq ?? 0
        for (const m of payload.moves) {
          if (m.seq > lastSeq) {
            moveLog.value.push({ seq: m.seq, color: m.color, pos: m.pos, isPass: m.isPass })
          }
        }
        reconnecting.value = false
      }),
    )

    // 断线后成功重连 → 补发 reconnect 拉取增量（T13）
    unsubs.push(
      ws.on(WS_RECONNECT_EVENT, () => {
        if (gameId.value && status.value === 'playing') {
          reconnecting.value = true
          const lastSeq = moveLog.value[moveLog.value.length - 1]?.seq ?? 0
          ws.send('reconnect', { gameId: gameId.value, lastSeq })
        }
      }),
    )

    // 提示：高亮最优手 3s（T12，F-E-02）
    unsubs.push(
      ws.on('hint', (p) => {
        const payload = p as { gameId: string; pos: Pos | null }
        if (payload.gameId !== gameId.value || !payload.pos) return
        hintPos.value = payload.pos
        setTimeout(() => {
          hintPos.value = null
        }, 3000)
      }),
    )

    // 悔棋：回退两手后重建棋盘（T12，F-E-03）
    unsubs.push(
      ws.on('undo', (p) => {
        const payload = p as {
          gameId: string
          success: boolean
          board: number[]
          turn: Color
          moveCount: number
          blackCount: number
          whiteCount: number
          remainingMs?: number
        }
        if (payload.gameId !== gameId.value || !payload.success) return
        board.value = new Uint8Array(payload.board) as Board
        turn.value = payload.turn
        blackCount.value = payload.blackCount
        whiteCount.value = payload.whiteCount
        // 截断 moveLog 到回退后的手数
        moveLog.value = moveLog.value.slice(0, payload.moveCount)
        lastMovePos.value = moveLog.value[moveLog.value.length - 1]?.pos ?? null
        if (payload.remainingMs != null) {
          remainingSeconds.value = Math.ceil(payload.remainingMs / 1000)
        }
        hintPos.value = null
      }),
    )

    // ─── 再战（T17，F-E-16）───
    // 对方发起再战请求
    unsubs.push(
      ws.on('rematch_request', (p) => {
        const payload = p as { gameId: string; fromUserId: number; fromUsername: string }
        if (payload.gameId !== gameId.value) return
        rematchRequestedBy.value = { userId: payload.fromUserId, username: payload.fromUsername }
      }),
    )
    // 对方拒绝再战
    unsubs.push(
      ws.on('rematch_response', (p) => {
        const payload = p as { gameId: string; accept: boolean }
        if (payload.gameId !== gameId.value) return
        if (!payload.accept) {
          rematchWaiting.value = false
          clearRematchTimer()
          toast.error(i18n.global.t('game.rematchRejected'))
        }
      }),
    )
    // 双方接受 → 导航到再战新房间
    unsubs.push(
      ws.on('rematch_started', (p) => {
        const payload = p as { roomId: number; gameId: string }
        rematchWaiting.value = false
        rematchRequestedBy.value = null
        clearRematchTimer()
        void router.push(`/game/${payload.roomId}`)
      }),
    )

    // ─── 错误事件（T17 再战错误反馈 + 兜底）───
    // 服务端 error 事件：再战请求失败时重置 rematchWaiting 并 toast 提示，
    // 避免按钮卡在"等待对方接受…"（对比 spectate-store 的 error 监听）
    unsubs.push(
      ws.on('error', (p) => {
        const payload = p as { code: string; msg: string }
        if (!rematchWaiting.value) return
        // 对方离线 / 已离开对局页 / 对局不存在 → 立即失败
        if (
          payload.code === 'OPPONENT_OFFLINE' ||
          payload.code === 'OPPONENT_LEFT' ||
          payload.code === 'GAME_NOT_FOUND'
        ) {
          rematchWaiting.value = false
          clearRematchTimer()
          toast.error(i18n.global.t('game.rematchFailed'))
        }
      }),
    )
  }

  function disconnect(): void {
    for (const off of unsubs) off()
    unsubs = []
    connected = false
    clearRematchTimer()
    reset()
  }

  function reset(): void {
    gameId.value = null
    board.value = new Uint8Array(64)
    turn.value = 'BLACK'
    myColor.value = null
    status.value = 'idle'
    result.value = null
    moveLog.value = []
    drawRequestedBy.value = null
    rematchRequestedBy.value = null
    rematchWaiting.value = false
    clearRematchTimer()
    remainingSeconds.value = 30
    totalSeconds.value = 30
    errorState.value = null
  }

  // ─── 动作（发往服务端，由服务端权威校验）───

  /** 进入对局页后主动加入房间，触发服务端补发 game_start（修复错过首帧广播；兼作重连基础） */
  function joinRoom(roomId: number): void {
    getWsClient().send('room_join', { roomId })
  }

  function sendMove(pos: Pos): void {
    if (!gameId.value || !myColor.value || !isMyTurn.value) return
    getWsClient().send('move', {
      gameId: gameId.value,
      seq: moveLog.value.length + 1,
      color: myColor.value,
      pos,
    })
  }

  function resign(): void {
    if (!gameId.value || !myColor.value) return
    getWsClient().send('resign', { gameId: gameId.value, color: myColor.value })
  }

  function requestDraw(): void {
    if (!gameId.value) return
    getWsClient().send('draw_request', { gameId: gameId.value })
  }

  function respondDraw(accept: boolean): void {
    if (!gameId.value) return
    getWsClient().send('draw_response', { gameId: gameId.value, accept })
    drawRequestedBy.value = null
  }

  /** 请求提示（T12，仅人机） */
  function requestHint(): void {
    if (!gameId.value || !isAiGame.value || !isMyTurn.value) return
    getWsClient().send('hint', { gameId: gameId.value })
  }

  /** 请求悔棋（T12，仅人机） */
  function requestUndo(): void {
    if (!gameId.value || !isAiGame.value || !isMyTurn.value) return
    getWsClient().send('undo', { gameId: gameId.value })
  }

  /** 发起再战（T17，仅人人对局） */
  function requestRematch(): void {
    if (!gameId.value || isAiGame.value) return
    rematchWaiting.value = true
    clearRematchTimer()
    rematchTimer = setTimeout(() => {
      if (rematchWaiting.value) {
        rematchWaiting.value = false
        toast.error(i18n.global.t('game.rematchTimeout'))
      }
      rematchTimer = null
    }, REMATCH_WAIT_TIMEOUT_MS)
    getWsClient().send('rematch_request', { gameId: gameId.value })
  }

  /** 应答对方再战请求（T17） */
  function respondRematch(accept: boolean): void {
    if (!gameId.value) return
    getWsClient().send('rematch_response', { gameId: gameId.value, accept })
    rematchRequestedBy.value = null
    if (!accept) rematchWaiting.value = false
  }

  /** 离开终局对局页（F-E-16）：通知服务端自己已不可被再战，对方发起时可快速失败 */
  function leaveRematch(): void {
    if (!gameId.value) return
    getWsClient().send('rematch_leave', { gameId: gameId.value })
  }

  /** 本地倒计时（仅展示，服务端超时为权威） */
  function tickRemaining(): void {
    if (remainingSeconds.value > 0) remainingSeconds.value -= 1
  }

  function countFromBoard(b: Board): { black: number; white: number } {
    let black = 0
    let white = 0
    for (const c of b as unknown as Cell[]) {
      if (c === 1) black++
      else if (c === 2) white++
    }
    return { black, white }
  }

  return {
    gameId,
    board,
    turn,
    myColor,
    blackId,
    whiteId,
    blackName,
    whiteName,
    blackCount,
    whiteCount,
    status,
    errorState,
    result,
    endReason,
    lastMovePos,
    moveLog,
    drawRequestedBy,
    remainingSeconds,
    totalSeconds,
    reconnecting,
    hintPos,
    rematchRequestedBy,
    rematchWaiting,
    isMyTurn,
    isAiGame,
    legalMovesList,
    isLegalMove,
    connect,
    disconnect,
    joinRoom,
    sendMove,
    resign,
    requestDraw,
    respondDraw,
    requestHint,
    requestUndo,
    requestRematch,
    respondRematch,
    leaveRematch,
    tickRemaining,
  }
})
