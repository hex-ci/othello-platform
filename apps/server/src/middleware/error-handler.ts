import type { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import type { ErrorCode } from '@othello-platform/shared'

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 400,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      void reply.status(error.statusCode).send({
        error: { code: error.code, msg: error.message },
      })
      return
    }

    if (error.validation) {
      void reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', msg: error.message },
      })
      return
    }

    // Zod schema 校验失败（路由内用 schema.parse(request.body) 抛出的 ZodError）。
    // ZodError 不是 FastifyError 子类，没有 error.validation 标记，会落到此分支。
    // 若不拦截会被下面的兜底吞成 500 "Internal server error"，无法反馈给前端。
    if (error.name === 'ZodError') {
      const issues = (
        error as unknown as { issues?: Array<{ path: (string | number)[], message: string }> }
      ).issues
      const msg = issues?.length
        ? issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
        : error.message
      void reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', msg },
      })
      return
    }

    // @fastify/rate-limit 等插件抛带 statusCode 的 FastifyError（如 429）
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      const code: ErrorCode = error.statusCode === 429 ? 'RATE_LIMITED' : 'VALIDATION_ERROR'
      void reply.status(error.statusCode).send({
        error: { code, msg: error.message },
      })
      return
    }

    app.log.error(error)
    void reply.status(500).send({
      error: { code: 'INTERNAL', msg: 'Internal server error' },
    })
  })
}
