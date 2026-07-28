-- 002: 房间表
CREATE TABLE IF NOT EXISTS rooms (
  id         BIGSERIAL PRIMARY KEY,
  name       VARCHAR(64) NOT NULL,
  owner_id   BIGINT REFERENCES users(id),
  mode       VARCHAR(16) NOT NULL,
  ai_level   SMALLINT,
  password   VARCHAR(255),
  status     VARCHAR(16) NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
