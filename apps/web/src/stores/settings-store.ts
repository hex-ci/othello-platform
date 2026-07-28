/**
 * 用户偏好设置（T19，F-E-14）。
 * 高对比/色盲/减动效/BossKey 偏好，持久化到 localStorage，
 * watch 后同步到 <html> data-attr 供 tokens.css 覆盖变量。
 *
 * 主题模式（明/暗）已弃用：游戏仅深色模式，不再提供浅色切换（2026-07-28 决策）。
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'othello.settings'

interface SettingsData {
  highContrast: boolean
  colorblind: boolean
  reduceMotion: boolean
  bossKeyEnabled: boolean
}

const DEFAULTS: SettingsData = {
  highContrast: false,
  colorblind: false,
  reduceMotion: false,
  bossKeyEnabled: true,
}

function load(): SettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SettingsData>) }
  } catch {
    /* ignore corrupt data */
  }
  return { ...DEFAULTS }
}

function applyToDom(s: SettingsData): void {
  const el = document.documentElement
  el.dataset['contrast'] = s.highContrast ? 'high' : 'normal'
  el.dataset['motion'] = s.reduceMotion ? 'reduce' : 'normal'
  el.dataset['colorblind'] = s.colorblind ? 'on' : 'off'
}

export const useSettingsStore = defineStore('settings', () => {
  const initial = load()
  const highContrast = ref(initial.highContrast)
  const colorblind = ref(initial.colorblind)
  const reduceMotion = ref(initial.reduceMotion)
  const bossKeyEnabled = ref(initial.bossKeyEnabled)

  function persist(): void {
    const data: SettingsData = {
      highContrast: highContrast.value,
      colorblind: colorblind.value,
      reduceMotion: reduceMotion.value,
      bossKeyEnabled: bossKeyEnabled.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    applyToDom(data)
  }

  // 初始化立即应用
  applyToDom(initial)

  // 任何偏好变化 → 持久化 + 应用
  watch([highContrast, colorblind, reduceMotion, bossKeyEnabled], persist)

  function resetDefaults(): void {
    highContrast.value = DEFAULTS.highContrast
    colorblind.value = DEFAULTS.colorblind
    reduceMotion.value = DEFAULTS.reduceMotion
    bossKeyEnabled.value = DEFAULTS.bossKeyEnabled
  }

  return {
    highContrast,
    colorblind,
    reduceMotion,
    bossKeyEnabled,
    resetDefaults,
  }
})
