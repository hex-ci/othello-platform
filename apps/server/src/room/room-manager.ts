/**
 * 房间/对局协调器（T07+T08+T09 中枢）。
 * 进程内持有房间座位与对局运行时（§6.1 弃用 Redis）；
 * 所有落子/终局/AI 回合在此串行编排，服务端为唯一权威（附录 C §C.4）。
 */
import type { FastifyInstance } from 'fastify'
import type { ConnectionHub } from '../ws/hub.js'
import type { ClientConnection } from '../ws/connection.js'
import { GameRuntime, type GameOverInfo } from '../game/game-runtime.js'
import { MoveTimer, timeoutForMode } from '../game/move-timer.js'
import { aiPool } from '../ai/ai-pool.js'
import * as gameService from '../services/game-service.js'
import * as roomService from '../services/room-service.js'
import { settleClassicScore, settleElo } from '../services/rating-service.js'
import * as friendService from '../services/friend-service.js'
import { query } from '../db/pool.js'
import {
  gameIdToNumber,
  gameIdToString,
  type GameMode,
  type AiLevel,
  type Color,
  type Pos,
  type GameRow,
} from '@othello-platform/shared'
import type { Color as EngineColor, Pos as EnginePos } from '@othello-platform/engine'
import { rebuildBoard } from '../game/replay.js'

/** 断线重连窗口（F-E-04）：窗口内重连不判逃跑，超时判负 */
const RECONNECT_WINDOW_MS = Number(process.env['RECONNECT_WINDOW_MS'] ?? 30_000)

interface RoomSeat {
  roomId: number
  mode: GameMode
  aiLevel: AiLevel | null
  blackId: number | null
  whiteId: number | null
  gameId: string | null
  /** 人人房准备阶段（附录C ready 子阶段）：与 DB rooms.black_ready/white_ready 同步 */
  blackReady: boolean
  whiteReady: boolean
  /** 房主 userId（Number 归一化；仅房主可开局） */
  ownerId: number | null
  /** 房间名（显示用，与 DB rooms.name 同步） */
  roomName: string
  /** 是否允许观战（房主设置，与 DB 同步） */
  spectatable: boolean
  /** 房间等待期旁观者 userId 集合（观战席，T14 扩展） */
  roomSpectators: Set<number>
}

interface ActiveGame {
  runtime: GameRuntime
  timer: MoveTimer
  /** 串行化锁：避免并发落子竞态 */
  busy: boolean
  /** 观战者 userId 集合（只读订阅，T14） */
  spectators: Set<number>
}

export class RoomManager {
  private rooms = new Map<number, RoomSeat>()
  private games = new Map<string, ActiveGame>()
  /** userId → 当前所在房间 */
  private userRoom = new Map<number, number>()
  /** userId → 断线重连窗口 { gameId, timer } */
  private reconnectWindows = new Map<number, { gameId: string, timer: NodeJS.Timeout }>()
  /** 再战请求：gameId → 已接受的 userId 集合（T17） */
  private rematchAccepted = new Map<string, Set<number>>()
  /** 已离开终局对局页的玩家：gameId → 已离开的 userId 集合（F-E-16，避免对方卡等） */
  private rematchLeftUsers = new Map<string, Set<number>>()
  /** 待处理挑战：fromUserId → { toUserId, aiLevel }（T17） */
  private pendingChallenges = new Map<number, { toUserId: number, aiLevel: AiLevel | null }>()

  constructor(
    private readonly app: FastifyInstance,
    private readonly hub: ConnectionHub,
  ) {}

  /** 当前进行中对局数（可观测性指标，T23 §6.5） */
  activeGameCount(): number {
    return this.games.size
  }

  /**
   * 崩溃回放恢复（T23，§6.1）：进程重启后从 DB 重建所有进行中对局。
   * 据 games 行重建 GameConfig，用 moves 表回放至当前 board/turn/seq，
   * 重启 move-timer；使重启后 handleReconnect / 续玩可用。
   * BIGINT 列经 node-postgres 返回字符串，统一 Number() 归一化。
   */
  async restoreActiveGames(): Promise<void> {
    const res = await query(`SELECT * FROM games WHERE status = 'playing' ORDER BY id ASC`)
    let restored = 0
    for (const row of res.rows as GameRow[]) {
      const gameId = gameIdToString(Number(row.id))
      const roomId = row.room_id !== null ? Number(row.room_id) : null
      const blackId = row.black_id !== null ? Number(row.black_id) : null
      const whiteId = row.white_id !== null ? Number(row.white_id) : null
      const aiColor = (row.ai_color as Color | null) ?? null
      const aiLevel = (row.ai_level as AiLevel | null) ?? null
      const mode = row.mode as GameMode

      const runtime = new GameRuntime({
        gameId,
        roomId,
        mode,
        black: { userId: blackId, isAi: aiColor === 'BLACK' },
        white: { userId: whiteId, isAi: aiColor === 'WHITE' },
        aiLevel,
        aiColor,
      })

      // 回放走子序列至当前棋盘/回合/seq
      const moves = await gameService.getGameMoves(Number(row.id))
      const rebuilt = rebuildBoard(moves)
      runtime.restore(rebuilt.board, rebuilt.turn, moves.length)

      const timer = new MoveTimer(color => void this.handleTimeout(gameId, color))
      timer.reset(runtime.turn, timeoutForMode(runtime.config.mode))
      this.games.set(gameId, { runtime, timer, busy: false, spectators: new Set() })
      restored += 1

      // 若轮到 AI，触发 Bot 续玩
      void this.maybeAiMove(runtime)
    }
    if (restored > 0) {
      this.app.log.info({ restored }, '崩溃回放：已重建进行中对局')
    }
  }

  // ─── 房间生命周期（T07）───

