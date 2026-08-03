<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { User, Lock, Play, Zap, Check } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth-store'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { t } = useI18n()

const username = ref('')
const password = ref('')
const remember = ref(false)
const error = ref('')
const loading = ref(false)

// WS/REST 鉴权失败跳转来时，落地提示"登录已失效"
onMounted(() => {
  const msg = sessionStorage.getItem('auth_expired')
  if (msg) {
    sessionStorage.removeItem('auth_expired')
    toast.error(msg)
  }
})

async function onLogin() {
  error.value = ''
  loading.value = true
  try {
    await authStore.login(username.value, password.value, remember.value)
    // 登录后进入大厅；若有守卫回跳目标则优先返回
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/lobby'
    await router.push(redirect)
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : t('login.loginFail')
  }
  finally {
    loading.value = false
  }
}

function goPlayOffline() {
  void router.push('/local')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center relative overflow-hidden">
    <!-- 装饰背景：网格纹理 -->
    <div
      class="absolute inset-0 opacity-[0.04] pointer-events-none"
      :style="{
        backgroundImage:
          'linear-gradient(rgba(26,107,60,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(26,107,60,0.8) 1px, transparent 1px)',
        backgroundSize: '80px 80px',
      }"
    ></div>
    <!-- 漂浮棋子装饰 -->
    <div
      class="absolute top-[10%] left-[8%] w-16 h-16 rounded-full bg-gradient-to-br from-gray-900 to-black shadow-[0_4px_15px_rgba(0,0,0,0.8),inset_0_2px_4px_rgba(255,255,255,0.1)] opacity-20 animate-[float_6s_ease-in-out_infinite] pointer-events-none"
    ></div>
    <div
      class="absolute top-[20%] right-[12%] w-12 h-12 rounded-full bg-gradient-to-br from-white to-gray-200 shadow-[0_4px_15px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.8)] opacity-15 animate-[float_8s_ease-in-out_infinite_1s] pointer-events-none"
    ></div>
    <div
      class="absolute bottom-[15%] left-[15%] w-10 h-10 rounded-full bg-gradient-to-br from-white to-gray-300 shadow-[0_4px_12px_rgba(0,0,0,0.4),inset_0_2px_3px_rgba(255,255,255,0.9)] opacity-10 animate-[float_7s_ease-in-out_infinite_2s] pointer-events-none"
    ></div>
    <div
      class="absolute bottom-[25%] right-[8%] w-14 h-14 rounded-full bg-gradient-to-br from-gray-800 to-black shadow-[0_4px_15px_rgba(0,0,0,0.8),inset_0_2px_4px_rgba(255,255,255,0.05)] opacity-15 animate-[float_9s_ease-in-out_infinite_0.5s] pointer-events-none"
    ></div>
    <!-- 径向光晕 -->
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(26,107,60,0.15)_0%,transparent_70%)] pointer-events-none"
    ></div>

    <div class="relative z-10 w-full max-w-md px-8 py-8">
      <!-- 语言切换 -->
      <div class="flex justify-end mb-4">
        <LanguageSwitcher />
      </div>
      <!-- Logo -->
      <div class="text-center mb-8">
        <div
          class="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-board-green to-[#0d4a28] shadow-[0_8px_32px_rgba(26,107,60,0.3)] mb-5"
        >
          <div class="grid grid-cols-2 gap-1">
            <div
              class="w-5 h-5 rounded-full bg-black shadow-[inset_0_2px_4px_rgba(255,255,255,0.1)]"
            ></div>
            <div class="w-5 h-5 rounded-full bg-white shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1)]"></div>
            <div class="w-5 h-5 rounded-full bg-white shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1)]"></div>
            <div
              class="w-5 h-5 rounded-full bg-black shadow-[inset_0_2px_4px_rgba(255,255,255,0.1)]"
            ></div>
          </div>
        </div>
        <h1 class="text-3xl font-bold tracking-wide">{{ $t('login.title') }}</h1>
        <div class="flex items-center justify-center gap-2 mt-3">
          <span
            class="text-[10px] px-2.5 py-1 rounded-full bg-board-green/15 text-emerald-400 border border-board-green/30"
          >
            {{ $t('login.tagNoInstall') }}
          </span>
          <span
            class="text-[10px] px-2.5 py-1 rounded-full bg-gold/10 text-gold border border-gold/20"
          >
            {{ $t('login.tagRealtime') }}
          </span>
          <span
            class="text-[10px] px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20"
          >
            {{ $t('login.tagAi') }}
          </span>
        </div>
      </div>

      <!-- 马上玩 -->
      <button
        type="button"
        class="w-full py-4 rounded-2xl font-bold text-lg text-[#0f1117] bg-gradient-to-r from-gold to-gold-light mb-5 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 animate-[glow-play_3s_ease-in-out_infinite]"
        @click="goPlayOffline"
      >
        <Play class="w-5 h-5" />{{ $t('login.playOffline') }}
      </button>

      <!-- 登录表单 -->
      <div
        class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
      >
        <form class="space-y-5" @submit.prevent="onLogin">
          <div>
            <label
              for="username"
              class="block text-text-secondary text-xs uppercase tracking-wider mb-2"
            >
              {{ $t('login.username') }}
            </label>
            <div class="relative">
              <User
                class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none"
              />
              <input
                id="username"
                v-model="username"
                type="text"
                :placeholder="$t('login.usernamePlaceholder')"
                class="w-full bg-[rgba(255,255,255,0.03)] border border-glass-border rounded-xl py-3 pl-11 pr-4 text-text-primary placeholder:text-[#4a4f58] focus:outline-none focus:border-gold/50 transition-colors"
                required
              >
            </div>
          </div>
          <div>
            <label
              for="password"
              class="block text-text-secondary text-xs uppercase tracking-wider mb-2"
            >
              {{ $t('login.password') }}
            </label>
            <div class="relative">
              <Lock
                class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none"
              />
              <input
                id="password"
                v-model="password"
                type="password"
                :placeholder="$t('login.passwordPlaceholder')"
                class="w-full bg-[rgba(255,255,255,0.03)] border border-glass-border rounded-xl py-3 pl-11 pr-4 text-text-primary placeholder:text-[#4a4f58] focus:outline-none focus:border-gold/50 transition-colors"
                required
              >
            </div>
          </div>

          <div class="flex items-center justify-between">
            <button
              type="button"
              class="flex items-center gap-2 cursor-pointer group"
              @click="remember = !remember"
            >
              <span
                class="w-4 h-4 rounded border flex items-center justify-center transition-colors"
                :class="
                  remember
                    ? 'bg-gold/20 border-gold/50'
                    : 'border-glass-border bg-[rgba(255,255,255,0.03)]'
                "
              >
                <Check v-if="remember" class="w-2.5 h-2.5 text-gold" />
              </span>
              <span class="text-xs text-text-secondary">{{ $t('login.remember') }}</span>
            </button>
            <a href="#" class="text-xs text-gold/70 hover:text-gold transition-colors">
              {{ $t('login.forgot') }}
            </a>
          </div>

          <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>

          <button
            type="submit"
            :disabled="loading"
            class="w-full py-3.5 rounded-xl font-semibold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50"
          >
            {{ loading ? $t('login.loggingIn') : $t('login.login') }}
          </button>
        </form>

        <div class="flex items-center my-6">
          <div class="flex-1 h-px bg-glass-border"></div>
          <span class="px-4 text-text-secondary text-xs">{{ $t('login.or') }}</span>
          <div class="flex-1 h-px bg-glass-border"></div>
        </div>

        <button
          type="button"
          class="w-full py-3 rounded-xl font-medium text-text-secondary border border-glass-border hover:border-text-secondary/30 hover:text-text-primary transition-all duration-300 flex items-center justify-center gap-2"
          @click="goPlayOffline"
        >
          <Zap class="w-4 h-4" />{{ $t('login.guestQuick') }}
        </button>

        <p class="text-center mt-5 text-text-secondary text-sm">
          {{ $t('login.noAccount') }}
          <RouterLink to="/register" class="text-gold hover:text-gold-light transition-colors">
            {{ $t('login.registerAccount') }}
          </RouterLink>
        </p>
      </div>

      <!-- 版本号 -->
      <div class="flex items-center justify-center gap-3 mt-8">
        <p class="text-[#3a3f48] text-xs tracking-wider">{{ $t('login.version') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes float {
  0%,
  100% {
    transform: translateY(0px) rotate(0deg);
  }
  50% {
    transform: translateY(-10px) rotate(1deg);
  }
}
@keyframes glow-play {
  0%,
  100% {
    box-shadow:
      0 0 24px rgba(212, 168, 67, 0.4),
      0 4px 20px rgba(212, 168, 67, 0.3);
  }
  50% {
    box-shadow:
      0 0 48px rgba(212, 168, 67, 0.7),
      0 8px 40px rgba(212, 168, 67, 0.5);
  }
}
</style>
