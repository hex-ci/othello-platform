const BASE_URL = '/api/v1'

// 会话失效守卫：access token 过期（401）时只跳转一次，避免轮询并发 401 重复跳转/刷屏。
let unauthorizedRedirecting = false

function handleUnauthorized(): void {
  if (unauthorizedRedirecting) return
  unauthorizedRedirecting = true
  localStorage.removeItem('token')
  localStorage.removeItem('refreshToken')
  if (window.location.pathname === '/login' || window.location.pathname === '/register') return
  // 标记"登录已失效"，login 页落地 toast 提示
  sessionStorage.setItem('auth_expired', '登录已失效，请重新登录')
  const here = window.location.pathname + window.location.search
  window.location.assign(`/login?redirect=${encodeURIComponent(here)}`)
}

/**
 * 单飞 refresh：并发 401 共享同一个 refresh 请求，避免多次刷新导致 refresh token 轮换冲突。
 * 返回新 access token；失败返回 null（调用方跳登录）。
 */
let refreshPromise: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return null
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { token: string; refreshToken: string }
    localStorage.setItem('token', data.token)
    localStorage.setItem('refreshToken', data.refreshToken)
    return data.token
  } catch {
    return null
  }
}

function singleFlightRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  // 仅在有 body 时声明 JSON content-type，避免空 body 触发 FST_ERR_CTP_EMPTY_JSON_BODY
  if (options.body) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (!response.ok) {
    // 鉴权端点自身的 4xx 是业务错误（如密码错误），交由 UI 展示，不触发跳转
    if (response.status === 401 && !path.startsWith('/auth/')) {
      // 尝试 refresh-token 自动续期（F-C-10）
      const newToken = await singleFlightRefresh()
      if (newToken) {
        // 用新 token 重放原请求
        headers['Authorization'] = `Bearer ${newToken}`
        const retry = await fetch(`${BASE_URL}${path}`, { ...options, headers })
        if (retry.ok) {
          return retry.json().catch(() => {
            throw new Error('响应解析失败')
          }) as Promise<T>
        }
        // 重放仍失败 → 走登出流程
      }
      handleUnauthorized()
    }
    const body = await response.json().catch(() => null) as { error?: { code: string; msg: string } } | null
    const msg = body?.error?.msg ?? `请求失败 (${response.status})`
    throw new Error(msg)
  }

  return response.json() as Promise<T>
}