<script setup lang="ts">
/**
 * 展示型棋盘（props 驱动）。
 * 供在线对局/观战复用：board 与合法手由父级（服务端权威状态）传入，
 * readonly 时不可落子（非己方回合/观战）。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { T_BLACK, T_WHITE, type Pos, type Board } from '@othello-platform/engine'
import Piece from './Piece.vue'

const { t } = useI18n()

/** 格子按钮引用（按 y*8+x 索引），供方向键 roving 焦点（T19 全键盘） */
const cellRefs = ref<(HTMLButtonElement | null)[]>([])
function setCellRef(idx: number) {
  return (el: unknown) => {
    cellRefs.value[idx] = el instanceof HTMLButtonElement ? el : null
  }
}

function onCellKeydown(e: KeyboardEvent, x: number, y: number) {
  let nx = x
  let ny = y
  if (e.key === 'ArrowUp') ny = Math.max(0, y - 1)
  else if (e.key === 'ArrowDown') ny = Math.min(7, y + 1)
  else if (e.key === 'ArrowLeft') nx = Math.max(0, x - 1)
  else if (e.key === 'ArrowRight') nx = Math.min(7, x + 1)
  else return
  e.preventDefault()
  cellRefs.value[ny * 8 + nx]?.focus()
}

const props = defineProps<{
  board: Board
  legalMoves: Pos[]
  lastMovePos: Pos | null
  hintPos?: Pos | null
  readonly: boolean
}>()

const emit = defineEmits<{ move: [pos: Pos] }>()

const cells = computed(() => {
  const result: { x: number, y: number, cell: number, isLegal: boolean, isLast: boolean, isHint: boolean }[] = []
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const cell = props.board[y * 8 + x] ?? 0
      result.push({
        x,
        y,
        cell,
        isLegal: !props.readonly && props.legalMoves.some(p => p.x === x && p.y === y),
        isLast: props.lastMovePos?.x === x && props.lastMovePos?.y === y,
        isHint: props.hintPos?.x === x && props.hintPos?.y === y,
      })
    }
  }
  return result
})

function onCellClick(x: number, y: number) {
  if (props.readonly) return
  emit('move', { x, y })
}

const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function ariaLabel(x: number, y: number, cell: number): string {
  const col = COL_LABELS[x] ?? ''
  const row = y + 1
  const piece = cell === T_BLACK ? t('board.blackPiece') : cell === T_WHITE ? t('board.whitePiece') : ''
  return `${col}${row}${piece}`
}
</script>

<template>
  <div class="inline-block">
    <div class="grid grid-cols-8 mb-1 pl-5">
      <div v-for="label in COL_LABELS" :key="label" class="text-center text-[10px] text-text-secondary font-mono">
        {{ label }}
      </div>
    </div>

    <div class="flex">
      <div class="flex flex-col mr-1">
        <div
          v-for="n in 8"
          :key="n"
          class="w-4 h-[52px] max-sm:h-[40px] flex items-center justify-center text-[10px] text-text-secondary font-mono"
        >
          {{ n }}
        </div>
      </div>

      <div
        class="grid grid-cols-8 border-2 border-board-dark rounded-lg overflow-hidden shadow-[0_0_60px_rgba(26,107,60,0.2),0_20px_60px_rgba(0,0,0,0.5)]"
        role="grid"
        :aria-label="$t('board.gridLabel')"
      >
        <button
          v-for="cell in cells"
          type="button"
          :key="`${cell.x}-${cell.y}`"
          :ref="setCellRef(cell.y * 8 + cell.x)"
          class="w-[52px] h-[52px] max-sm:w-[40px] max-sm:h-[40px] bg-board-green border border-board-dark flex items-center justify-center transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-gold/50 focus:ring-inset"
          :class="{
            'hover:bg-[#1f8045] cursor-pointer': cell.isLegal,
            'cursor-default': !cell.isLegal,
            'ring-2 ring-gold ring-inset animate-pulse': cell.isHint,
          }"
          :aria-label="ariaLabel(cell.x, cell.y, cell.cell)"
          role="gridcell"
          :tabindex="cell.isLegal ? 0 : -1"
          @click="onCellClick(cell.x, cell.y)"
          @keydown.enter="onCellClick(cell.x, cell.y)"
          @keydown="onCellKeydown($event, cell.x, cell.y)"
        >
          <Piece
            v-if="cell.cell === T_BLACK || cell.cell === T_WHITE"
            :color="cell.cell === T_BLACK ? 'BLACK' : 'WHITE'"
            :is-last="cell.isLast"
          />
          <div
            v-else-if="cell.isLegal"
            class="w-3 h-3 rounded-full bg-board-green/60 border border-[rgba(255,255,255,0.15)] transition-all duration-200"
          ></div>
        </button>
      </div>
    </div>
  </div>
</template>
