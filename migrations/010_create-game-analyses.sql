-- 010: AI 复盘分析缓存表（T20，F-E-09 增强）
-- 缓存对局逐手分析结果，避免重复 NegaScout 搜索

CREATE TABLE IF NOT EXISTS game_analyses (
  game_id    INT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  analysis   JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);