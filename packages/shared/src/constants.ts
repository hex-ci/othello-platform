/**
 * 统一错误码表（附录 C §C.2）。
 */

export const ERROR_CODES = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  ILLEGAL_MOVE: 'ILLEGAL_MOVE',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FINISHED: 'ROOM_FINISHED',
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export interface ErrorPayload {
  code: ErrorCode
  msg: string
}

/** REST 错误响应 */
export interface RestErrorResponse {
  error: ErrorPayload
}

/** WS 错误消息 */
export interface WsErrorMessage {
  type: 'error'
  payload: ErrorPayload
  ts: number
}
