/**
 * 简易 SQL 迁移运行器。
 * 用法：tsx src/db/migrate.ts up|down
 * 按文件名排序执行 migrations/ 下的 .sql 文件。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import pg from 'pg'

const { Pool } = pg

const DATABASE_URL = process.env['DATABASE_URL']
if (!DATABASE_URL) {
  console.error('DATABASE_URL not configured')
  process.exit(1)
}

// 根因修复：与 pool.ts 一致，全局注册 BIGINT (INT8) → number 解析。
// 迁移脚本读取 _migrations 表的 id (BIGSERIAL) 也走此 parser。
pg.types.setTypeParser(pg.types.builtins.INT8, (val: string) => {
  const n = Number(val)
  if (!Number.isSafeInteger(n)) {
    throw new Error(
      `BIGINT 值 ${val} 超过 Number.MAX_SAFE_INTEGER，精度损失。` +
        `若预期会出现超大 id，需改用 bigint 全链路或改回 string。`,
    )
  }
  return n
})

const pool = new Pool({ connectionString: DATABASE_URL })
const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../../../migrations')

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

async function getApplied(): Promise<Set<string>> {
  const result = await pool.query('SELECT name FROM _migrations ORDER BY id')
  return new Set(result.rows.map((r: { name: string }) => r.name))
}

async function up(): Promise<void> {
  await ensureMigrationsTable()
  const applied = await getApplied()
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip: ${file}`)
      continue
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8')
    console.log(`apply: ${file}`)
    await pool.query(sql)
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file])
  }
  console.log('migrations up: done')
}

async function down(): Promise<void> {
  await ensureMigrationsTable()
  const applied = await getApplied()
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()

  for (const file of files) {
    if (!applied.has(file)) continue
    // 简单回滚：DROP TABLE（从表名推断）
    const tableName = file
      .replace(/^\d+_create-/, '')
      .replace('.sql', '')
      .replace(/-/g, '_')
    console.log(`rollback: ${file} (DROP TABLE ${tableName})`)
    await pool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`)
    await pool.query('DELETE FROM _migrations WHERE name = $1', [file])
  }
  console.log('migrations down: done')
}

const command = process.argv[2]
try {
  if (command === 'up') await up()
  else if (command === 'down') await down()
  else {
    console.error('Usage: tsx src/db/migrate.ts up|down')
    process.exit(1)
  }
} catch (err) {
  console.error('Migration failed:', err)
  process.exit(1)
} finally {
  await pool.end()
}
