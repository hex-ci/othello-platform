import pg from 'pg'

const { Pool } = pg

const DATABASE_URL = process.env['DATABASE_URL']

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL not configured')
}

// 根因修复：pg 默认把 BIGINT (OID 20 / INT8) 返回为字符串，导致 BIGSERIAL 主键沿
// DB → JWT → WS hub Map<number> 传播时键类型不匹配（Map.get(123) 查不到键 "123"）。
// 项目所有 id 均为自增 BIGSERIAL，实际值远小于 Number.MAX_SAFE_INTEGER (2^53)，
// 在此全局注册 int8 → number 解析，从源头消除 string/number 不一致。
// 护栏：超 2^53 运行时显式报错，避免静默精度损失。
// 详见 CLAUDE.md「pg BIGINT-as-string 根因修复」。
pg.types.setTypeParser(pg.types.builtins.INT8, (val: string) => {
  const n = Number(val)
  if (!Number.isSafeInteger(n)) {
    throw new Error(
      `BIGINT 值 ${val} 超过 Number.MAX_SAFE_INTEGER，精度损失。`
      + `若预期会出现超大 id，需改用 bigint 全链路或改回 string。`,
    )
  }
  return n
})

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
})

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params)
}
