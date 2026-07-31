-- 018: 战术题库 explanation 双语化
-- 新增 explanation_en 列，英文界面显示英文解析

ALTER TABLE tactics_puzzles ADD COLUMN IF NOT EXISTS explanation_en TEXT;

UPDATE tactics_puzzles SET explanation_en = CASE puzzle_no
  WHEN 1 THEN 'Black plays a1 to seize the corner, flipping white discs down the a-file. Once taken, a corner can never be flipped back.'
  WHEN 2 THEN 'White plays b2 — the X-square. Though it looks like giving away the corner, it flips c2/c3 and sets up a future corner capture.'
  WHEN 3 THEN 'Black plays h1 along the top edge, flipping e1/f1/g1 to establish a stable edge position.'
  WHEN 4 THEN 'In the endgame, White plays h8 to take the corner, flipping many black discs along the h-file and 8th row to lock in the win.'
  WHEN 5 THEN 'Black plays d6, flipping c3/c4/c5 — three discs in one move, the maximum available on this board.'
  WHEN 6 THEN 'White plays h8 to seize the corner, flipping g6/g7/f5 along the h-file and 8th row. Corners are the most valuable squares.'
  WHEN 7 THEN 'Black plays g2, flipping g3/g4 while avoiding the dangerous X-squares at b2 and g2 that would hand over a corner.'
  WHEN 8 THEN 'White plays a2, flipping a3/a4 along the a-file to gain edge initiative without exposing a corner.'
  WHEN 9 THEN 'Black plays e6 — though it flips few discs, it restricts White''s mobility. In the midgame, mobility matters more than disc count.'
  WHEN 10 THEN 'Endgame precision: White plays a1 to take the corner, flipping the entire a-file (a2-a8) — the key move to turn the game around.'
END
WHERE explanation_en IS NULL;
