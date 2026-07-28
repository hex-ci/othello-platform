-- 012: 战术题库种子数据（T21，F-E-17）
-- 10 道题，覆盖角点/X位/边线/残局/翻子/少子六个专题
-- 盘面 board 为长度 64 的数组：0=空, 1=黑, 2=白（T_NONE/T_BLACK/T_WHITE）
-- 索引 = y * 8 + x

-- 题目 1：角点争夺（入门）
-- 黑先，最佳手 a1（占角）
INSERT INTO tactics_puzzles (puzzle_no, difficulty, topic, turn, board, best_pos_x, best_pos_y, solution, explanation)
VALUES (
  1, 'beginner', 'corner', 'BLACK',
  '[0,0,2,2,0,0,0,0, 0,2,2,2,0,0,0,0, 2,2,1,1,2,0,0,0, 2,1,1,1,1,0,0,0, 2,1,1,2,0,0,0,0, 0,2,1,0,0,0,0,0, 0,0,2,0,0,0,0,0, 0,0,0,0,0,0,0,0]'::jsonb,
  0, 0, 'a1',
  '黑方落 a1 占角，沿 a 列向下翻转白子，角点一旦占据不可被翻回。'
);

-- 题目 2：X 位陷阱（入门）
-- 白先，最佳手 b2（X 位弱点，迫使黑方让角）
INSERT INTO tactics_puzzles (puzzle_no, difficulty, topic, turn, board, best_pos_x, best_pos_y, solution, explanation)
VALUES (
  2, 'beginner', 'x_square', 'WHITE',
  '[0,0,0,0,0,0,0,0, 0,0,1,0,0,0,0,0, 0,1,1,1,0,0,0,0, 0,0,1,2,2,2,0,0, 0,0,0,2,1,1,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0]'::jsonb,
  1, 1, 'b2',
  '白方下在 b2 的 X 位虽看似送角，但能翻转黑方 c2/c3，为后续夺角铺路。'
);

-- 题目 3：边线控制（简单）
-- 黑先，最佳手 h1（边线稳定子）
INSERT INTO tactics_puzzles (puzzle_no, difficulty, topic, turn, board, best_pos_x, best_pos_y, solution, explanation)
VALUES (
  3, 'easy', 'edge', 'BLACK',
  '[0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,1,2,0,0,0,0, 0,0,1,1,2,0,0,0, 0,0,2,2,1,0,0,0, 0,0,0,2,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0]'::jsonb,
  7, 0, 'h1',
  '黑方沿第 1 行落 h1，翻转白方 e1/f1/g1，形成稳定的边线据点。'
);

-- 题目 4：残局精确（简单）
-- 白先，最佳手 a8（残局占角锁定胜局）
INSERT INTO tactics_puzzles (puzzle_no, difficulty, topic, turn, board, best_pos_x, best_pos_y, solution, explanation)
VALUES (
  4, 'easy', 'endgame', 'WHITE',
  '[1,1,1,1,1,1,1,0, 1,1,1,1,1,1,1,0, 1,1,1,2,2,1,0,0, 1,1,2,2,2,1,0,0, 1,1,2,2,1,1,0,0, 1,1,1,1,1,0,0,0, 1,1,1,1,0,0,0,0, 1,1,0,0,0,0,0,0]'::jsonb,
  7, 7, 'h8',
  '残局阶段白方落 h8 占角，沿 h 列与第 8 行翻转大量黑子，锁定胜局。'
);

-- 题目 5：翻子最大化（中等）
-- 黑先，最佳手 d6（单手翻子最多）
INSERT INTO tactics_puzzles (puzzle_no, difficulty, topic, turn, board, best_pos_x, best_pos_y, solution, explanation)
VALUES (
  5, 'medium', 'maximize_flip', 'BLACK',
  '[0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,2,2,2,0,0,0, 0,0,2,1,2,0,0,0, 0,0,2,1,1,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0]'::jsonb,
  3, 5, 'd6',
  '黑方落 d6 同时翻转 c3/c4/c5 三子，是当前盘面翻子最多的一手。'
);

