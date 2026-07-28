<script setup lang="ts">
/**
 * 房间列表（T07）：卡片式房间项，点击进入。
 * 样式对齐设计稿 03-lobby；人数/观战/ELO 等未实现字段忽略。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Cpu, Users, Lock } from '@lucide/vue'
import type { RoomDTO } from '@othello-platform/shared'

defineProps<{
  rooms: RoomDTO[]
  loading: boolean
}>()

const emit = defineEmits<{
  join: [room: RoomDTO]
  'join-with-password': [room: RoomDTO]
}>()

const { t } = useI18n()

const STATUS_LABEL = computed<Record<string, string>>(() => ({
  waiting: t('roomList.statusWaiting'),
  playing: t('roomList.statusPlaying'),
  finished: t('roomList.statusFinished'),
}))

const AI_LEVEL_TAG: Record<number, string> = {
  0: 'L0',
  1: 'L1',
  2: 'L2',
  3: 'L3',
  4: 'L4',
  5: 'L5',
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="loading" class="text-text-secondary text-sm text-center py-6">
      {{ $t('common.loading') }}
    </div>
    <div v-else-if="rooms.length === 0" class="text-text-secondary text-sm text-center py-6">
      {{ $t('roomList.noRooms') }}
    </div>

    <div
      v-for="room in rooms"
      :key="room.id"
      class="backdrop-blur-xl bg-glass border border-glass-border rounded-xl p-4 hover:border-gold/30 transition-all duration-300 group"
      :class="room.status === 'finished' ? 'opacity-50' : 'cursor-pointer'"
      @click="
        room.status !== 'finished' &&
        (room.hasPassword ? emit('join-with-password', room) : emit('join', room))
      "
    >
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2 min-w-0">
          <h3 class="font-semibold text-sm truncate">#{{ room.id }} {{ room.name }}</h3>
          <Lock
            v-if="room.hasPassword"
            class="w-3 h-3 text-amber-400/70 shrink-0"
            :title="$t('lobby.passwordRequired')"
          />
          <span
            v-if="room.mode === 'human_vs_ai' && room.aiLevel !== null"
            class="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20 font-medium shrink-0"
          >
            {{ AI_LEVEL_TAG[room.aiLevel] ?? `L${room.aiLevel}` }}
          </span>
        </div>
        <span
          class="text-[10px] px-2 py-0.5 rounded-full shrink-0"
          :class="{
            'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20':
              room.status === 'waiting',
            'bg-amber-500/10 text-amber-400 border border-amber-500/20': room.status === 'playing',
            'bg-white/5 text-text-secondary border border-glass-border': room.status === 'finished',
          }"
        >
          {{ STATUS_LABEL[room.status] ?? room.status }}
        </span>
      </div>
      <div class="flex items-center justify-between text-xs text-text-secondary">
        <div class="flex items-center gap-4">
          <span v-if="room.mode === 'human_vs_ai'" class="flex items-center gap-1 text-blue-400">
            <Cpu class="w-3 h-3" />{{ $t('roomList.humanVsAi') }}
          </span>
          <span v-else class="flex items-center gap-1">
            <Users class="w-3 h-3" />{{ $t('roomList.humanVsHuman') }}
          </span>
        </div>
        <button
          v-if="room.status !== 'finished'"
          class="px-4 py-1.5 rounded-lg text-[11px] font-medium bg-gold/10 text-gold border border-gold/20 group-hover:bg-gold group-hover:text-primary transition-all"
          @click.stop="room.hasPassword ? emit('join-with-password', room) : emit('join', room)"
        >
          {{ $t('roomList.join') }}
        </button>
      </div>
    </div>
  </div>
</template>
