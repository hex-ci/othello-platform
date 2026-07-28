-- 004: 走子历史表（冻结，支撑复盘/观战/重连）
CREATE TABLE IF NOT EXISTS moves (
  id              BIGSERIAL PRIMARY KEY,
  game_id         BIGINT NOT NULL REFERENCES games(id),
  seq             INT NOT NULL,
  color           VARCHAR(8) NOT NULL,
  pos_x           SMALLINT,
  pos_y           SMALLINT,
  is_pass         BOOLEAN NOT NULL DEFAULT false,
  flipped         JSONB NOT NULL DEFAULT '[]',
  board_snapshot  JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_moves_game_seq ON moves(game_id, seq);
