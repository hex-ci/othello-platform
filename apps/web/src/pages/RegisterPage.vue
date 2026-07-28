<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { User, Mail, Lock, Check, Zap } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth-store'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'

const router = useRouter()
const authStore = useAuthStore()
const { t } = useI18n()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const agreed = ref(false)
const error = ref('')
const loading = ref(false)

const passwordStrength = computed(() => {
  const p = password.value
  let score = 0
  if (p.length >= 8) score++
  if (/[A-Z]/.test(p)) score++
  if (/[0-9]/.test(p)) score++
  if (/[^A-Za-z0-9]/.test(p)) score++
  return score
})

const strengthLabel = computed(() => {
  const labels = [
    '',
    t('register.strengthWeak'),
    t('register.strengthFair'),
    t('register.strengthGood'),
    t('register.strengthStrong'),
  ]
  return labels[passwordStrength.value] ?? ''
})

const strengthColor = computed(() => {
  const colors = ['', 'bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-emerald-500']
  return colors[passwordStrength.value] ?? ''
})

async function onRegister() {
  error.value = ''
  if (password.value !== confirmPassword.value) {
    error.value = t('register.errMismatch')
    return
  }
  if (password.value.length < 8) {
    error.value = t('register.errShort')
    return
  }
  if (!agreed.value) {
    error.value = t('register.errAgree')
    return
  }
  loading.value = true
  try {
    await authStore.register(username.value, password.value, email.value || undefined)
    await router.push('/lobby')
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('register.registerFail')
  } finally {
    loading.value = false
  }
}

