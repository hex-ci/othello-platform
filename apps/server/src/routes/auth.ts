import type { FastifyInstance } from 'fastify'
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
} from '@othello-platform/shared'
import { registerAuthService } from '../services/auth-service.js'

/**
 * 端点级限流（T23 §6.2）：登录/注册/找回防爆破。
 * 在全局限流之上，对鉴权敏感端点收紧到每 IP 低频；阈值可经环境变量调。
 * 注意：登录/注册端点本身无 token，keyGenerator 回退 IP（按 IP 限流恰是防爆破所需）。
 */
const AUTH_RATE_LIMIT = {
  rateLimit: {
    max: Number(process.env['AUTH_RATE_LIMIT_MAX'] ?? 10),
    timeWindow: process.env['AUTH_RATE_LIMIT_WINDOW'] ?? '1 minute',
  },
} as const
const RESET_RATE_LIMIT = {
  rateLimit: {
    max: Number(process.env['RESET_RATE_LIMIT_MAX'] ?? 5),
    timeWindow: process.env['RESET_RATE_LIMIT_WINDOW'] ?? '1 minute',
  },
} as const

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const authService = registerAuthService(app)

  app.post('/api/v1/auth/register', { config: AUTH_RATE_LIMIT }, async (request, reply) => {
    const body = RegisterRequestSchema.parse(request.body)
    const result = await authService.register(body.username, body.password, body.email)
    return reply.status(201).send(result)
  })

  app.post('/api/v1/auth/login', { config: AUTH_RATE_LIMIT }, async (request, reply) => {
    const body = LoginRequestSchema.parse(request.body)
    const result = await authService.login(body.username, body.password, body.remember ?? false)
    return reply.status(200).send(result)
  })

  // F-C-10 refresh-token：轮换 + 吊销旧 token
  app.post('/api/v1/auth/refresh', { config: AUTH_RATE_LIMIT }, async (request, reply) => {
    const body = RefreshRequestSchema.parse(request.body)
    const result = await authService.refresh(body.refreshToken)
    return reply.status(200).send(result)
  })

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const body = LogoutRequestSchema.safeParse(request.body ?? {})
    const refreshToken = body.success ? body.data.refreshToken : undefined
    await authService.logout(refreshToken)
    return reply.status(200).send({ ok: true })
  })

  // T23 安全修复 H3：密码重置/邮箱验证尚未接线（无邮件通道）。
  // 半成品 stub 会记录 token 到日志且易被误"补全"成认证绕过，GA 前禁用（501）。
  const NOT_IMPLEMENTED = {
    error: { code: 'VALIDATION_ERROR', msg: '该功能尚未开放' },
  } as const

  app.post('/api/v1/auth/forgot', { config: RESET_RATE_LIMIT }, async (_request, reply) => {
    return reply.status(501).send(NOT_IMPLEMENTED)
  })

  app.post('/api/v1/auth/reset', { config: RESET_RATE_LIMIT }, async (_request, reply) => {
    return reply.status(501).send(NOT_IMPLEMENTED)
  })

  app.get('/api/v1/auth/verify', async (_request, reply) => {
    return reply.status(501).send(NOT_IMPLEMENTED)
  })
}
