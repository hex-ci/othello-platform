-- 015: refresh token 家族追踪（安全审查 HIGH-2 修复）
-- family_id：同一次登录会话的 token 共享一个 family，轮换时继承
-- 当检测到已吊销 token 被重放时，吊销整个 family（token 复用检测）

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id VARCHAR(36);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);