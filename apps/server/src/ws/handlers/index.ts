/**
 * WS handler 注册入口：把各 type 的 handler 挂到 router（附录 C §C.3）。
 */
import type { WsRouter } from '../router.js'
import { authHandler } from './auth-handler.js'
import { pingHandler } from './ping-handler.js'
import {
  roomJoinHandler,
  roomReadyHandler,
  roomStartHandler,
  roomSpectateJoinHandler,
  roomSpectateLeaveHandler,
  roomUpdateSettingsHandler,
} from './room-handler.js'
import { moveHandler } from './move-handler.js'
import { drawRequestHandler, drawResponseHandler, resignHandler } from './game-control-handler.js'
import { chatHandler } from './chat-handler.js'
import { matchJoinHandler, matchLeaveHandler } from './matchmaking-handler.js'
import { reconnectHandler } from './reconnect-handler.js'
import { spectateJoinHandler, spectateLeaveHandler } from './spectate-handler.js'
import { hintHandler } from './hint-handler.js'
import { undoHandler } from './undo-handler.js'
import {
  rematchRequestHandler,
  rematchResponseHandler,
  rematchLeaveHandler,
  challengeHandler,
  challengeResponseHandler,
} from './rematch-handler.js'

export function registerWsHandlers(router: WsRouter): void {
  router
    .on('auth', authHandler)
    .on('ping', pingHandler)
    .on('room_join', roomJoinHandler)
    .on('room_ready', roomReadyHandler)
    .on('room_start', roomStartHandler)
    .on('room_spectate_join', roomSpectateJoinHandler)
    .on('room_spectate_leave', roomSpectateLeaveHandler)
    .on('room_update_settings', roomUpdateSettingsHandler)
    .on('move', moveHandler)
    .on('draw_request', drawRequestHandler)
    .on('draw_response', drawResponseHandler)
    .on('resign', resignHandler)
    .on('chat', chatHandler)
    .on('match_join', matchJoinHandler)
    .on('match_leave', matchLeaveHandler)
    .on('reconnect', reconnectHandler)
    .on('spectate_join', spectateJoinHandler)
    .on('spectate_leave', spectateLeaveHandler)
    .on('hint', hintHandler)
    .on('undo', undoHandler)
    .on('rematch_request', rematchRequestHandler)
    .on('rematch_response', rematchResponseHandler)
    .on('rematch_leave', rematchLeaveHandler)
    .on('challenge', challengeHandler)
    .on('challenge_response', challengeResponseHandler)
}