  /**
   * 玩家加入房间。人机房 join 即开局；人人房双方就位后进入 ready 子阶段，
   * 需双方 room_ready + 房主 room_start 才开局（附录C ready 子阶段）。
   * 私房口令由 REST join 层校验（§6.2）。
   */
  async joinRoom(userId: number, username: string, roomId: number): Promise<void> {
    const row = await roomService.getRoomById(roomId)
    if (!row) {
      this.sendToUser(userId, 'error', { code: 'ROOM_NOT_FOUND', msg: '房间不存在' })
      return
    }
    if (row.status === 'finished') {
      this.sendToUser(userId, 'error', { code: 'ROOM_FINISHED', msg: '该房间对局已结束' })
      return
    }

    let seat = this.rooms.get(roomId)
    if (!seat) {
      seat = {
        roomId,
        mode: row.mode as GameMode,
        aiLevel: (row.ai_level as AiLevel | null) ?? null,
        blackId: null,
        whiteId: null,
        gameId: null,
        blackReady: row.black_ready,
        whiteReady: row.white_ready,
        ownerId: row.owner_id !== null ? Number(row.owner_id) : null,
        roomName: row.name,
        spectatable: row.spectatable,
        roomSpectators: new Set<number>(),
      }
      this.rooms.set(roomId, seat)
    }

    // 已在房（重入）→ 重发房间状态；若已开局则补发 game_start
    // （修复客户端导航到对局页前错过首帧广播；兼作 M2 断线重连基础）
    if (seat.blackId === userId || seat.whiteId === userId) {
      await this.broadcastRoomState(seat)
      void this.syncGameToUser(userId, seat)
      return
    }

    if (seat.mode === 'human_vs_ai') {
      // 人机房：玩家执黑，AI 执白，立即开局
      if (seat.blackId !== null && seat.blackId !== userId) {
        this.sendToUser(userId, 'error', { code: 'ROOM_FULL', msg: '房间已满' })
        return
      }
      seat.blackId = userId
      this.userRoom.set(userId, roomId)
      await this.startGame(seat, username)
      return
    }

    // 人人房：分配座位（双方就位后进入 ready 子阶段，不自动开局）
    if (seat.blackId === null) {
      seat.blackId = userId
    }
    else if (seat.whiteId === null) {
      seat.whiteId = userId
    }
    else {
      this.sendToUser(userId, 'error', { code: 'ROOM_FULL', msg: '房间已满' })
      return
    }
    this.userRoom.set(userId, roomId)
    await this.broadcastRoomState(seat)
    // 人人房：双方就位后等待双方准备 + 房主开局（附录C ready 子阶段）
  }

