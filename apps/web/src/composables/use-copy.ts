import { ref } from 'vue'

/**
 * 剪贴板复制（带降级）。
 *
 * `navigator.clipboard.writeText` 仅在 secure context（HTTPS 或 localhost）可用，
 * 非 HTTPS 下会抛错。此 composable 优先用 Clipboard API，失败后降级到
 * `document.execCommand('copy')` 的隐藏 textarea 方案，仍失败则返回 false，
 * 由调用方弹出手动复制弹窗，而不是直接报错。
 */
export function useCopy() {
  /** 复制失败时待手动复制的文本 */
  const pendingCopy = ref<string | null>(null)

  async function copyText(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        // 非 secure context 或权限被拒，走降级
      }
    }
    return legacyCopy(text)
  }

  function legacyCopy(text: string): boolean {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    let ok: boolean
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false // execCommand 不支持或失败
    }
    document.body.removeChild(textarea)
    return ok
  }

  /** 复制文本：成功返回 true；失败则记录到 pendingCopy 供弹窗手动复制，返回 false */
  async function copy(text: string): Promise<boolean> {
    const ok = await copyText(text)
    if (!ok) pendingCopy.value = text
    return ok
  }

  function clearPending() {
    pendingCopy.value = null
  }

  return { pendingCopy, copy, clearPending }
}
