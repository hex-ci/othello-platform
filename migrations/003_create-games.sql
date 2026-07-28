-- 003: 对局记录表
CREATE TABLE IF NOT EXISTS games (
  id            BIGSERIAL PRIMARY KEY,
  room_id       BIGINT REFERENCES rooms(id),
  black_id      BIGINT REFERENCES users(id),
  white_id      BIGINT REFERENCES users(id),
  ai_level      SMALLINT,
  ai_color      VARCHAR(8),
  mode          VARCHAR(16) NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'playing',
  result        VARCHAR(8),
  end_reason    VARCHAR(16),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  move_count    INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_id);
CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
