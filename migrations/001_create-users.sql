-- 001: 用户表
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  username      VARCHAR(32)  NOT NULL UNIQUE,
  email         VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  elo           INT NOT NULL DEFAULT 1500,
  classic_score INT NOT NULL DEFAULT 50,
  wins          INT NOT NULL DEFAULT 0,
  losses        INT NOT NULL DEFAULT 0,
  draws         INT NOT NULL DEFAULT 0,
  games_played  INT NOT NULL DEFAULT 0,
  status        SMALLINT NOT NULL DEFAULT 1,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
