CREATE DATABASE IF NOT EXISTS ludo_game
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ludo_game;

CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  login_id VARCHAR(50) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  phone VARCHAR(30) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('SUPER_ADMIN', 'MASTER', 'PLAYER') NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE', 'BLOCKED') NOT NULL DEFAULT 'ACTIVE',
  status_before_block ENUM('ACTIVE', 'INACTIVE') NULL,
  master_id BIGINT UNSIGNED NULL,
  super_admin_guard TINYINT GENERATED ALWAYS AS (
    CASE WHEN role = 'SUPER_ADMIN' THEN 1 ELSE NULL END
  ) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_accounts_login_id (login_id),
  UNIQUE KEY uq_single_super_admin (super_admin_guard),
  KEY idx_accounts_master_role (master_id, role),
  CONSTRAINT fk_accounts_master FOREIGN KEY (master_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_account_master_role CHECK (
    (role = 'PLAYER' AND master_id IS NOT NULL)
    OR (role <> 'PLAYER' AND master_id IS NULL)
  )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wallets (
  account_id BIGINT UNSIGNED NOT NULL,
  balance DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id),
  CONSTRAINT fk_wallets_account FOREIGN KEY (account_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_wallet_nonnegative CHECK (balance >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14, 2) NOT NULL,
  entry_type ENUM('ADD', 'DEDUCT', 'DEPOSIT', 'WITHDRAW', 'BET', 'WIN', 'FEE', 'TRANSFER') NOT NULL,
  balance_after DECIMAL(14, 2) NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  note VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ledger_account_created (account_id, created_at),
  CONSTRAINT fk_ledger_account FOREIGN KEY (account_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_ledger_actor FOREIGN KEY (actor_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id CHAR(36) NOT NULL,
  master_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14, 2) NOT NULL,
  request_type ENUM('DEPOSIT', 'WITHDRAWAL') NOT NULL DEFAULT 'WITHDRAWAL',
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reason VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_withdrawals_status_date (status, requested_at),
  KEY idx_withdrawals_master_date (master_id, requested_at),
  CONSTRAINT fk_withdrawals_master FOREIGN KEY (master_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_withdrawals_reviewer FOREIGN KEY (reviewed_by) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_withdrawal_positive CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_withdrawal_requests (
  id CHAR(36) NOT NULL,
  master_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  request_type ENUM('DEPOSIT', 'WITHDRAWAL') NOT NULL DEFAULT 'WITHDRAWAL',
  amount DECIMAL(14, 2) NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reason VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_user_withdrawals_master_status (master_id, status, requested_at),
  KEY idx_user_withdrawals_user_status (user_id, status, requested_at),
  CONSTRAINT fk_user_withdrawals_master FOREIGN KEY (master_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_user_withdrawals_user FOREIGN KEY (user_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_user_withdrawals_reviewer FOREIGN KEY (reviewed_by) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_user_withdrawal_positive CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS matches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_code VARCHAR(40) NOT NULL,
  master_id BIGINT UNSIGNED NOT NULL,
  bet_per_player DECIMAL(14, 2) NOT NULL,
  platform_fee DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  payout DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  winner_id BIGINT UNSIGNED NULL,
  status ENUM('IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'IN_PROGRESS',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_matches_code (match_code),
  KEY idx_matches_master_date (master_id, started_at),
  KEY idx_matches_status_date (status, started_at),
  CONSTRAINT fk_matches_master FOREIGN KEY (master_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_matches_winner FOREIGN KEY (winner_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_match_money_nonnegative CHECK (bet_per_player >= 0 AND platform_fee >= 0 AND payout >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS match_players (
  match_id BIGINT UNSIGNED NOT NULL,
  player_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (match_id, player_id),
  KEY idx_match_players_player (player_id, match_id),
  CONSTRAINT fk_match_players_match FOREIGN KEY (match_id) REFERENCES matches(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_match_players_account FOREIGN KEY (player_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(60) NOT NULL,
  setting_value VARCHAR(500) NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_settings_actor FOREIGN KEY (updated_by) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(100) NULL,
  details TEXT NOT NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_target (target_type, target_id),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES accounts(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO platform_settings (setting_key, setting_value)
VALUES
  ('minimum_bet', '300'),
  ('platform_fee_percent', '10'),
  ('tournament_enabled', 'true'),
  ('tournament_entry', '300')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);

DELIMITER //
CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON audit_log
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit log entries are immutable';
END//

CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit log entries are immutable';
END//
DELIMITER ;
