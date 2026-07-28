-- 017: 房间是否允许观战（房主设置，对齐 docs/pages/04-room.html 观战席）
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS spectatable BOOLEAN NOT NULL DEFAULT true;