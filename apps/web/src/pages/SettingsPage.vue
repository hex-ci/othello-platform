<script setup lang="ts">
/**
 * 设置页（T19，F-E-14），对照设计稿 14-settings。
 * 仅保留 PRD 已列且已实现的功能：
 *  - 无障碍（高对比·色盲·减动效·键盘提示）— F-E-14
 *  - 隐私安全（BossKey）— F-E-14
 * 主题模式（明/暗）已弃用：游戏仅深色模式，外观区段移除（2026-07-28 决策）。
 * PRD 已列但未实现的（F-C-14 难度/离线/服务器地址/声音/刷新间隔）及 PRD 未列的
 * （棋盘配色/棋子风格/修改昵称/上传头像/修改密码/注销账号/邮箱验证/战绩统计等）
 * 暂不呈现 UI，待 PRD 补充具体内容并实现后再定夺。偏好实时持久化。
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { X, Accessibility, Shield, Keyboard, Settings, Save } from '@lucide/vue'
import { useSettingsStore } from '@/stores/settings-store'

const router = useRouter()
const settings = useSettingsStore()
const {
  highContrast,
  colorblind,
  reduceMotion,
  bossKeyEnabled,
} = storeToRefs(settings)
const { t } = useI18n()

const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string) {
  toast.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 2000)
}

function onSave() {
  showToast(t('settings.saved'))
}

function onReset() {
  settings.resetDefaults()
  showToast(t('settings.resetDone'))
}

function close() {
  void router.back()
}
</script>

<template>
  <div class="min-h-screen bg-primary text-text-primary">
    <div class="w-full max-w-2xl mx-auto px-6 py-12">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl bg-gradient-to-br from-board-green to-[#0d4a28] flex items-center justify-center shadow-md"
          >
            <Settings class="w-5 h-5 text-emerald-200" />
          </div>
          <div>
            <h1 class="text-xl font-bold">{{ $t('settings.title') }}</h1>
            <p class="text-xs text-text-secondary">{{ $t('settings.subtitle') }}</p>
          </div>
        </div>
        <button
          type="button"
          class="p-2 rounded-lg hover:bg-glass border border-glass-border transition-colors"
          :aria-label="$t('common.backToLobby')"
          @click="close"
        >
          <X class="w-5 h-5 text-text-secondary" />
        </button>
      </div>

      <div class="space-y-6">
        <!-- Section: Accessibility（F-E-14 无障碍） -->
        <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-6">
          <div class="flex items-center gap-2 mb-5">
            <Accessibility class="w-4 h-4 text-gold" />
            <h2 class="text-sm font-semibold uppercase tracking-wider">
              {{ $t('settings.accessibility') }}
            </h2>
          </div>
          <div class="space-y-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">{{ $t('settings.highContrast') }}</p>
                <p class="text-xs text-text-secondary mt-0.5">
                  {{ $t('settings.highContrastHint') }}
                </p>
              </div>
              <button
                role="switch"
                :aria-checked="highContrast"
                class="w-11 h-6 rounded-full p-0.5 cursor-pointer transition-colors"
                :class="highContrast ? 'bg-board-green' : 'bg-[rgba(255,255,255,0.08)]'"
                @click="highContrast = !highContrast"
              >
                <div
                  class="w-5 h-5 rounded-full shadow-md transition-transform"
                  :class="highContrast ? 'bg-white translate-x-5' : 'bg-white/60'"
                ></div>
              </button>
            </div>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">{{ $t('settings.colorblind') }}</p>
                <p class="text-xs text-text-secondary mt-0.5">
                  {{ $t('settings.colorblindHint') }}
                </p>
              </div>
              <button
                role="switch"
                :aria-checked="colorblind"
                class="w-11 h-6 rounded-full p-0.5 cursor-pointer transition-colors"
                :class="colorblind ? 'bg-board-green' : 'bg-[rgba(255,255,255,0.08)]'"
                @click="colorblind = !colorblind"
              >
                <div
                  class="w-5 h-5 rounded-full shadow-md transition-transform"
                  :class="colorblind ? 'bg-white translate-x-5' : 'bg-white/60'"
                ></div>
              </button>
            </div>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">{{ $t('settings.reduceMotion') }}</p>
                <p class="text-xs text-text-secondary mt-0.5">
                  {{ $t('settings.reduceMotionHint') }}
                </p>
              </div>
              <button
                role="switch"
                :aria-checked="reduceMotion"
                class="w-11 h-6 rounded-full p-0.5 cursor-pointer transition-colors"
                :class="reduceMotion ? 'bg-board-green' : 'bg-[rgba(255,255,255,0.08)]'"
                @click="reduceMotion = !reduceMotion"
              >
                <div
                  class="w-5 h-5 rounded-full shadow-md transition-transform"
                  :class="reduceMotion ? 'bg-white translate-x-5' : 'bg-white/60'"
                ></div>
              </button>
            </div>
            <div
              class="bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-lg px-4 py-3"
            >
              <div class="flex items-center gap-2 mb-1.5">
                <Keyboard class="w-3.5 h-3.5 text-text-secondary" />
                <span class="text-xs font-medium text-text-primary">
                  {{ $t('settings.keyboardTitle') }}
                </span>
              </div>
              <p class="text-[10px] text-text-secondary leading-relaxed">
                {{ $t('settings.keyboardHint') }}
              </p>
            </div>
          </div>
        </div>

        <!-- Section: Privacy & Security（F-E-14 BossKey） -->
        <div class="backdrop-blur-xl bg-glass border border-glass-border rounded-2xl p-6">
          <div class="flex items-center gap-2 mb-5">
            <Shield class="w-4 h-4 text-gold" />
            <h2 class="text-sm font-semibold uppercase tracking-wider">
              {{ $t('settings.privacy') }}
            </h2>
          </div>
          <div class="space-y-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">{{ $t('settings.bossKey') }}</p>
                <p class="text-xs text-text-secondary mt-0.5">{{ $t('settings.bossKeyHint') }}</p>
              </div>
              <button
                role="switch"
                :aria-checked="bossKeyEnabled"
                class="w-11 h-6 rounded-full p-0.5 cursor-pointer transition-colors"
                :class="bossKeyEnabled ? 'bg-board-green' : 'bg-[rgba(255,255,255,0.08)]'"
                @click="bossKeyEnabled = !bossKeyEnabled"
              >
                <div
                  class="w-5 h-5 rounded-full shadow-md transition-transform"
                  :class="bossKeyEnabled ? 'bg-white translate-x-5' : 'bg-white/60'"
                ></div>
              </button>
            </div>
            <p
              class="text-[10px] text-text-secondary bg-[rgba(255,255,255,0.02)] border border-glass-border rounded-lg px-3 py-2"
            >
              {{ $t('settings.bossKeyHotkey') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Bottom actions -->
      <div class="flex gap-3 mt-8">
        <button
          type="button"
          class="flex-1 py-3.5 rounded-xl font-semibold text-[#0f1117] bg-gradient-to-r from-gold to-gold-light shadow-[0_4px_20px_rgba(212,168,67,0.3)] hover:shadow-[0_6px_30px_rgba(212,168,67,0.5)] transition-all duration-300 hover:-translate-y-0.5 flex items-center justify-center gap-2"
          @click="onSave"
        >
          <Save class="w-4 h-4" />{{ $t('settings.save') }}
        </button>
        <button
          type="button"
          class="px-6 py-3.5 rounded-xl font-medium text-text-secondary border border-glass-border hover:border-text-secondary/30 hover:text-text-primary transition-all duration-300"
          @click="onReset"
        >
          {{ $t('settings.reset') }}
        </button>
      </div>
    </div>

    <!-- Toast -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="toast"
          class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-5 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm backdrop-blur-xl"
        >
          {{ toast }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
