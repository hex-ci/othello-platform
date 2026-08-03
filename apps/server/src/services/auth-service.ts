/**
 * 认证服务（T05 + F-C-10 refresh-token）。
 * refresh token 持久化 SHA-256 哈希，支持吊销、轮换与家族复用检测。
 *
 * 安全审查修复（2026-07-25）：
 * - HIGH-2：family_id 家族追踪，已吊销 token 重放时级联吊销整个 family
 * - HIGH-3：原子化 UPDATE...RETURNING 消除 TOCTOU 竞态
 * - HIGH-1：refresh TTL 从 30d 缩短至 7d（httpOnly cookie 迁移记入路线图）
 */
import type { FastifyInstance } from 'fastify'
import { randomBytes, createHash, randomUUID } from 'node:crypto'
import { pool, query } from '../db/pool.js'
import { createUser, authenticateUser } from './user-service.js'
import { userRowToDTO } from '@othello-platform/shared'
import type { JwtPayload } from '../auth/jwt.js'
import { AppError } from '../middleware/error-handler.js'

/** refresh token 生命周期（秒）：7 天（安全审查建议从 30d 缩短） */
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/** 生成随机 refresh token（32 字节 hex）并持久化哈希，归属指定 family */
async function issueRefreshToken(userId: number, familyId: string): Promise<string> {
  const raw = randomBytes(32).toString('hex')
  const hash = sha256(raw)
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000)
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, family_id) VALUES ($1, $2, $3, $4)`,
    [userId, hash, expiresAt, familyId],
  )
  return raw
}

/** 吊销单个 refresh token（幂等） */
async function revokeRefreshToken(raw: string): Promise<void> {
  const hash = sha256(raw)
  await query(
    `UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1 AND revoked = false`,
    [hash],
  )
}

export function registerAuthService(app: FastifyInstance) {
  return {
    async register(username: string, password: string, email?: string) {
      const { userId, elo, classicScore } = await createUser(username, password, email)
      const token = app.jwt.sign({ userId, username } satisfies JwtPayload)
      return { userId, token, elo, classicScore }
    },

    async login(username: string, password: string, remember: boolean) {
      const user = await authenticateUser(username, password)
      const token = app.jwt.sign({ userId: user.id, username: user.username } satisfies JwtPayload)

      let refreshToken: string | undefined
      if (remember) {
        const familyId = randomUUID()
        refreshToken = await issueRefreshToken(user.id, familyId)
      }

      return { token, refreshToken, user: userRowToDTO(user) }
    },

    /**
     * 刷新 access token（原子轮换 + 家族复用检测）。
     * 1. 原子 UPDATE...RETURNING 认领旧 token（消除 TOCTOU）
     * 2. 若认领失败且 token 存在但已吊销 → 复用攻击，级联吊销 family
     * 3. 认领成功 → 同 family 签发新 refresh token
     */
    async refresh(rawRefreshToken: string): Promise<{ token: string, refreshToken: string }> {
      const hash = sha256(rawRefreshToken)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // 原子认领：只有一个并发请求能成功
        const claimed = await client.query(
          `UPDATE refresh_tokens
           SET revoked = true
           WHERE token_hash = $1 AND revoked = false AND expires_at > now()
           RETURNING user_id, family_id`,
          [hash],
        )

        if (claimed.rowCount === 0) {
          // 认领失败：检查是否为已吊销 token 的重放（复用攻击）
          const reuseCheck = await client.query(
            `SELECT family_id FROM refresh_tokens WHERE token_hash = $1 AND revoked = true`,
            [hash],
          )
          await client.query('ROLLBACK')
          // 家族吊销必须在事务外执行（否则被 ROLLBACK 回滚）
          if (reuseCheck.rowCount && reuseCheck.rowCount > 0) {
            const familyId = reuseCheck.rows[0].family_id as string
            await query(
              `UPDATE refresh_tokens SET revoked = true WHERE family_id = $1 AND revoked = false`,
              [familyId],
            )
            app.log.warn({ familyId }, 'Refresh token reuse detected, revoking entire family')
          }
          throw new AppError('AUTH_REQUIRED', 'refresh token 无效或已过期', 401)
        }

        const userId = Number(claimed.rows[0].user_id)
        const familyId = claimed.rows[0].family_id as string

        // 获取用户名
        const userRes = await client.query('SELECT username FROM users WHERE id = $1', [userId])
        const username = (userRes.rows[0] as { username: string } | undefined)?.username
        if (!username) {
          await client.query('ROLLBACK')
          throw new AppError('AUTH_REQUIRED', '用户不存在', 401)
        }

        // 同 family 签发新 refresh token
        const newRaw = randomBytes(32).toString('hex')
        const newHash = sha256(newRaw)
        const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000)
        await client.query(
          `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, family_id) VALUES ($1, $2, $3, $4)`,
          [userId, newHash, expiresAt, familyId],
        )

        await client.query('COMMIT')

        const token = app.jwt.sign({ userId, username } satisfies JwtPayload)
        return { token, refreshToken: newRaw }
      }
      catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      }
      finally {
        client.release()
      }
    },

    /** 登出：吊销 refresh token */
    async logout(rawRefreshToken?: string): Promise<void> {
      if (rawRefreshToken) {
        await revokeRefreshToken(rawRefreshToken)
      }
    },
  }
}
