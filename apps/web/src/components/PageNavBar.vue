<script setup lang="ts">
/**
 * 共享页面顶栏（对照设计稿 09/10/12/13 统一顶栏）。
 * 左：Logo（点击回大厅）；中：ELO + 经典积分胶囊；右：设置/登出/用户区。
 */
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Trophy, Star, Home, LayoutDashboard, Settings, LogOut, User } from '@lucide/vue'
import type { UserDTO } from '@othello-platform/shared'
import { useAuthStore } from '@/stores/auth-store'
import * as usersApi from '@/api/users'

const router = useRouter()
const auth = useAuthStore()

const me = ref<UserDTO | null>(null)

onMounted(async () => {
  if (auth.userId === null) return
  try {
    me.value = await usersApi.getUser(auth.userId)
  } catch {
    // 加载失败不阻塞页面渲染
  }
})

function goLobby() {
  void router.push('/lobby')
}

function goHome() {
  void router.push('/')
}

function goSettings() {
  void router.push('/settings')
}

function onLogout() {
  auth.logout()
  void router.push('/login')
}
</script>

<template>
  <nav
    class="fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-xl bg-[rgba(15,17,23,0.85)] border-b border-glass-border"
  >
    <div class="max-w-[1440px] mx-auto h-full px-4 sm:px-8 flex items-center justify-between">
      <!-- 左：Logo -->
      <button
        type="button"
        class="flex items-center gap-3 cursor-pointer"
        :title="$t('common.backToLobby')"
        @click="goLobby"
      >
        <div
          class="w-9 h-9 rounded-lg bg-gradient-to-br from-board-green to-[#0d4a28] flex items-center justify-center"
        >
          <div class="grid grid-cols-2 gap-0.5">
            <div class="w-2.5 h-2.5 rounded-full bg-black"></div>
            <div class="w-2.5 h-2.5 rounded-full bg-white"></div>
            <div class="w-2.5 h-2.5 rounded-full bg-white"></div>
            <div class="w-2.5 h-2.5 rounded-full bg-black"></div>
          </div>
        </div>
        <span class="text-lg font-bold tracking-wide">Othello</span>
      </button>

      <!-- 中：我的评级胶囊 -->
      <div class="hidden md:flex items-center gap-4 flex-1 justify-center">
        <div
          class="flex items-center gap-2 bg-gold/5 border border-gold/20 rounded-full px-3 py-1.5"
        >
          <Trophy class="w-3 h-3 text-gold" />
          <span class="text-[11px] text-gold font-medium">
            {{ $t('common.eloRating', { n: me?.elo ?? '-' }) }}
          </span>
        </div>
        <div
          class="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-full px-3 py-1.5"
        >
          <Star class="w-3 h-3 text-emerald-400" />
          <span class="text-[11px] text-emerald-400 font-medium">
            {{ $t('common.classicScore', { n: me?.classicScore ?? '-' }) }}
          </span>
        </div>
      </div>

      <!-- 右：首页 / 大厅 / 设置 / 登出 / 用户区 -->
      <div class="flex items-center gap-2 sm:gap-5 flex-shrink-0">
        <button
          type="button"
          class="p-2 rounded-lg hover:bg-glass transition-colors"
          :title="$t('common.home')"
          @click="goHome"
        >
          <Home class="w-4 h-4 text-text-secondary" />
        </button>
        <button
          type="button"
          class="p-2 rounded-lg hover:bg-glass transition-colors"
          :title="$t('common.backToLobby')"
          @click="goLobby"
        >
          <LayoutDashboard class="w-4 h-4 text-text-secondary" />
        </button>
        <button
          type="button"
          class="p-2 rounded-lg hover:bg-glass transition-colors"
          :title="$t('common.settings')"
          @click="goSettings"
        >
          <Settings class="w-4 h-4 text-text-secondary" />
        </button>
        <button
          type="button"
          class="p-2 rounded-lg hover:bg-glass transition-colors"
          :title="$t('common.logout')"
          @click="onLogout"
        >
          <LogOut class="w-4 h-4 text-text-secondary" />
        </button>
        <div class="flex items-center gap-3 pl-2 border-l border-glass-border">
          <div
            class="w-8 h-8 rounded-full bg-gradient-to-br from-gold/30 to-gold/10 border border-gold/30 flex items-center justify-center"
          >
            <User class="w-4 h-4 text-gold" />
          </div>
          <div class="hidden sm:block">
            <span class="text-sm font-medium">{{ auth.username }}</span>
            <span v-if="me" class="ml-2 text-xs text-gold bg-gold/10 px-2 py-0.5 rounded-full">
              {{ me.elo }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>
