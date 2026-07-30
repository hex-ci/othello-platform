<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings-store'

const {
  color,
  isLast,
} = defineProps<{
  color: 'BLACK' | 'WHITE'
  isLast?: boolean
}>()

const settings = useSettingsStore()
/** 色盲友好：用描边 + 中心标记区分黑白，不只靠颜色（T19，F-E-14） */
const colorblind = computed(() => settings.colorblind)
</script>

<template>
  <div class="relative w-10 h-10 max-sm:w-8 max-sm:h-8">
    <!-- 棋子本体 -->
    <div
      class="w-full h-full rounded-full transition-transform duration-300"
      :class="[
        color === 'BLACK'
          ? 'bg-gradient-to-br from-gray-700 via-gray-900 to-black shadow-[0_4px_8px_rgba(0,0,0,0.6),inset_0_2px_4px_rgba(255,255,255,0.1)]'
          : 'bg-gradient-to-br from-white via-gray-100 to-gray-200 shadow-[0_4px_8px_rgba(0,0,0,0.4),inset_0_2px_6px_rgba(255,255,255,0.9)]',
        colorblind && (color === 'BLACK' ? 'ring-2 ring-white/80' : 'ring-2 ring-black/60'),
      ]"
    >
      <!-- 色盲中心标记：黑子空心圈，白子实心点 -->
      <div
        v-if="colorblind"
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        :class="color === 'BLACK' ? 'w-3 h-3 border-2 border-white/70' : 'w-2.5 h-2.5 bg-black/60'"
      ></div>
    </div>
    <!-- 最后落子标记 -->
    <div
      v-if="isLast"
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gold/80 animate-pulse"
    ></div>
  </div>
</template>
