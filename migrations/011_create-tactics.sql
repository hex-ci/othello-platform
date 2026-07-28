-- 011: 战术题库 + 每日挑战 + 作答记录（T21，F-E-17）
-- tactics_puzzles: 题目（盘面 + 最佳手 + 解析）
-- daily_challenges: 每日 5 题
-- puzzle_attempts: 用户作答记录

CREATE TABLE IF NOT EXISTS tactics_puzzles (
  id          SERIAL PRIMARY KEY,
  puzzle_no   INT NOT NULL UNIQUE,
  difficulty  VARCHAR(16) NOT NULL DEFAULT 'beginner',
  topic       VARCHAR(32) NOT NULL DEFAULT 'corner',
  turn        VARCHAR(8) NOT NULL DEFAULT 'BLACK',
  board       JSONB NOT NULL,
  best_pos_x  INT NOT NULL,
  best_pos_y  INT NOT NULL,
  solution    VARCHAR(4) NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tactics_puzzles_difficulty ON tactics_puzzles(difficulty);
CREATE INDEX IF NOT EXISTS idx_tactics_puzzles_topic ON tactics_puzzles(topic);

CREATE TABLE IF NOT EXISTS daily_challenges (
  id            SERIAL PRIMARY KEY,
  challenge_date DATE NOT NULL UNIQUE,
  puzzle_ids    INT[] NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS puzzle_attempts (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id   INT NOT NULL REFERENCES tactics_puzzles(id) ON DELETE CASCADE,
  answer_x    INT,
  answer_y    INT,
  correct     BOOLEAN NOT NULL,
  time_ms     INT NOT NULL DEFAULT 0,
  rating      VARCHAR(2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user ON puzzle_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_puzzle ON puzzle_attempts(puzzle_id);