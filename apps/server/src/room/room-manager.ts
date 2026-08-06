/**
 * 房间/对局协调器（T07+T08+T09 中枢）。
 * 进程内持有房间座位与对局运行时（§6.1 弃用 Redis）；
 * 所有落子/终局/AI 回合在此串行编排，服务端为唯一权威（附录 C §C.4）。
 *
 * 类型定义 → room-types.ts，无状态辅助函数 → room-utils.ts。
 * 本模块保留核心编排逻辑（落子/AI/终局/重连）及私有状态。
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
import { RECONNECT_WINDOW_MS, type RoomSeat, type ActiveGame } from './room-types.js'
import {
  usernameOf,
  audit,
  gameStartPayload,
  broadcastToGameByRuntime,
  broadcastToGame,
  broadcastRoomState,
} from './room-utils.js'
import {
  rematchRequest as rematchRequestFn,
  rematchLeave as rematchLeaveFn,
  rematchResponse as rematchResponseFn,
  challenge as challengeFn,
  challengeResponse as challengeResponseFn,
  type RematchState,
} from './room-rematch.js'
import {
  spectateJoin as spectateJoinFn,
  spectateLeave as spectateLeaveFn,
  listActiveGames as listActiveGamesFn,
} from './room-spectate.js'

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
      await broadcastRoomState(this.hub, seat)
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
    await broadcastRoomState(this.hub, seat)
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
    await broadcastRoomState(this.hub, seat)
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
    await broadcastRoomState(this.hub, seat)
  }

  /** 退出房间旁观 */
  async leaveSpectateRoom(userId: number, roomId: number): Promise<void> {
    const seat = this.rooms.get(roomId)
    if (!seat) return
    seat.roomSpectators.delete(userId)
    await broadcastRoomState(this.hub, seat)
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
    await broadcastRoomState(this.hub, seat)
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
    broadcastToGame(this.hub, seat, 'game_start', await gameStartPayload(runtime, stepBudget))
    await broadcastRoomState(this.hub, seat)

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
      await audit(this.app, userId, 'illegal_move', { gameId, reason: 'color_mismatch', color })
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
      await audit(this.app, actorId, 'illegal_move', {
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
      broadcastToGameByRuntime(this.hub, this.games, runtime, 'pass', {
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
    broadcastToGameByRuntime(this.hub, this.games, runtime, 'move', {
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
      broadcastToGameByRuntime(this.hub, this.games, runtime, 'pass', {
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

    broadcastToGameByRuntime(this.hub, this.games, runtime, 'game_over', {
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
      if (seat) await broadcastRoomState(this.hub, seat)
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
    broadcastToGameByRuntime(this.hub, this.games, active.runtime, 'draw_request', { gameId, byUserId: userId })
  }

  async drawResponse(userId: number, gameId: string, accept: boolean): Promise<void> {
    const active = this.games.get(gameId)
    if (!active) return
    const rt = active.runtime
    if (rt.drawRequestedBy === null || rt.drawRequestedBy === userId) return
    if (!accept) {
      rt.drawRequestedBy = null
      broadcastToGameByRuntime(this.hub, this.games, rt, 'draw_response', { gameId, accept: false })
      return
    }
    const info = rt.agreeDraw()
    if (info) await this.finalizeGame(rt, info)
  }

  // ─── 再战 / 好友挑战（T17，F-E-16）─── 委托 room-rematch.ts

  private get rematchState(): RematchState {
    return {
      rematchAccepted: this.rematchAccepted,
      rematchLeftUsers: this.rematchLeftUsers,
      pendingChallenges: this.pendingChallenges,
      rooms: this.rooms,
      userRoom: this.userRoom,
    }
  }

  /** 再战请求：通知对局另一方 */
  async rematchRequest(userId: number, gameId: string): Promise<void> {
    await rematchRequestFn(this.hub, this.rematchState, this.games, userId, gameId)
  }

  /** 标记玩家已离开终局对局页（F-E-16） */
  rematchLeave(userId: number, gameId: string): void {
    rematchLeaveFn(this.rematchState, userId, gameId)
  }

  /** 再战应答：双方均接受 → 互换执子开新局 */
  async rematchResponse(userId: number, gameId: string, accept: boolean): Promise<void> {
    await rematchResponseFn(this.hub, this.rematchState, userId, gameId, accept, seat => this.startGame(seat))
  }

  /** 好友挑战：建房并通知对方 */
  async challenge(fromUserId: number, toUserId: number, aiLevel: AiLevel | null): Promise<void> {
    await challengeFn(this.hub, this.rematchState, fromUserId, toUserId, aiLevel)
  }

  /** 挑战应答：接受 → 建房开局；拒绝 → 通知发起方 */
  async challengeResponse(fromUserId: number, toUserId: number, accept: boolean): Promise<void> {
    await challengeResponseFn(this.hub, this.rematchState, fromUserId, toUserId, accept, seat => this.startGame(seat))
  }

  // opponentOf / lastOpponentOf / lastBlackOf → room-utils.ts

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
    broadcastToGameByRuntime(this.hub, this.games, rt, 'undo', {
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
        : await usernameOf(runtime.config.black.userId),
      whiteName: runtime.config.white.isAi
        ? 'AI'
        : await usernameOf(runtime.config.white.userId),
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

  // ─── 观战（T14，F-E-05/10）─── 委托 room-spectate.ts

  /** 观战加入（只读订阅）：立即下发当前棋盘快照，后续随广播收走子 */
  async spectateJoin(userId: number, gameId: string): Promise<void> {
    await spectateJoinFn(this.app, this.hub, this.games, userId, gameId)
  }

  /** 观战离开 */
  spectateLeave(userId: number, gameId: string): void {
    spectateLeaveFn(this.app, this.games, userId, gameId)
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
    return listActiveGamesFn(this.games)
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
    await broadcastRoomState(this.hub, seat)
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

  /** 向指定用户补发当前对局状态（重入/重连时修复错过的 game_start，携带完整走子历史） */
  private async syncGameToUser(userId: number, seat: RoomSeat): Promise<void> {
    if (seat.gameId === null) return
    const active = this.games.get(seat.gameId)
    if (!active) return
    const gameNumId = gameIdToNumber(seat.gameId)
    const moves = gameNumId !== null ? await gameService.getGameMovesSince(gameNumId, 0) : []
    this.hub.sendToUser(userId, 'game_start', {
      ...(await gameStartPayload(active.runtime, active.timer.remainingMs())),
      moves: moves.map(m => ({
        seq: m.seq,
        color: m.color,
        pos: m.pos,
        isPass: m.isPass,
      })),
    })
  }

  private sendToUser(userId: number, type: string, payload: unknown): void {
    this.hub.sendToUser(userId, type, payload)
  }
}