  /**
   * 玩家准备/取消准备（人人房，未开局；附录C ready 子阶段）。
   * 校验：在房、人人房、未开局；更新 DB + 内存并广播 room_state。
   */
  async setReady(userId: number, roomId: number, ready: boolean): Promise<void> {
    const seat = this.rooms.get(roomId)
    if (!seat || seat.mode !== 'human_vs_human' || seat.gameId !== null) {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '当前房间不可准备' })
      return
    }
    if (seat.blackId !== userId && seat.whiteId !== userId) {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '不在该房间' })
      return
    }
    if (userId === seat.blackId) seat.blackReady = ready
    else if (userId === seat.whiteId) seat.whiteReady = ready
    await roomService.setReady(roomId, userId, ready, seat.blackId, seat.whiteId)
    await this.broadcastRoomState(seat)
  }

  /**
   * 房主开局（人人房，双方均准备后生效；附录C ready 子阶段）。
   * 校验：是房主、人人房、双方就位、双方均准备 → startGame + clearReady。
   */
  async startGameByHost(userId: number, roomId: number): Promise<void> {
    const seat = this.rooms.get(roomId)
    if (!seat) {
      this.sendToUser(userId, 'error', { code: 'ROOM_NOT_FOUND', msg: '房间不存在' })
      return
    }
    if (seat.ownerId !== userId) {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '仅房主可开局' })
      return
    }
    if (seat.mode !== 'human_vs_human' || seat.gameId !== null) {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '当前房间不可开局' })
      return
    }
    if (seat.blackId === null || seat.whiteId === null) {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '对手未就位' })
      return
    }
    if (!seat.blackReady || !seat.whiteReady) {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '双方未全部准备' })
      return
    }
    await this.startGame(seat)
    await roomService.clearReady(roomId)
    seat.blackReady = false
    seat.whiteReady = false
  }

  /**
   * 加入房间旁观（观战席，T14 扩展）：房间等待期旁观房间状态。
   * 校验：房间存在、允许观战、旁观者非房内玩家。加入旁观者集合并广播 room_state。
   */
  async spectateRoom(userId: number, roomId: number): Promise<void> {
    const seat = this.rooms.get(roomId)
    if (!seat) {
      this.sendToUser(userId, 'error', { code: 'ROOM_NOT_FOUND', msg: '房间不存在' })
      return
    }
    if (!seat.spectatable) {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '该房间不允许观战' })
      return
    }
    if (seat.blackId === userId || seat.whiteId === userId) {
      // 房内玩家不作为旁观者
      return
    }
    seat.roomSpectators.add(userId)
    await this.broadcastRoomState(seat)
  }

  /** 退出房间旁观 */
  async leaveSpectateRoom(userId: number, roomId: number): Promise<void> {
    const seat = this.rooms.get(roomId)
    if (!seat) return
    seat.roomSpectators.delete(userId)
    await this.broadcastRoomState(seat)
  }

  /**
   * 房主修改房间设置（未开局，双方未准备；附录C ready 子阶段）。
   * 支持执黑执白交换、可观战开关、口令设置/清除/修改。
   * 校验：是房主、人人房、未开局、双方均未准备（改设置前需取消准备）。
   */
  async updateSettings(
    userId: number,
    roomId: number,
    input: { colorAssign?: 'swap' | 'keep', spectatable?: boolean, password?: string | null },
  ): Promise<void> {
    const seat = this.rooms.get(roomId)
    if (!seat) {
      this.sendToUser(userId, 'error', { code: 'ROOM_NOT_FOUND', msg: '房间不存在' })
      return
    }
    if (seat.ownerId !== userId) {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '仅房主可修改设置' })
      return
    }
    if (seat.mode !== 'human_vs_human' || seat.gameId !== null) {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '当前房间不可修改设置' })
      return
    }
    if (seat.blackReady || seat.whiteReady) {
      this.sendToUser(userId, 'error', {
        code: 'VALIDATION_ERROR',
        msg: '修改设置前需双方取消准备',
      })
      return
    }
    // 执黑执白交换：仅在双方就位时生效
    if (input.colorAssign === 'swap' && seat.blackId !== null && seat.whiteId !== null) {
      const tmp = seat.blackId
      seat.blackId = seat.whiteId
      seat.whiteId = tmp
      this.userRoom.set(seat.blackId, roomId)
      this.userRoom.set(seat.whiteId, roomId)
    }
    // 可观战开关
    if (input.spectatable !== undefined) {
      seat.spectatable = input.spectatable
      await roomService.updateSpectatable(roomId, input.spectatable)
      // 关闭观战时清退现有旁观者
      if (!input.spectatable) seat.roomSpectators.clear()
    }
    // 口令设置/清除/修改
    if (input.password !== undefined) {
      await roomService.updatePassword(roomId, input.password)
    }
    await this.broadcastRoomState(seat)
  }

  private async startGame(seat: RoomSeat, creatorName?: string): Promise<void> {
    const aiColor: Color | null = seat.mode === 'human_vs_ai' ? 'WHITE' : null
    const created = await gameService.createGame({
      roomId: seat.roomId,
      blackId: seat.blackId,
      whiteId: seat.whiteId,
      mode: seat.mode,
      aiLevel: seat.aiLevel,
      aiColor,
    })
    seat.gameId = created.gameId
    await roomService.updateRoomStatus(seat.roomId, 'playing')

    const runtime = new GameRuntime({
      gameId: created.gameId,
      roomId: seat.roomId,
      mode: seat.mode,
      black: { userId: seat.blackId, isAi: false },
      white: { userId: seat.whiteId, isAi: aiColor === 'WHITE' },
      aiLevel: seat.aiLevel,
      aiColor,
    })
    const timer = new MoveTimer(color => void this.handleTimeout(created.gameId, color))
    this.games.set(created.gameId, { runtime, timer, busy: false, spectators: new Set() })

    // 广播 game_start（携带每步预算作为 remainingMs，前端据此初始化倒计时）
    const stepBudget = timeoutForMode(runtime.config.mode)
    this.broadcastToGame(seat, 'game_start', await this.gameStartPayload(runtime, stepBudget))
    await this.broadcastRoomState(seat)

    // 启动首步倒计时（黑方）
    timer.reset(runtime.turn, stepBudget)

    void creatorName
    // 人机：若首手即 AI（白先不会发生，黑先为人），无需触发
  }

  // ─── 落子编排（T08）───

  async handleMove(userId: number, gameId: string, color: Color, pos: Pos): Promise<void> {
    const active = this.games.get(gameId)
    if (!active) {
      this.sendToUser(userId, 'error', { code: 'GAME_NOT_FOUND', msg: '对局不存在' })
      return
    }
    const { runtime } = active

    // 校验执子色归属（防伪造 color，F-C-03）
    const own = runtime.colorOf(userId)
    if (own !== color) {
      await this.audit(userId, 'illegal_move', { gameId, reason: 'color_mismatch', color })
      this.sendToUser(userId, 'error', { code: 'NOT_YOUR_TURN', msg: '非该方回合' })
      return
    }

    if (active.busy) return // 串行化：忽略并发重入
    active.busy = true
    try {
      await this.applyMove(active, color, pos, userId)
    }
    finally {
      active.busy = false
    }
  }

  private async applyMove(
    active: ActiveGame,
    color: Color,
    pos: Pos,
    actorId: number,
  ): Promise<void> {
    const { runtime } = active
    const result = runtime.tryMove(color as EngineColor, pos as EnginePos)

    if (!result.ok) {
      await this.audit(actorId, 'illegal_move', {
        gameId: runtime.gameId,
        reason: result.code,
        pos,
      })
      this.sendToUser(actorId, 'error', { code: result.code, msg: '非法落子' })
      return
    }

    active.timer.clear()
    const gameNumId = gameIdToNumber(runtime.gameId)
    if (gameNumId !== null) {
      await gameService.recordMove({
        gameId: gameNumId,
        seq: result.seq,
        color,
        pos,
        isPass: false,
        flipped: result.flipped,
        boardSnapshot: Array.from(result.board),
      })
    }

    // 落子后下一回合的每步预算（服务端权威，随广播下发供前端重置倒计时）
    const nextStepMs = timeoutForMode(runtime.config.mode)
    this.broadcastMove(runtime, result, nextStepMs)

    // pass 处理：轮到的一方无合法手
    if (result.passAfter) {
      await this.recordPass(runtime, result.passAfter.passedColor)
      this.broadcastToGameByRuntime(runtime, 'pass', {
        gameId: runtime.gameId,
        color: result.passAfter.passedColor,
        nextTurn: result.passAfter.nextTurn,
        remainingMs: nextStepMs,
      })
    }

    if (result.gameOver) {
      await this.finalizeGame(runtime, result.gameOver)
      return
    }

    // 继续：重置倒计时，若轮到 AI 则触发 Bot
    const nextColor = result.passAfter ? result.passAfter.nextTurn : runtime.turn
    active.timer.reset(nextColor as Color, timeoutForMode(runtime.config.mode))
    await this.maybeAiMove(runtime)
  }

  private async recordPass(runtime: GameRuntime, color: Color): Promise<void> {
    runtime.seq += 1
    const gameNumId = gameIdToNumber(runtime.gameId)
    if (gameNumId !== null) {
      await gameService.recordMove({
        gameId: gameNumId,
        seq: runtime.seq,
        color,
        pos: null,
        isPass: true,
        flipped: [],
        boardSnapshot: Array.from(runtime.board),
      })
    }
  }

  private broadcastMove(
    runtime: GameRuntime,
    result: Extract<ReturnType<GameRuntime['tryMove']>, { ok: true }>,
    remainingMs: number,
  ): void {
    this.broadcastToGameByRuntime(runtime, 'move', {
      gameId: runtime.gameId,
      seq: result.seq,
      color: result.color,
      pos: result.pos,
      flipped: result.flipped,
      nextTurn: result.nextTurn,
      board: Array.from(result.board),
      blackCount: result.blackCount,
      whiteCount: result.whiteCount,
      remainingMs,
    })
  }

  // ─── AI 回合（T09）───

  private async maybeAiMove(runtime: GameRuntime): Promise<void> {
    if (runtime.status !== 'playing') return
    const player = runtime.playerOf(runtime.turn)
    if (!player.isAi) return

    const color = runtime.turn
    const level = runtime.config.aiLevel ?? 3
    const pos = await aiPool.think(runtime.board, level, color as EngineColor)

    const active = this.games.get(runtime.gameId)
    if (!active || runtime.status !== 'playing') return

    if (pos === null) {
      // AI 无合法手 → pass
      await this.recordPass(runtime, color)
      this.broadcastToGameByRuntime(runtime, 'pass', {
        gameId: runtime.gameId,
        color,
        nextTurn: runtime.turn,
      })
      active.timer.reset(runtime.turn as Color, timeoutForMode(runtime.config.mode))
      return
    }

    active.busy = true
    try {
      await this.applyMove(active, color, pos, -1)
    }
    finally {
      active.busy = false
    }
  }

  // ─── 终局（T08）───

  private async finalizeGame(runtime: GameRuntime, info: GameOverInfo): Promise<void> {
    const active = this.games.get(runtime.gameId)
    active?.timer.clear()

    const gameNumId = gameIdToNumber(runtime.gameId)
    if (gameNumId !== null) {
      await gameService.finishGame({
        gameId: gameNumId,
        result: info.result,
        endReason: info.endReason,
        moveCount: runtime.seq,
      })
    }

    // 经典积分结算（L0 不计）
    await settleClassicScore({
      blackId: runtime.config.black.userId,
      whiteId: runtime.config.white.userId,
      aiLevel: runtime.config.aiLevel,
      result: info.result,
    })

    // ELO 结算（仅人人对局，F-E-01；人机不计）
    await settleElo({
      blackId: runtime.config.black.userId,
      whiteId: runtime.config.white.userId,
      mode: runtime.config.mode,
      result: info.result,
      gameNumId,
    })

    this.broadcastToGameByRuntime(runtime, 'game_over', {
      gameId: runtime.gameId,
      result: info.result,
      endReason: info.endReason,
      blackCount: info.blackCount,
      whiteCount: info.whiteCount,
    })

    // 房间置 finished
    if (runtime.config.roomId !== null) {
      await roomService.updateRoomStatus(runtime.config.roomId, 'finished')
      const seat = this.rooms.get(runtime.config.roomId)
      if (seat) await this.broadcastRoomState(seat)
    }

    this.games.delete(runtime.gameId)
  }

  private async handleTimeout(gameId: string, color: Color): Promise<void> {
    const active = this.games.get(gameId)
    if (!active || active.runtime.status !== 'playing') return
    const info = active.runtime.timeout(color as EngineColor)
    if (info) await this.finalizeGame(active.runtime, info)
  }

  // ─── 和棋/认输/取消（T08，由 handler 调用）───

  async resign(userId: number, gameId: string, color: Color): Promise<void> {
    const active = this.games.get(gameId)
    if (!active) return
    if (active.runtime.colorOf(userId) !== color) {
      this.sendToUser(userId, 'error', { code: 'NOT_YOUR_TURN', msg: '非该方认输' })
      return
    }
    const info = active.runtime.resign(color as EngineColor)
    if (info) await this.finalizeGame(active.runtime, info)
  }

  async drawRequest(userId: number, gameId: string): Promise<void> {
    const active = this.games.get(gameId)
    if (!active) return
    active.runtime.drawRequestedBy = userId
    this.broadcastToGameByRuntime(active.runtime, 'draw_request', { gameId, byUserId: userId })
  }

  async drawResponse(userId: number, gameId: string, accept: boolean): Promise<void> {
    const active = this.games.get(gameId)
    if (!active) return
    const rt = active.runtime
    if (rt.drawRequestedBy === null || rt.drawRequestedBy === userId) return
    if (!accept) {
      rt.drawRequestedBy = null
      this.broadcastToGameByRuntime(rt, 'draw_response', { gameId, accept: false })
      return
    }
    const info = rt.agreeDraw()
    if (info) await this.finalizeGame(rt, info)
  }

  // ─── 再战 / 好友挑战（T17，F-E-16）───

  /** 再战请求：通知对局另一方 */
  async rematchRequest(userId: number, gameId: string): Promise<void> {
    const active = this.games.get(gameId)
    const opponentId = active
      ? this.opponentOf(active.runtime, userId)
      : await this.lastOpponentOf(gameId, userId)
    if (opponentId === null) {
      this.sendToUser(userId, 'error', { code: 'GAME_NOT_FOUND', msg: '对局不存在' })
      return
    }
    // 对方已离开（离线或退到大厅）→ 立即失败，避免发起方卡在等待
    if (!this.hub.isOnline(opponentId)) {
      this.sendToUser(userId, 'error', { code: 'OPPONENT_OFFLINE', msg: '对方已离开' })
      return
    }
    if (this.rematchLeftUsers.get(gameId)?.has(opponentId)) {
      this.sendToUser(userId, 'error', { code: 'OPPONENT_LEFT', msg: '对方已离开对局' })
      return
    }
    const fromUsername = (await this.usernameOf(userId)) ?? '对手'
    this.sendToUser(opponentId, 'rematch_request', { gameId, fromUserId: userId, fromUsername })
  }

  /** 标记玩家已离开终局对局页（F-E-16）：对方发起再战时据此快速失败 */
  rematchLeave(userId: number, gameId: string): void {
    let set = this.rematchLeftUsers.get(gameId)
    if (!set) {
      set = new Set()
      this.rematchLeftUsers.set(gameId, set)
    }
    set.add(userId)
  }

  /** 再战应答：双方均接受 → 互换执子开新局 */
  async rematchResponse(userId: number, gameId: string, accept: boolean): Promise<void> {
    const opponentId = await this.lastOpponentOf(gameId, userId)
    if (opponentId === null) {
      this.sendToUser(userId, 'error', { code: 'GAME_NOT_FOUND', msg: '对局不存在' })
      return
    }
    if (!accept) {
      this.rematchAccepted.delete(gameId)
      this.sendToUser(opponentId, 'rematch_response', { gameId, accept: false })
      return
    }
    let accepted = this.rematchAccepted.get(gameId)
    if (!accepted) {
      accepted = new Set()
      this.rematchAccepted.set(gameId, accepted)
    }
    // 应答方接受 → 发起方(opponentId)通过 rematch_request 已表达再战意愿，一并计入
    accepted.add(userId)
    accepted.add(opponentId)
    // 双方（2 人）均接受 → 开局
    if (accepted.size >= 2) {
      this.rematchAccepted.delete(gameId)
      this.rematchLeftUsers.delete(gameId)
      const players = [...accepted]
      const a = players[0]!
      const b = players[1]!
      await this.startRematchGame(gameId, a, b)
    }
  }

  /** 互换执子开再战新局：原黑方执白，原白方执黑 */
  private async startRematchGame(prevGameId: string, userA: number, userB: number): Promise<void> {
    const prevBlack = await this.lastBlackOf(prevGameId)
    // 互换：原黑方这局执白
    const blackId = prevBlack === userA ? userB : userA
    const whiteId = prevBlack === userA ? userA : userB

    const room = await roomService.createRoom({
      name: '再战',
      ownerId: blackId,
      mode: 'human_vs_human',
      aiLevel: null,
    })
    const seat: RoomSeat = {
      roomId: room.id,
      mode: 'human_vs_human',
      aiLevel: null,
      blackId,
      whiteId,
      gameId: null,
      blackReady: false,
      whiteReady: false,
      ownerId: blackId,
      roomName: '再战',
      spectatable: true,
      roomSpectators: new Set<number>(),
    }
    this.rooms.set(room.id, seat)
    this.userRoom.set(blackId, room.id)
    this.userRoom.set(whiteId, room.id)
    await this.startGame(seat)
    // 通知双方导航到新房间（roomId 归一化为 number，DB BIGINT 原为字符串）
    if (seat.gameId) {
      this.hub.sendToUsers([blackId, whiteId], 'rematch_started', {
        roomId: Number(room.id),
        gameId: seat.gameId,
      })
    }
  }

  /** 好友挑战：建房并通知对方 */
  async challenge(fromUserId: number, toUserId: number, aiLevel: AiLevel | null): Promise<void> {
    // pg BIGINT 经 JWT 传回为字符串，统一归一化为 number（与 hub 键一致）
    const from = Number(fromUserId)
    const to = Number(toUserId)
    if (from === to) {
      this.sendToUser(from, 'error', { code: 'VALIDATION_ERROR', msg: '不能挑战自己' })
      return
    }
    // PRD F-E-16「向指定好友发 challenge」：强制校验好友关系，防陌生人骚扰
    const relation = await friendService.getRelation(from, to)
    if (relation !== 'accepted') {
      this.sendToUser(from, 'error', { code: 'NOT_FRIEND', msg: '只能向好友发起挑战' })
      return
    }
    // 对方离线时 pendingChallenge 会永远挂着，直接拒绝
    if (!this.hub.isOnline(to)) {
      this.sendToUser(from, 'error', { code: 'OPPONENT_OFFLINE', msg: '对方不在线' })
      return
    }
    this.pendingChallenges.set(from, { toUserId: to, aiLevel })
    const fromUsername = (await this.usernameOf(from)) ?? '对手'
    this.sendToUser(to, 'challenge', { fromUserId: from, fromUsername })
  }

  /** 挑战应答：接受 → 建房开局；拒绝 → 通知发起方 */
  async challengeResponse(fromUserId: number, toUserId: number, accept: boolean): Promise<void> {
    const from = Number(fromUserId)
    const to = Number(toUserId)
    const pending = this.pendingChallenges.get(from)
    if (!pending || pending.toUserId !== to) {
      this.sendToUser(to, 'error', { code: 'VALIDATION_ERROR', msg: '挑战不存在或已过期' })
      return
    }
    this.pendingChallenges.delete(from)
    const opponentUsername = (await this.usernameOf(to)) ?? '对手'

    if (!accept) {
      this.sendToUser(from, 'challenge_result', {
        accepted: false,
        roomId: null,
        gameId: null,
        opponentUsername,
      })
      return
    }

    // 接受：建房，发起方执黑，应战方执白
    const room = await roomService.createRoom({
      name: '好友挑战',
      ownerId: from,
      mode: 'human_vs_human',
      aiLevel: null,
    })
    const seat: RoomSeat = {
      roomId: room.id,
      mode: 'human_vs_human',
      aiLevel: null,
      blackId: from,
      whiteId: to,
      gameId: null,
      blackReady: false,
      whiteReady: false,
      ownerId: from,
      roomName: '好友挑战',
      spectatable: true,
      roomSpectators: new Set<number>(),
    }
    this.rooms.set(room.id, seat)
    this.userRoom.set(from, room.id)
    this.userRoom.set(to, room.id)
    await this.startGame(seat)
    this.hub.sendToUsers([from, to], 'challenge_result', {
      accepted: true,
      roomId: Number(room.id),
      gameId: seat.gameId,
      opponentUsername,
    })
  }

  /** 对局中某玩家的对手 id（进行中） */
  private opponentOf(runtime: GameRuntime, userId: number): number | null {
    const { black, white } = runtime.config
    if (black.userId === userId) return white.userId
    if (white.userId === userId) return black.userId
    return null
  }

  /** 从 DB 查已结束对局的对手 id（再战用） */
  private async lastOpponentOf(gameId: string, userId: number): Promise<number | null> {
    const numId = gameIdToNumber(gameId)
    if (numId === null) return null
    try {
      const res = await query('SELECT black_id, white_id FROM games WHERE id = $1', [numId])
      const row = res.rows[0] as { black_id: string | null, white_id: string | null } | undefined
      if (!row) return null
      // pg BIGINT-as-string：black_id/white_id 返回字符串，统一 Number() 归一化（CLAUDE.md）
      const blackId = row.black_id !== null ? Number(row.black_id) : null
      const whiteId = row.white_id !== null ? Number(row.white_id) : null
      if (blackId === userId) return whiteId
      if (whiteId === userId) return blackId
      return null
    }
    catch {
      return null
    }
  }

  /** 从 DB 查已结束对局的原黑方 id（再战互换执子用） */
  private async lastBlackOf(gameId: string): Promise<number | null> {
    const numId = gameIdToNumber(gameId)
    if (numId === null) return null
    try {
      const res = await query('SELECT black_id FROM games WHERE id = $1', [numId])
      // pg BIGINT-as-string：black_id 返回字符串，统一 Number() 归一化（CLAUDE.md）
      const raw = (res.rows[0] as { black_id: string | null } | undefined)?.black_id ?? null
      return raw !== null ? Number(raw) : null
    }
    catch {
      return null
    }
  }

  // ─── 提示 / 悔棋（T12，仅人机）───

  /** 提示（F-E-02）：仅人机模式，返回当前回合最优手 */
  async requestHint(userId: number, gameId: string): Promise<void> {
    const active = this.games.get(gameId)
    if (!active) {
      this.sendToUser(userId, 'error', { code: 'GAME_NOT_FOUND', msg: '对局不存在' })
      return
    }
    const rt = active.runtime
    if (rt.config.mode !== 'human_vs_ai') {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '仅人机对局可提示' })
      return
    }
    if (rt.colorOf(userId) !== rt.turn) {
      this.sendToUser(userId, 'error', { code: 'NOT_YOUR_TURN', msg: '非你的回合' })
      return
    }
    // 用最高难度搜索最优手（提示=最优合法手）
    const level = (rt.config.aiLevel ?? 5) as AiLevel
    const pos = await aiPool.think(rt.board, 5, rt.turn as EngineColor)
    void level
    this.sendToUser(userId, 'hint', { gameId, pos })
  }

  /** 悔棋（F-E-03）：仅人机模式，回退两手（玩家 + AI），从 moves 表重建棋盘 */
  async requestUndo(userId: number, gameId: string): Promise<void> {
    const active = this.games.get(gameId)
    if (!active) {
      this.sendToUser(userId, 'error', { code: 'GAME_NOT_FOUND', msg: '对局不存在' })
      return
    }
    const rt = active.runtime
    if (rt.config.mode !== 'human_vs_ai') {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '仅人机对局可悔棋' })
      return
    }
    if (rt.status !== 'playing') {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '对局已结束' })
      return
    }
    // 仅在玩家回合允许悔棋（AI 思考中不回退）
    if (rt.colorOf(userId) !== rt.turn) {
      this.sendToUser(userId, 'error', { code: 'NOT_YOUR_TURN', msg: '等待 AI 走子完成后再悔棋' })
      return
    }
    if (active.busy) {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: 'AI 正在思考，请稍候' })
      return
    }

    const gameNumId = gameIdToNumber(gameId)
    if (gameNumId === null) return
    const moves = await gameService.getGameMoves(gameNumId)
    // 回退两手（玩家最后一手 + AI 前一手）；不足两手则回退到初始
    const targetCount = Math.max(0, moves.length - 2)
    const kept = moves.slice(0, targetCount)

    // 从保留的走子重建棋盘
    const rebuilt = rebuildBoard(kept)
    rt.restore(rebuilt.board, rebuilt.turn, kept.length)

    // 删除被回退的走子记录
    if (kept.length < moves.length) {
      await gameService.deleteMovesAfter(gameNumId, kept.length)
    }

    // 重置倒计时并广播新状态
    active.timer.reset(rt.turn as Color, timeoutForMode(rt.config.mode))
    const { blackCount, whiteCount } = rt.counts()
    this.broadcastToGameByRuntime(rt, 'undo', {
      gameId,
      success: true,
      board: Array.from(rt.board),
      turn: rt.turn,
      moveCount: kept.length,
      blackCount,
      whiteCount,
      remainingMs: active.timer.remainingMs(),
    })
    this.app.log.info({ userId, gameId, undoTo: kept.length }, '悔棋成功')
  }

  // ─── 断线重连（T13，F-E-04）───

  handleDisconnect(conn: ClientConnection): void {
    const userId = conn.userId
    if (userId === null) return
    this.userRoom.delete(userId)

    // 观战者断线：从所有对局移除观战身份（T14）
    for (const active of this.games.values()) {
      active.spectators.delete(userId)
    }

    // 找到该玩家正在进行的对局，启动重连窗口
    const gameId = this.findActiveGameOf(userId)
    if (gameId === null) return
    const active = this.games.get(gameId)
    if (!active || active.runtime.status !== 'playing') return

    // 已有窗口则不重复启动
    if (this.reconnectWindows.has(userId)) return

    // 暂停回合倒计时（避免与重连窗口竞态误判超时，T13）
    active.timer.pause()

    const timer = setTimeout(() => {
      this.reconnectWindows.delete(userId)
      void this.forfeitOnDisconnect(userId, gameId)
    }, RECONNECT_WINDOW_MS)
    this.reconnectWindows.set(userId, { gameId, timer })
    this.app.log.info({ userId, gameId, windowMs: RECONNECT_WINDOW_MS }, '玩家断线，开启重连窗口')
  }

  /** 重连（F-E-04）：窗口内重连不判逃跑，回 state_sync 恢复至断线点 */
  async handleReconnect(userId: number, gameId: string, lastSeq: number): Promise<void> {
    const active = this.games.get(gameId)
    if (!active) {
      this.sendToUser(userId, 'error', { code: 'GAME_NOT_FOUND', msg: '对局不存在或已结束' })
      return
    }
    const { runtime } = active
    // 校验是本局玩家
    if (runtime.colorOf(userId) === null) {
      this.sendToUser(userId, 'error', { code: 'GAME_NOT_FOUND', msg: '非本局玩家' })
      return
    }

    // 清除重连窗口（不再判负）
    const win = this.reconnectWindows.get(userId)
    if (win) {
      clearTimeout(win.timer)
      this.reconnectWindows.delete(userId)
    }
    this.userRoom.set(userId, runtime.config.roomId ?? -1)

    // 恢复回合倒计时（用断线前冻结的剩余时间继续，T13）
    active.timer.resume(runtime.turn, timeoutForMode(runtime.config.mode))

    // 拉取增量走子（seq > lastSeq）
    const gameNumId = gameIdToNumber(gameId)
    const moves = gameNumId !== null ? await gameService.getGameMovesSince(gameNumId, lastSeq) : []

    const { blackCount, whiteCount } = runtime.counts()
    this.sendToUser(userId, 'state_sync', {
      gameId,
      turn: runtime.turn,
      board: Array.from(runtime.board),
      blackCount,
      whiteCount,
      blackId: runtime.config.black.userId,
      whiteId: runtime.config.white.userId,
      blackName: runtime.config.black.isAi
        ? 'AI'
        : await this.usernameOf(runtime.config.black.userId),
      whiteName: runtime.config.white.isAi
        ? 'AI'
        : await this.usernameOf(runtime.config.white.userId),
      remainingMs: active.timer.remainingMs(),
      status: runtime.status,
      moves: moves.map(m => ({
        seq: m.seq,
        color: m.color,
        pos: m.pos,
        isPass: m.isPass,
        flipped: m.flipped,
      })),
    })
    this.app.log.info(
      { userId, gameId, lastSeq, deltaMoves: moves.length },
      '玩家重连，已回 state_sync',
    )
  }

  /** 查找玩家当前所在进行中对局的 gameId（无则 null） */
  private findActiveGameOf(userId: number): string | null {
    for (const [gameId, active] of this.games) {
      if (active.runtime.status !== 'playing') continue
      if (active.runtime.colorOf(userId) !== null) return gameId
    }
    return null
  }

  /** 重连窗口超时：判断线方负（F-C-02 逃跑） */
  private async forfeitOnDisconnect(userId: number, gameId: string): Promise<void> {
    const active = this.games.get(gameId)
    if (!active || active.runtime.status !== 'playing') return
    const color = active.runtime.colorOf(userId)
    if (color === null) return
    this.app.log.info({ userId, gameId }, '重连窗口超时，判断线方负')
    const info = active.runtime.disconnect(color as EngineColor)
    if (info) await this.finalizeGame(active.runtime, info)
  }

  // ─── 观战（T14，F-E-05/10）───

  /** 观战加入（只读订阅）：立即下发当前棋盘快照，后续随广播收走子 */
  async spectateJoin(userId: number, gameId: string): Promise<void> {
    const active = this.games.get(gameId)
    if (!active) {
      this.sendToUser(userId, 'error', { code: 'GAME_NOT_FOUND', msg: '对局不存在或已结束' })
      return
    }
    const { runtime } = active
    // 对局玩家不能观战自己的局
    if (runtime.colorOf(userId) !== null) {
      this.sendToUser(userId, 'error', { code: 'VALIDATION_ERROR', msg: '对局玩家无需观战' })
      return
    }
    active.spectators.add(userId)

    // 下发当前状态快照（复用 state_sync，lastSeq=0 即全量走子）
    const gameNumId = gameIdToNumber(gameId)
    const moves = gameNumId !== null ? await gameService.getGameMovesSince(gameNumId, 0) : []
    const { blackCount, whiteCount } = runtime.counts()
    this.sendToUser(userId, 'spectate_start', {
      gameId,
      turn: runtime.turn,
      board: Array.from(runtime.board),
      blackCount,
      whiteCount,
      blackId: runtime.config.black.userId,
      whiteId: runtime.config.white.userId,
      blackName: runtime.config.black.isAi
        ? 'AI'
        : await this.usernameOf(runtime.config.black.userId),
      whiteName: runtime.config.white.isAi
        ? 'AI'
        : await this.usernameOf(runtime.config.white.userId),
      remainingMs: active.timer.remainingMs(),
      status: runtime.status,
      spectatorCount: active.spectators.size,
      moves: moves.map(m => ({
        seq: m.seq,
        color: m.color,
        pos: m.pos,
        isPass: m.isPass,
        flipped: m.flipped,
      })),
    })
    this.app.log.info({ userId, gameId, spectators: active.spectators.size }, '观战者加入')
  }

  /** 观战离开 */
  spectateLeave(userId: number, gameId: string): void {
    const active = this.games.get(gameId)
    if (!active) return
    active.spectators.delete(userId)
    this.app.log.info({ userId, gameId, spectators: active.spectators.size }, '观战者离开')
  }

  /** 观战大厅：列出进行中对局（F-E-10） */
  async listActiveGames(): Promise<
    {
      gameId: string
      blackId: number | null
      whiteId: number | null
      blackName: string | null
      whiteName: string | null
      blackCount: number
      whiteCount: number
      moveCount: number
      spectatorCount: number
    }[]
  > {
    const result: {
      gameId: string
      blackId: number | null
      whiteId: number | null
      blackName: string | null
      whiteName: string | null
      blackCount: number
      whiteCount: number
      moveCount: number
      spectatorCount: number
    }[] = []
    for (const active of this.games.values()) {
      const rt = active.runtime
      if (rt.status !== 'playing') continue
      // 仅列出人人对局（F-C-06 人机为服务端托管、不计 ELO，旁观意义低，不进观战大厅）
      if (rt.config.mode === 'human_vs_ai') continue
      const { blackCount, whiteCount } = rt.counts()
      result.push({
        gameId: rt.gameId,
        blackId: rt.config.black.userId,
        whiteId: rt.config.white.userId,
        blackName: rt.config.black.isAi ? 'AI' : await this.usernameOf(rt.config.black.userId),
        whiteName: rt.config.white.isAi ? 'AI' : await this.usernameOf(rt.config.white.userId),
        blackCount,
        whiteCount,
        moveCount: rt.seq,
        spectatorCount: active.spectators.size,
      })
    }
    return result
  }

  /** 退出房间（仅 waiting 状态可退；playing 中退出按断线处理，M2 重连）。
   *  人人房未开局：若双方都离开则关闭房间；通知留房方房间状态变化。 */
  async leaveRoom(userId: number, roomId: number): Promise<void> {
    const seat = this.rooms.get(roomId)
    if (!seat) return
    if (seat.gameId !== null) return // 已开局，不允许直接退出
    if (seat.blackId === userId) {
      seat.blackId = null
      seat.blackReady = false
    }
    else if (seat.whiteId === userId) {
      seat.whiteId = null
      seat.whiteReady = false
    }
    this.userRoom.delete(userId)
    await roomService.setReady(roomId, userId, false, seat.blackId, seat.whiteId)
    // 双方都离开 → 关闭房间
    if (seat.blackId === null && seat.whiteId === null) {
      await roomService.updateRoomStatus(roomId, 'finished')
      this.rooms.delete(roomId)
      return
    }
    await this.broadcastRoomState(seat)
  }

  /** 房间内玩家 id（房间聊天广播用，T10） */
  roomMemberIds(roomId: number): number[] {
    const seat = this.rooms.get(roomId)
    if (!seat) return []
    const ids: number[] = []
    if (seat.blackId !== null) ids.push(seat.blackId)
    if (seat.whiteId !== null) ids.push(seat.whiteId)
    return ids
  }

  // ─── 广播辅助 ───

  /** 构造 game_start 载荷（开局与状态同步共用）；解析双方用户名供玩家卡片展示。
   *  remainingMs 为当前回合剩余毫秒（服务端权威，前端据此初始化每步倒计时）。
   */
  private async gameStartPayload(runtime: GameRuntime, remainingMs: number) {
    const { black, white } = runtime.config
    return {
      gameId: runtime.gameId,
      blackId: black.userId,
      whiteId: white.userId,
      blackName: black.isAi ? 'AI' : await this.usernameOf(black.userId),
      whiteName: white.isAi ? 'AI' : await this.usernameOf(white.userId),
      turn: runtime.turn,
      board: Array.from(runtime.board),
      aiLevel: runtime.config.aiLevel,
      aiColor: runtime.config.aiColor,
      remainingMs,
    }
  }

  /** 解析用户名（缺失返回 null，不阻断开局） */
  private async usernameOf(userId: number | null): Promise<string | null> {
    if (userId === null) return null
    try {
      const row = await query('SELECT username FROM users WHERE id = $1', [userId])
      return (row.rows[0]?.username as string | undefined) ?? null
    }
    catch {
      return null
    }
  }

  /** 向指定用户补发当前对局状态（重入/重连时修复错过的 game_start，携带完整走子历史） */
  private async syncGameToUser(userId: number, seat: RoomSeat): Promise<void> {
    if (seat.gameId === null) return
    const active = this.games.get(seat.gameId)
    if (!active) return
    const gameNumId = gameIdToNumber(seat.gameId)
    const moves = gameNumId !== null ? await gameService.getGameMovesSince(gameNumId, 0) : []
    this.sendToUser(userId, 'game_start', {
      ...(await this.gameStartPayload(active.runtime, active.timer.remainingMs())),
      moves: moves.map(m => ({
        seq: m.seq,
        color: m.color,
        pos: m.pos,
        isPass: m.isPass,
      })),
    })
  }

  private broadcastToGameByRuntime(runtime: GameRuntime, type: string, payload: unknown): void {
    const ids: number[] = []
    if (runtime.config.black.userId !== null) ids.push(runtime.config.black.userId)
    if (runtime.config.white.userId !== null) ids.push(runtime.config.white.userId)
    // 观战者同样接收实时走子（只读订阅，T14）
    const active = this.games.get(runtime.gameId)
    if (active) for (const sid of active.spectators) ids.push(sid)
    this.hub.sendToUsers(ids, type, payload)
  }

  private broadcastToGame(seat: RoomSeat, type: string, payload: unknown): void {
    const ids: number[] = []
    if (seat.blackId !== null) ids.push(seat.blackId)
    if (seat.whiteId !== null) ids.push(seat.whiteId)
    this.hub.sendToUsers(ids, type, payload)
  }

  private async broadcastRoomState(seat: RoomSeat): Promise<void> {
    const ids: number[] = []
    if (seat.blackId !== null) ids.push(seat.blackId)
    if (seat.whiteId !== null) ids.push(seat.whiteId)
    // 房间等待期旁观者也接收 room_state（观战席，T14 扩展）
    for (const sid of seat.roomSpectators) ids.push(sid)
    const blackName = seat.blackId !== null ? ((await this.usernameOf(seat.blackId)) ?? null) : null
    const whiteName = seat.whiteId !== null ? ((await this.usernameOf(seat.whiteId)) ?? null) : null
    // 旁观者列表（含用户名）
    const spectatorList = []
    for (const sid of seat.roomSpectators) {
      const name = (await this.usernameOf(sid)) ?? '旁观者'
      spectatorList.push({ userId: sid, username: name })
    }
    this.hub.sendToUsers(ids, 'room_state', {
      roomId: seat.roomId,
      gameId: seat.gameId,
      blackId: seat.blackId,
      whiteId: seat.whiteId,
      status: seat.gameId ? 'playing' : 'waiting',
      blackReady: seat.blackReady,
      whiteReady: seat.whiteReady,
      blackName,
      whiteName,
      ownerId: seat.ownerId,
      roomName: seat.roomName,
      spectatable: seat.spectatable,
      spectators: spectatorList,
    })
  }

  private sendToUser(userId: number, type: string, payload: unknown): void {
    this.hub.sendToUser(userId, type, payload)
  }

  private async audit(userId: number, action: string, meta: unknown): Promise<void> {
    try {
      await query('INSERT INTO audit_logs (user_id, action, meta) VALUES ($1, $2, $3)', [
        userId > 0 ? userId : null,
        action,
        JSON.stringify(meta),
      ])
    }
    catch (err) {
      this.app.log.warn({ err }, '写审计日志失败')
    }
  }
}
