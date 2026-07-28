import { apiFetch } from './client'
import type { UserDTO } from '@othello-platform/shared'

interface RegisterResponse {
  userId: number
  token: string
  elo: number
  classicScore: number
}

interface LoginResponse {
  token: string
  refreshToken?: string
  user: UserDTO
}

export async function register(username: string, password: string, email?: string) {
  return apiFetch<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, email }),
  })
}

export async function login(username: string, password: string, remember = false) {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, remember }),
  })
}

export async function logout(refreshToken?: string) {
  return apiFetch<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
  })
}
