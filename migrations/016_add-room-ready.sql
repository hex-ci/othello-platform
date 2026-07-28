-- 016: 房间准备阶段（人人房双方准备 + 房主开局）
-- 对齐 docs/pages/04-room.html；附录C 状态机新增 ready 子阶段
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS black_ready BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS white_ready BOOLEAN NOT NULL DEFAULT false;