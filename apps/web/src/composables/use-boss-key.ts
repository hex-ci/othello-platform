/**
 * BossKey 老板键（T19，F-E-14）。
 * 全局热键（` 反引号）一键将标题/图标切为中性伪装并模糊页面，再按恢复。
 * 不依赖全屏 API。仅在 settings.bossKeyEnabled 为真时响应热键。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings-store'

/** 伪装用的中性 favicon（文档图标，data URI） */
const NEUTRAL_FAVICON
  = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\'%3E%3Crect width=\'64\' height=\'64\' rx=\'8\' fill=\'%234a5568\'/%3E%3Crect x=\'14\' y=\'16\' width=\'36\' height=\'4\' rx=\'2\' fill=\'%23cbd5e0\'/%3E%3Crect x=\'14\' y=\'28\' width=\'36\' height=\'4\' rx=\'2\' fill=\'%23cbd5e0\'/%3E%3Crect x=\'14\' y=\'40\' width=\'24\' height=\'4\' rx=\'2\' fill=\'%23cbd5e0\'/%3E%3C/svg%3E'

const HOTKEY = '`'

export function useBossKey() {
  const { t } = useI18n()
  const settings = useSettingsStore()
  const active = ref(false)

  let originalTitle = ''
  let originalFavicon = ''

  function applyDisguise(): void {
    originalTitle = document.title
    const link = document.querySelector<HTMLLinkElement>('link[rel~=\'icon\']')
    originalFavicon = link?.href ?? ''
    document.title = t('bossKey.title')
    if (link) link.href = NEUTRAL_FAVICON
    active.value = true
  }

  function restore(): void {
    document.title = originalTitle || 'Othello'
    const link = document.querySelector<HTMLLinkElement>('link[rel~=\'icon\']')
    if (link && originalFavicon) link.href = originalFavicon
    active.value = false
  }

  function toggle(): void {
    if (active.value) restore()
    else applyDisguise()
  }

  function onKeydown(e: KeyboardEvent): void {
    if (!settings.bossKeyEnabled) return
    // 输入框内忽略，避免与正常输入冲突
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return
    }
    if (e.key === HOTKEY) {
      e.preventDefault()
      toggle()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
    if (active.value) restore()
  })

  return { active, toggle }
}
