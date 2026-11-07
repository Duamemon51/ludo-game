ALTER TABLE user_withdrawal_requests
  ADD COLUMN request_type ENUM('DEPOSIT', 'WITHDRAWAL') NOT NULL DEFAULT 'WITHDRAWAL'
  AFTER user_id;
