-- 008: 添加分享令牌字段（T15 复盘分享链接）
ALTER TABLE games ADD COLUMN IF NOT EXISTS share_token VARCHAR(16) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_games_share_token ON games(share_token);
