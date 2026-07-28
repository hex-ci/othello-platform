-- 005: 聊天表
CREATE TABLE IF NOT EXISTS chats (
  id         BIGSERIAL PRIMARY KEY,
  room_id    BIGINT REFERENCES rooms(id),
  game_id    BIGINT REFERENCES games(id),
  user_id    BIGINT REFERENCES users(id),
  channel    VARCHAR(16) NOT NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
