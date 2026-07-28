-- 013: 赛季 / 段位快照 / 徽章（T22，F-E-18）
-- seasons: 赛季周期（每月一个）
-- user_season_ratings: 用户在该赛季的 ELO 峰值与段位快照
-- user_badges: 成就徽章（幂等发放）

CREATE TABLE IF NOT EXISTS seasons (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(64) NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      VARCHAR(8) NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status);

CREATE TABLE IF NOT EXISTS user_season_ratings (
  id          BIGSERIAL PRIMARY KEY,
  season_id   INT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peak_elo    INT NOT NULL DEFAULT 1500,
  peak_tier   VARCHAR(16) NOT NULL DEFAULT 'silver',
  final_elo   INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(season_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_season_ratings_season ON user_season_ratings(season_id, peak_elo DESC);

CREATE TABLE IF NOT EXISTS user_badges (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_type  VARCHAR(32) NOT NULL,
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_type)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);

-- 种子：当前赛季（2026 年 7 月）
INSERT INTO seasons (name, start_date, end_date, status)
VALUES ('2026 Season 3', '2026-07-01', '2026-08-01', 'active')
ON CONFLICT DO NOTHING;