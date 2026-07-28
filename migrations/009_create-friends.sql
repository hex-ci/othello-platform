-- 009: 好友/屏蔽关系表（T16，F-E-07/08）
-- status: pending(待接受) / accepted(好友) / blocked(屏蔽)
-- 单向存储：user_id 发起 → friend_id；屏蔽亦为 user_id 屏蔽 friend_id
CREATE TABLE IF NOT EXISTS friends (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id),
  friend_id  BIGINT NOT NULL REFERENCES users(id),
  status     VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_friends_status ON friends(status);
