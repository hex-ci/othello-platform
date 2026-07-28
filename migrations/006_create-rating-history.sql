-- 006: 评级变更历史
CREATE TABLE IF NOT EXISTS rating_history (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id),
  game_id    BIGINT REFERENCES games(id),
  kind       VARCHAR(8) NOT NULL,
  old_value  INT NOT NULL,
  new_value  INT NOT NULL,
  delta      INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
