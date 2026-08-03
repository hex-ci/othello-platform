import type { FastifyRequest, FastifyReply } from 'fastify'
import type { JwtPayload } from '../auth/jwt.js'

export async function authGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify()
  }
  catch {
    void reply.status(401).send({
      error: { code: 'AUTH_REQUIRED', msg: '未鉴权或令牌无效' },
    })
  }
}

export function getUserId(request: FastifyRequest): number {
  const payload = request.user as JwtPayload
  // pg BIGINT 经 JWT 传回可能为字符串，统一归一化为 number（与 hub/DB 键一致）
  return Number(payload.userId)
}
