/**
 * i18n 框架（T18，F-E-12）。
 * Composition API 模式（legacy:false）；语言偏好持久化到 localStorage；
 * 缺失 key 回退默认语 zh-CN（missingWarn 关闭，避免开发期刷屏）。
 */
import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.yaml'
import en from './locales/en.yaml'

export const LOCALE_STORAGE_KEY = 'othello.locale'
export const DEFAULT_LOCALE = 'zh-CN'
export const SUPPORTED_LOCALES = ['zh-CN', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

function resolveInitialLocale(): Locale {
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (saved && (SUPPORTED_LOCALES as readonly string[]).includes(saved)) {
    return saved as Locale
  }
  return DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    'zh-CN': zhCN,
    en,
  },
})

/** 切换语言并持久化 */
export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  document.documentElement.lang = locale
}

// 初始化 <html lang>
document.documentElement.lang = i18n.global.locale.value
