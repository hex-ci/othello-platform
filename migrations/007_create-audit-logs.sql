-- 007: 安全审计日志
CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT,
  action     VARCHAR(32) NOT NULL,
  ip         INET,
  meta       JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