function goPlayOffline() {
  void router.push('/local')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center relative overflow-hidden">
    <div
      class="absolute inset-0 opacity-[0.04] pointer-events-none"
      :style="{
        backgroundImage:
          'linear-gradient(rgba(26,107,60,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(26,107,60,0.8) 1px, transparent 1px)',
        backgroundSize: '80px 80px',
      }"
    />
    <!-- 漂浮棋子装饰 -->
    <div
      class="absolute top-[12%] right-[10%] w-16 h-16 rounded-full bg-gradient-to-br from-gray-900 to-black shadow-[0_4px_15px_rgba(0,0,0,0.8),inset_0_2px_4px_rgba(255,255,255,0.1)] opacity-20 animate-[float_7s_ease-in-out_infinite_0.5s] pointer-events-none"
    />
    <div
      class="absolute top-[25%] left-[10%] w-12 h-12 rounded-full bg-gradient-to-br from-white to-gray-200 shadow-[0_4px_15px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.8)] opacity-15 animate-[float_6s_ease-in-out_infinite_1.5s] pointer-events-none"
    />
    <div
      class="absolute bottom-[20%] right-[14%] w-10 h-10 rounded-full bg-gradient-to-br from-white to-gray-300 shadow-[0_4px_12px_rgba(0,0,0,0.4),inset_0_2px_3px_rgba(255,255,255,0.9)] opacity-10 animate-[float_8s_ease-in-out_infinite_2.5s] pointer-events-none"
    />
    <div
      class="absolute bottom-[12%] left-[8%] w-14 h-14 rounded-full bg-gradient-to-br from-gray-800 to-black shadow-[0_4px_15px_rgba(0,0,0,0.8),inset_0_2px_4px_rgba(255,255,255,0.05)] opacity-15 animate-[float_9s_ease-in-out_infinite_3s] pointer-events-none"
    />
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(26,107,60,0.15)_0%,transparent_70%)] pointer-events-none"
    />

    <div class="relative z-10 w-full max-w-md px-6 py-8">
      <!-- 语言切换 -->
      <div class="flex justify-end mb-4">
        <LanguageSwitcher />
      </div>
      <!-- Logo -->
      <div class="text-center mb-6">
        <div
          class="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-board-green to-[#0d4a28] shadow-[0_8px_32px_rgba(26,107,60,0.3)] mb-5"
        >
          <div class="grid grid-cols-2 gap-1">
            <div
              class="w-5 h-5 rounded-full bg-black shadow-[inset_0_2px_4px_rgba(255,255,255,0.1)]"
            />
            <div class="w-5 h-5 rounded-full bg-white shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1)]" />
            <div class="w-5 h-5 rounded-full bg-white shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1)]" />
            <div
              class="w-5 h-5 rounded-full bg-black shadow-[inset_0_2px_4px_rgba(255,255,255,0.1)]"
            />
          </div>
        </div>
        <h1 class="text-2xl font-bold tracking-wide">{{ $t('register.title') }}</h1>
        <p class="text-text-secondary text-sm mt-2">{{ $t('register.subtitle') }}</p>
      </div>

      <div
        class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-7 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
      >
        <form class="space-y-4" @submit.prevent="onRegister">
          <div>
            <label
              for="reg-username"
              class="block text-text-secondary text-xs uppercase tracking-wider mb-2"
              >{{ $t('register.username') }}</label
            >
            <div class="relative">
              <User
                class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none"
              />
              <input
                id="reg-username"
                v-model="username"
                type="text"
                :placeholder="$t('register.usernamePlaceholder')"
                class="w-full bg-[rgba(255,255,255,0.03)] border border-glass-border rounded-xl py-3 pl-11 pr-4 text-text-primary text-sm placeholder:text-[#4a4f58] focus:outline-none focus:border-gold/50 transition-colors"
                required
                minlength="2"
                maxlength="32"
              />
            </div>
          </div>

          <div>
            <label
              for="reg-email"
              class="block text-text-secondary text-xs uppercase tracking-wider mb-2"
              >{{ $t('register.email') }}</label
            >
            <div class="relative">
              <Mail
                class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none"
              />
              <input
                id="reg-email"
                v-model="email"
                type="email"
                :placeholder="$t('register.emailPlaceholder')"
                class="w-full bg-[rgba(255,255,255,0.03)] border border-glass-border rounded-xl py-3 pl-11 pr-4 text-text-primary text-sm placeholder:text-[#4a4f58] focus:outline-none focus:border-gold/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <label
              for="reg-password"
              class="block text-text-secondary text-xs uppercase tracking-wider mb-2"
              >{{ $t('register.setPassword') }}</label
            >
            <div class="relative">
              <Lock
                class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none"
              />
              <input
                id="reg-password"
                v-model="password"
                type="password"
                :placeholder="$t('register.passwordPlaceholder')"
                class="w-full bg-[rgba(255,255,255,0.03)] border border-glass-border rounded-xl py-3 pl-11 pr-4 text-text-primary text-sm placeholder:text-[#4a4f58] focus:outline-none focus:border-gold/50 transition-colors"
                required
                minlength="8"
              />
            </div>
            <div v-if="password" class="mt-2 flex items-center gap-2">
              <div class="flex-1 h-1 rounded-full bg-glass-border overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-300"
                  :class="strengthColor"
                  :style="{ width: `${passwordStrength * 25}%` }"
                />
              </div>
              <span class="text-[10px] text-text-secondary">{{ strengthLabel }}</span>
            </div>
          </div>

          <div>
            <label
              for="reg-confirm"
              class="block text-text-secondary text-xs uppercase tracking-wider mb-2"
              >{{ $t('register.confirmPassword') }}</label
            >
            <div class="relative">
              <Lock
                class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none"
              />
              <input
                id="reg-confirm"
                v-model="confirmPassword"
                type="password"
                :placeholder="$t('register.confirmPlaceholder')"
                class="w-full bg-[rgba(255,255,255,0.03)] border border-glass-border rounded-xl py-3 pl-11 pr-4 text-text-primary text-sm placeholder:text-[#4a4f58] focus:outline-none focus:border-gold/50 transition-colors"
                required
              />
            </div>
          </div>

          <!-- 协议勾选 -->
          <div class="flex items-start gap-3 pt-1">
            <button
              type="button"
              class="w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors"
              :class="
                agreed
                  ? 'bg-gold/20 border-gold/50'
                  : 'border-glass-border bg-[rgba(255,255,255,0.03)]'
              "
              @click="agreed = !agreed"
            >
              <Check v-if="agreed" class="w-2.5 h-2.5 text-gold" />
            </button>
            <span class="text-xs text-text-secondary leading-relaxed">
              {{ $t('register.agreePrefix') }}
              <a href="#" class="text-gold hover:text-gold-light transition-colors">{{
                $t('register.terms')
              }}</a>
              {{ $t('register.and') }}
              <a href="#" class="text-gold hover:text-gold-light transition-colors">{{
                $t('register.privacy')
              }}</a>
            </span>
          </div>

          <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>

          <button
            type="submit"
            :disabled="loading"
            class="w-full py-3.5 rounded-xl font-semibold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all duration-300 hover:-translate-y-0.5 mt-2 disabled:opacity-50"
          >
            {{ loading ? $t('register.registering') : $t('register.register') }}
          </button>

          <p class="text-center text-[10px] text-text-secondary/60">
            {{ $t('register.verifyHint') }}
          </p>
        </form>

        <div class="flex items-center my-5">
          <div class="flex-1 h-px bg-glass-border" />
          <span class="px-4 text-text-secondary text-xs">{{ $t('register.or') }}</span>
          <div class="flex-1 h-px bg-glass-border" />
        </div>

        <button
          class="w-full py-3 rounded-xl font-medium text-text-secondary border border-glass-border hover:border-text-secondary/30 hover:text-text-primary transition-all duration-300 flex items-center justify-center gap-2"
          @click="goPlayOffline"
        >
          <Zap class="w-4 h-4" />{{ $t('register.guestTry') }}
        </button>

        <p class="text-center mt-5 text-text-secondary text-sm">
          {{ $t('register.hasAccount') }}
          <RouterLink to="/login" class="text-gold hover:text-gold-light transition-colors">{{
            $t('register.loginNow')
          }}</RouterLink>
        </p>
      </div>

      <div class="flex items-center justify-center gap-3 mt-6">
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
</style>
