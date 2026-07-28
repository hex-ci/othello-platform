import type { FastifyInstance } from 'fastify'
import fastifyJwt from '@fastify/jwt'

const JWT_SECRET = process.env['JWT_SECRET']

export const ACCESS_TTL = process.env['JWT_ACCESS_TTL'] ?? '15m'
export const REFRESH_TTL = process.env['JWT_REFRESH_TTL'] ?? '30d'

export async function registerJwt(app: FastifyInstance): Promise<void> {
  const secret = JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET not configured')
  }
  await app.register(fastifyJwt, {
    secret,
    sign: { expiresIn: ACCESS_TTL },
  })
}

export interface JwtPayload {
  userId: number
  username: string
}
