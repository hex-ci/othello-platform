/**
 * AI Web Worker：在后台线程运行 NegaScout 搜索，不阻塞 UI。
 * 消息协议：
 *   主线程 → Worker: { type: 'think', board: number[], level: AiLevel, color: Color }
 *                    | { type: 'hint', board: number[], color: Color }
 *                    | { type: 'stop' }
 *   Worker → 主线程: { type: 'result', pos: Pos | null }
 *                    | { type: 'hint-result', pos: Pos | null }
 */
import {
  think,
  stop,
  hint,
  type AiLevel,
  type Color,
  type Pos,
} from '@othello-platform/engine'

export interface AiThinkMessage {
  type: 'think'
  board: number[]
  level: AiLevel
  color: Color
}

export interface AiHintMessage {
  type: 'hint'
  board: number[]
  color: Color
}

export interface AiStopMessage {
  type: 'stop'
}

export type AiRequestMessage = AiThinkMessage | AiHintMessage | AiStopMessage

export interface AiResultMessage {
  type: 'result'
  pos: Pos | null
}

export interface AiHintResultMessage {
  type: 'hint-result'
  pos: Pos | null
}

export type AiResponseMessage = AiResultMessage | AiHintResultMessage

self.onmessage = async (event: MessageEvent<AiRequestMessage>) => {
  const msg = event.data

  switch (msg.type) {
    case 'think': {
      const board = new Uint8Array(msg.board)
      const pos = await think(board, msg.level, msg.color)
      const response: AiResultMessage = { type: 'result', pos }
      self.postMessage(response)
      break
    }
    case 'hint': {
      const board = new Uint8Array(msg.board)
      const pos = hint(board, msg.color)
      const response: AiHintResultMessage = { type: 'hint-result', pos }
      self.postMessage(response)
      break
    }
    case 'stop': {
      stop()
      break
    }
  }
}
