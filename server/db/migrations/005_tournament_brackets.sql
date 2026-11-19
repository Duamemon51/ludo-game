CREATE TABLE IF NOT EXISTS tournaments (
  id CHAR(36) NOT NULL,
  master_id BIGINT UNSIGNED NOT NULL,
  entry_fee DECIMAL(14, 2) NOT NULL,
  human_count TINYINT UNSIGNED NOT NULL,
  platform_fee DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  prize_pool DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  payout DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  current_round TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'IN_PROGRESS',
  champion_slot TINYINT UNSIGNED NULL,
  champion_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_tournaments_master_date (master_id, created_at),
  KEY idx_tournaments_status_date (status, created_at),
  CONSTRAINT fk_tournaments_master FOREIGN KEY (master_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_tournaments_champion FOREIGN KEY (champion_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_tournament_entry CHECK (entry_fee >= 0 AND platform_fee >= 0 AND prize_pool >= 0 AND payout >= 0),
  CONSTRAINT chk_tournament_humans CHECK (human_count BETWEEN 1 AND 7),
  CONSTRAINT chk_tournament_round CHECK (current_round BETWEEN 1 AND 3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tournament_participants (
  tournament_id CHAR(36) NOT NULL,
  slot TINYINT UNSIGNED NOT NULL,
  player_id BIGINT UNSIGNED NULL,
  participant_name VARCHAR(50) NOT NULL,
  is_bot TINYINT(1) NOT NULL DEFAULT 0,
  bot_level ENUM('expert', 'hard', 'medium') NULL,
  status ENUM('WAITING', 'IN_PROGRESS', 'ELIMINATED', 'CHAMPION') NOT NULL DEFAULT 'WAITING',
  entry_paid TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (tournament_id, slot),
  UNIQUE KEY uq_tournament_participant_player (tournament_id, player_id),
  CONSTRAINT fk_tournament_participants_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_tournament_participants_player FOREIGN KEY (player_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_tournament_participant_slot CHECK (slot BETWEEN 1 AND 8),
  CONSTRAINT chk_tournament_participant_kind CHECK (
    (is_bot = 1 AND player_id IS NULL AND bot_level IS NOT NULL AND entry_paid = 0)
    OR (is_bot = 0 AND player_id IS NOT NULL AND bot_level IS NULL AND entry_paid = 1)
  )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tournament_matches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tournament_id CHAR(36) NOT NULL,
  round_no TINYINT UNSIGNED NOT NULL,
  match_no TINYINT UNSIGNED NOT NULL,
  player1_slot TINYINT UNSIGNED NOT NULL,
  player2_slot TINYINT UNSIGNED NOT NULL,
  status ENUM('WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'WAITING',
  winner_slot TINYINT UNSIGNED NULL,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tournament_round_match (tournament_id, round_no, match_no),
  KEY idx_tournament_matches_status (tournament_id, round_no, status),
  CONSTRAINT fk_tournament_matches_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_tournament_matches_player1 FOREIGN KEY (tournament_id, player1_slot)
    REFERENCES tournament_participants(tournament_id, slot)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_tournament_matches_player2 FOREIGN KEY (tournament_id, player2_slot)
    REFERENCES tournament_participants(tournament_id, slot)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_tournament_matches_winner FOREIGN KEY (tournament_id, winner_slot)
    REFERENCES tournament_participants(tournament_id, slot)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_tournament_match_round CHECK (round_no BETWEEN 1 AND 3),
  CONSTRAINT chk_tournament_match_slots CHECK (
    player1_slot BETWEEN 1 AND 8 AND player2_slot BETWEEN 1 AND 8 AND player1_slot <> player2_slot
  )
) ENGINE=InnoDB;
