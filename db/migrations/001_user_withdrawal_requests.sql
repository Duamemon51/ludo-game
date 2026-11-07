CREATE TABLE IF NOT EXISTS user_withdrawal_requests (
  id CHAR(36) NOT NULL,
  master_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
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
