import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserDTO } from '@othello-platform/shared'
import * as authApi from '@/api/auth'

/** 从 JWT 解析 payload（不校验签名，仅读取 userId/username） */
function decodeJwt(token: string | null): { userId: number, username: string } | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    // atob 把 base64 解成 Latin-1 二进制串，含中文等非 ASCII 字符的 UTF-8 多字节
    // 会被逐字节误读为 Latin-1 导致乱码。先转字节数组再用 TextDecoder 按 UTF-8 解码。
    const binary = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const json = new TextDecoder('utf-8').decode(bytes)
    return JSON.parse(json) as { userId: number, username: string }
  }
  catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserDTO | null>(null)
  const token = ref<string | null>(localStorage.getItem('token'))

  const isAuthenticated = computed(() => token.value !== null)
  const userId = computed(() => decodeJwt(token.value)?.userId ?? null)
  const username = computed(() => decodeJwt(token.value)?.username ?? null)

  async function login(username: string, password: string, remember = false) {
    const result = await authApi.login(username, password, remember)
    token.value = result.token
    user.value = result.user
    localStorage.setItem('token', result.token)
    if (result.refreshToken) {
      localStorage.setItem('refreshToken', result.refreshToken)
    }
  }

  async function register(username: string, password: string, email?: string) {
    const result = await authApi.register(username, password, email)
    token.value = result.token
    localStorage.setItem('token', result.token)
  }

  function logout() {
    const refreshToken = localStorage.getItem('refreshToken') ?? undefined
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    void authApi.logout(refreshToken).catch(() => {})
  }

  return { user, token, isAuthenticated, userId, username, login, register, logout }
})
