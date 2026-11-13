ALTER TABLE matches
  ADD COLUMN opponent_is_bot TINYINT(1) NOT NULL DEFAULT 0
  AFTER winner_id;
