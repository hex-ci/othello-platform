import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createInitialBoard,
  legalMoves,
  applyMove,
  isGameOver,
  getResult,
  nextTurn,
  countPieces,
  type Board,
  type Color,
  type Pos,
  type AiLevel,
  type GameResult,
  DEFAULT_AI_LEVEL,
} from '@othello-platform/engine'
import type { AiRequestMessage, AiResponseMessage } from '@/workers/ai-worker'

export interface MoveRecord {
  color: Color
  pos: Pos | null
  flipped: Pos[]
  board: Board
}

let worker: Worker | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('@/workers/ai-worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

function workerThink(board: Board, level: AiLevel, color: Color): Promise<Pos | null> {
  return new Promise((resolve) => {
    const w = getWorker()
    const handler = (event: MessageEvent<AiResponseMessage>) => {
      if (event.data.type === 'result') {
        w.removeEventListener('message', handler)
        resolve(event.data.pos)
      }
    }
    w.addEventListener('message', handler)
    const msg: AiRequestMessage = { type: 'think', board: Array.from(board), level, color }
    w.postMessage(msg)
  })
}

function workerHint(board: Board, color: Color): Promise<Pos | null> {
  return new Promise((resolve) => {
    const w = getWorker()
    const handler = (event: MessageEvent<AiResponseMessage>) => {
      if (event.data.type === 'hint-result') {
        w.removeEventListener('message', handler)
        resolve(event.data.pos)
      }
    }
    w.addEventListener('message', handler)
    const msg: AiRequestMessage = { type: 'hint', board: Array.from(board), color }
    w.postMessage(msg)
  })
}

function workerStop(): void {
  const msg: AiRequestMessage = { type: 'stop' }
  getWorker().postMessage(msg)
}

export const useGameStore = defineStore('game', () => {
  const board = ref<Board>(createInitialBoard())
  const turn = ref<Color>('BLACK')
  const aiLevel = ref<AiLevel>(DEFAULT_AI_LEVEL)
  const moveHistory = ref<MoveRecord[]>([])
  const gameStatus = ref<'playing' | 'finished'>('playing')
  const result = ref<GameResult | null>(null)
  const isThinking = ref(false)
  const hintPos = ref<Pos | null>(null)
  const lastMovePos = ref<Pos | null>(null)

  const legalMovesList = computed(() => {
    if (gameStatus.value !== 'playing') return []
    if (turn.value !== 'BLACK') return []
    return legalMoves(board.value, turn.value)
  })

  const counts = computed(() => countPieces(board.value))

  function isLegalMove(pos: Pos): boolean {
    return legalMovesList.value.some(p => p.x === pos.x && p.y === pos.y)
  }

  function playerMove(pos: Pos): boolean {
    if (gameStatus.value !== 'playing' || turn.value !== 'BLACK') return false
    if (!isLegalMove(pos)) return false

    const moveResult = applyMove(board.value, 'BLACK', pos)
    if (!moveResult) return false

    board.value = moveResult.board
    moveHistory.value.push({
      color: 'BLACK',
      pos,
      flipped: moveResult.flipped,
      board: moveResult.board.slice(),
    })
    lastMovePos.value = pos
    hintPos.value = null

    advanceTurn('BLACK')
    return true
  }

  async function aiMove(): Promise<void> {
    if (gameStatus.value !== 'playing' || turn.value !== 'WHITE') return

    isThinking.value = true
    try {
      const pos = await workerThink(board.value, aiLevel.value, 'WHITE')
      if (!pos) {
        moveHistory.value.push({
          color: 'WHITE',
          pos: null,
          flipped: [],
          board: board.value.slice(),
        })
        advanceTurn('WHITE')
        return
      }

      const moveResult = applyMove(board.value, 'WHITE', pos)
      if (!moveResult) return

      board.value = moveResult.board
      moveHistory.value.push({
        color: 'WHITE',
        pos,
        flipped: moveResult.flipped,
        board: moveResult.board.slice(),
      })
      lastMovePos.value = pos
      advanceTurn('WHITE')
    }
    finally {
      isThinking.value = false
    }
  }

  function advanceTurn(current: Color): void {
    const next = nextTurn(board.value, current)
    if (next === null || isGameOver(board.value)) {
      gameStatus.value = 'finished'
      result.value = getResult(board.value)
      return
    }
    turn.value = next
    if (next === 'WHITE') {
      void aiMove()
    }
  }

  function undoMove(): void {
    if (moveHistory.value.length < 2) return
    if (isThinking.value) {
      workerStop()
      isThinking.value = false
    }
    moveHistory.value.pop()
    moveHistory.value.pop()
    const lastRecord = moveHistory.value[moveHistory.value.length - 1]
    if (lastRecord) {
      board.value = lastRecord.board.slice()
      lastMovePos.value = lastRecord.pos
    }
    else {
      board.value = createInitialBoard()
      lastMovePos.value = null
    }
    turn.value = 'BLACK'
    gameStatus.value = 'playing'
    result.value = null
    hintPos.value = null
  }

  async function showHint(): Promise<void> {
    if (gameStatus.value !== 'playing' || turn.value !== 'BLACK') return
    hintPos.value = await workerHint(board.value, 'BLACK')
  }

  function newGame(level?: AiLevel): void {
    if (isThinking.value) {
      workerStop()
      isThinking.value = false
    }
    if (level !== undefined) aiLevel.value = level
    board.value = createInitialBoard()
    turn.value = 'BLACK'
    moveHistory.value = []
    gameStatus.value = 'playing'
    result.value = null
    hintPos.value = null
    lastMovePos.value = null
  }

  return {
    board,
    turn,
    aiLevel,
    moveHistory,
    gameStatus,
    result,
    isThinking,
    hintPos,
    lastMovePos,
    legalMovesList,
    counts,
    isLegalMove,
    playerMove,
    aiMove,
    undoMove,
    showHint,
    newGame,
  }
})
