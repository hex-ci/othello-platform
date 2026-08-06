/**
 * 再战 / 好友挑战逻辑（T17，F-E-16）。
 * 从 room-manager.ts 提取，操作传入的共享状态。
 */
import type { ConnectionHub } from '../ws/hub.js'
import * as roomService from '../services/room-service.js'
import * as friendService from '../services/friend-service.js'
import type { AiLevel } from '@othello-platform/shared'
import type { RoomSeat } from './room-types.js'
import { usernameOf, lastOpponentOf, lastBlackOf, opponentOf } from './room-utils.js'

/** 再战/挑战共享状态（由 RoomManager 持有，传入此模块操作） */
export interface RematchState {
  rematchAccepted: Map<string, Set<number>>
  rematchLeftUsers: Map<string, Set<number>>
  pendingChallenges: Map<number, { toUserId: number, aiLevel: AiLevel | null }>
  rooms: Map<number, RoomSeat>
  userRoom: Map<number, number>
}

/** 再战请求：通知对局另一方 */
export async function rematchRequest(
  hub: ConnectionHub,
  state: RematchState,
  games: Map<string, { runtime: { config: { black: { userId: number | null }, white: { userId: number | null } }, colorOf: (id: number) => string | null, gameId: string } }>,
  userId: number,
  gameId: string,
): Promise<void> {
  const active = games.get(gameId)
  const opponentId = active
    ? opponentOf(active.runtime as never, userId)
    : await lastOpponentOf(gameId, userId)
  if (opponentId === null) {
    hub.sendToUser(userId, 'error', { code: 'GAME_NOT_FOUND', msg: '对局不存在' })
    return
  }
  if (!hub.isOnline(opponentId)) {
    hub.sendToUser(userId, 'error', { code: 'OPPONENT_OFFLINE', msg: '对方已离开' })
    return
  }
  if (state.rematchLeftUsers.get(gameId)?.has(opponentId)) {
    hub.sendToUser(userId, 'error', { code: 'OPPONENT_LEFT', msg: '对方已离开对局' })
    return
  }
  const fromUsername = (await usernameOf(userId)) ?? '对手'
  hub.sendToUser(opponentId, 'rematch_request', { gameId, fromUserId: userId, fromUsername })
}

/** 标记玩家已离开终局对局页（F-E-16） */
export function rematchLeave(state: RematchState, userId: number, gameId: string): void {
  let set = state.rematchLeftUsers.get(gameId)
  if (!set) {
    set = new Set()
    state.rematchLeftUsers.set(gameId, set)
  }
  set.add(userId)
}

/** 再战应答：双方均接受 → 互换执子开新局 */
export async function rematchResponse(
  hub: ConnectionHub,
  state: RematchState,
  userId: number,
  gameId: string,
  accept: boolean,
  startGame: (seat: RoomSeat) => Promise<void>,
): Promise<void> {
  const opponentId = await lastOpponentOf(gameId, userId)
  if (opponentId === null) {
    hub.sendToUser(userId, 'error', { code: 'GAME_NOT_FOUND', msg: '对局不存在' })
    return
  }
  if (!accept) {
    state.rematchAccepted.delete(gameId)
    hub.sendToUser(opponentId, 'rematch_response', { gameId, accept: false })
    return
  }
  let accepted = state.rematchAccepted.get(gameId)
  if (!accepted) {
    accepted = new Set()
    state.rematchAccepted.set(gameId, accepted)
  }
  accepted.add(userId)
  accepted.add(opponentId)
  if (accepted.size >= 2) {
    state.rematchAccepted.delete(gameId)
    state.rematchLeftUsers.delete(gameId)
    const players = [...accepted]
    const a = players[0]!
    const b = players[1]!
    await startRematchGame(hub, state, gameId, a, b, startGame)
  }
}

/** 互换执子开再战新局：原黑方执白，原白方执黑 */
async function startRematchGame(
  hub: ConnectionHub,
  state: RematchState,
  prevGameId: string,
  userA: number,
  userB: number,
  startGame: (seat: RoomSeat) => Promise<void>,
): Promise<void> {
  const prevBlack = await lastBlackOf(prevGameId)
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
  state.rooms.set(room.id, seat)
  state.userRoom.set(blackId, room.id)
  state.userRoom.set(whiteId, room.id)
  await startGame(seat)
  if (seat.gameId) {
    hub.sendToUsers([blackId, whiteId], 'rematch_started', {
      roomId: Number(room.id),
      gameId: seat.gameId,
    })
  }
}

/** 好友挑战：建房并通知对方 */
export async function challenge(
  hub: ConnectionHub,
  state: RematchState,
  fromUserId: number,
  toUserId: number,
  aiLevel: AiLevel | null,
): Promise<void> {
  const from = Number(fromUserId)
  const to = Number(toUserId)
  if (from === to) {
    hub.sendToUser(from, 'error', { code: 'VALIDATION_ERROR', msg: '不能挑战自己' })
    return
  }
  const relation = await friendService.getRelation(from, to)
  if (relation !== 'accepted') {
    hub.sendToUser(from, 'error', { code: 'NOT_FRIEND', msg: '只能向好友发起挑战' })
    return
  }
  if (!hub.isOnline(to)) {
    hub.sendToUser(from, 'error', { code: 'OPPONENT_OFFLINE', msg: '对方不在线' })
    return
  }
  state.pendingChallenges.set(from, { toUserId: to, aiLevel })
  const fromUsername = (await usernameOf(from)) ?? '对手'
  hub.sendToUser(to, 'challenge', { fromUserId: from, fromUsername })
}

/** 挑战应答：接受 → 建房开局；拒绝 → 通知发起方 */
export async function challengeResponse(
  hub: ConnectionHub,
  state: RematchState,
  fromUserId: number,
  toUserId: number,
  accept: boolean,
  startGame: (seat: RoomSeat) => Promise<void>,
): Promise<void> {
  const from = Number(fromUserId)
  const to = Number(toUserId)
  const pending = state.pendingChallenges.get(from)
  if (!pending || pending.toUserId !== to) {
    hub.sendToUser(to, 'error', { code: 'VALIDATION_ERROR', msg: '挑战不存在或已过期' })
    return
  }
  state.pendingChallenges.delete(from)
  const opponentUsername = (await usernameOf(to)) ?? '对手'

  if (!accept) {
    hub.sendToUser(from, 'challenge_result', {
      accepted: false,
      roomId: null,
      gameId: null,
      opponentUsername,
    })
    return
  }

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
  state.rooms.set(room.id, seat)
  state.userRoom.set(from, room.id)
  state.userRoom.set(to, room.id)
  await startGame(seat)
  hub.sendToUsers([from, to], 'challenge_result', {
    accepted: true,
    roomId: Number(room.id),
    gameId: seat.gameId,
    opponentUsername,
  })
}