-- 题目 6：角点争夺（中等）
-- 白先，最佳手 h8（占角）
INSERT INTO tactics_puzzles (puzzle_no, difficulty, topic, turn, board, best_pos_x, best_pos_y, solution, explanation)
VALUES (
  6, 'medium', 'corner', 'WHITE',
  '[0,0,0,0,0,0,0,2, 0,0,0,0,0,0,1,0, 0,0,0,0,0,1,1,0, 0,0,0,0,1,1,2,0, 0,0,0,1,1,2,0,0, 0,0,0,1,2,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0]'::jsonb,
  7, 7, 'h8',
  '白方落 h8 占角，沿 h 列与第 8 行翻转黑方 g6/g7/f5，角点价值最高。'
);

-- 题目 7：X 位陷阱（中等）
-- 黑先，最佳手 g2（避免送角）
INSERT INTO tactics_puzzles (puzzle_no, difficulty, topic, turn, board, best_pos_x, best_pos_y, solution, explanation)
VALUES (
  7, 'medium', 'x_square', 'BLACK',
  '[0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,1,0, 0,0,0,2,1,1,2,0, 0,0,0,2,2,1,1,0, 0,0,0,0,2,1,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0]'::jsonb,
  6, 1, 'g2',
  '黑方落 g2 翻转白方 g3/g4，同时避免在 b2/g2 等 X 位送角。'
);

-- 题目 8：边线控制（困难）
-- 白先，最佳手 a2（边线渗透）
INSERT INTO tactics_puzzles (puzzle_no, difficulty, topic, turn, board, best_pos_x, best_pos_y, solution, explanation)
VALUES (
  8, 'hard', 'edge', 'WHITE',
  '[0,0,0,0,0,0,0,0, 1,1,1,0,0,0,0,0, 1,2,1,0,0,0,0,0, 1,1,1,2,0,0,0,0, 0,0,2,1,2,0,0,0, 0,0,0,2,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0]'::jsonb,
  0, 1, 'a2',
  '白方落 a2 沿 a 列翻转黑方 a3/a4，夺取边线主动权，同时不暴露角点。'
);

-- 题目 9：少子策略（困难）
-- 黑先，最佳手 e6（少子策略，限制白方行动力）
INSERT INTO tactics_puzzles (puzzle_no, difficulty, topic, turn, board, best_pos_x, best_pos_y, solution, explanation)
VALUES (
  9, 'hard', 'fewer_discs', 'BLACK',
  '[0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,2,2,2,2,0,0, 0,0,2,1,1,2,0,0, 0,0,2,1,1,2,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0]'::jsonb,
  4, 5, 'e6',
  '黑方落 e6 虽翻子不多，但能压缩白方行动力，体现"少子策略"——中盘阶段行动力比子数更重要。'
);

-- 题目 10：残局精确（专家）
-- 白先，最佳手 a1（精确残局计算）
INSERT INTO tactics_puzzles (puzzle_no, difficulty, topic, turn, board, best_pos_x, best_pos_y, solution, explanation)
VALUES (
  10, 'expert', 'endgame', 'WHITE',
  '[0,1,1,1,1,1,1,1, 1,1,1,2,2,1,1,1, 1,1,2,2,2,1,1,0, 1,1,2,1,2,1,0,0, 1,1,2,2,1,0,0,0, 1,1,1,0,0,0,0,0, 1,1,0,0,0,0,0,0, 1,0,0,0,0,0,0,0]'::jsonb,
  0, 0, 'a1',
  '残局精确：白方落 a1 占角，沿 a 列翻转 a2-a8 全部黑子，终局翻盘的关键一手。'
);

-- 最近 7 天每日挑战（每天 5 题，按难度递增）
INSERT INTO daily_challenges (challenge_date, puzzle_ids) VALUES
  (CURRENT_DATE, ARRAY[1,2,3,5,6]),
  (CURRENT_DATE - 1, ARRAY[1,3,4,5,7]),
  (CURRENT_DATE - 2, ARRAY[2,3,5,6,8]),
  (CURRENT_DATE - 3, ARRAY[1,4,5,7,9]),
  (CURRENT_DATE - 4, ARRAY[2,4,6,8,10]),
  (CURRENT_DATE - 5, ARRAY[3,5,7,8,9]),
  (CURRENT_DATE - 6, ARRAY[1,2,6,9,10])
ON CONFLICT (challenge_date) DO NOTHING;