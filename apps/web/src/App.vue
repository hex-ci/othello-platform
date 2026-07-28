<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { Toaster } from 'vue-sonner'
import 'vue-sonner/style.css'
import { useSettingsStore } from '@/stores/settings-store'
import { useBossKey } from '@/composables/use-boss-key'
import { useChallenge } from '@/composables/useChallenge'
import BossKeyOverlay from '@/components/BossKeyOverlay.vue'

// 初始化偏好（应用到 <html> data-attr）+ BossKey 全局热键
useSettingsStore()

const { active, toggle } = useBossKey()

// 全局绑定好友挑战 WS 事件（幂等，只绑一次）。
// incomingChallenge/challengingId 为模块级单例 ref，任何页面都能收到挑战，
// 不再要求对方停在好友页（F-E-16：对方在大厅/对局页也能收到挑战横幅）。
// 未来消息提醒中心统一后可移除此处，改为中心监听。
const { bindChallenge } = useChallenge()

onMounted(() => {
  bindChallenge()
})
</script>

<template>
  <RouterView />
  <BossKeyOverlay :active="active" @restore="toggle" />
  <!-- 全局 Toast（vue-sonner）：暗色玻璃风（样式在 global.css 自定义对齐游戏配色），顶部居中 -->
  <Toaster
    position="top-center"
    theme="dark"
    close-button
    close-button-position="top-right"
    :duration="4000"
  />
</template>
