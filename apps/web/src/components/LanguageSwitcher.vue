<script setup lang="ts">
/**
 * 语言切换器（T18，F-E-12）：zh-CN / en 即时切换并持久化。
 */
import { useI18n } from 'vue-i18n'
import { Languages } from '@lucide/vue'
import { setLocale, type Locale } from '@/i18n'

const { locale } = useI18n()

const OPTIONS: { value: Locale, label: string }[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'EN' },
]

function pick(value: Locale) {
  setLocale(value)
}
</script>

<template>
  <div class="flex items-center gap-1 bg-glass/60 border border-glass-border rounded-full p-1">
    <Languages class="w-3.5 h-3.5 text-text-secondary ml-1.5" />
    <button
      v-for="opt in OPTIONS"
      :key="opt.value"
      type="button"
      class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
      :class="locale === opt.value ? 'bg-gold/20 text-gold' : 'text-text-secondary hover:text-text-primary'"
      @click="pick(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
