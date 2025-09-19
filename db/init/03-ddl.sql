-- Optional DDL if you prefer not to run Prisma initially
-- (You can still run Prisma migrate afterwards)
CREATE TABLE IF NOT EXISTS revenue_epoch (
  id INT AUTO_INCREMENT PRIMARY KEY,
  epoch_id INT NOT NULL UNIQUE,
  total_r DECIMAL(38,0) NOT NULL,
  alpha INT NOT NULL,
  beta INT NOT NULL,
  gamma INT NOT NULL,
  delta INT NOT NULL,
  block_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS machine_revenue (
  id INT AUTO_INCREMENT PRIMARY KEY,
  machine_id INT NOT NULL,
  epoch_id INT NOT NULL,
  amount DECIMAL(38,0) NOT NULL,
  root_hash BLOB NOT NULL,
  poster VARCHAR(42) NOT NULL,
  ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (epoch_id),
  INDEX (machine_id)
);

CREATE TABLE IF NOT EXISTS owner_share (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token_id INT NOT NULL UNIQUE,
  machine_id INT NOT NULL,
  share_bps INT NOT NULL,
  staked BOOLEAN NOT NULL DEFAULT FALSE,
  boost_bps INT NOT NULL DEFAULT 0,
  INDEX (machine_id)
);

CREATE TABLE IF NOT EXISTS nft_owner_holding (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  holder VARCHAR(42) NOT NULL,
  token_id INT NOT NULL,
  balance BIGINT NOT NULL DEFAULT 0,
  machine_id INT NULL,
  share_bps INT NULL,
  UNIQUE KEY uq_holder_token (holder, token_id),
  INDEX idx_holder (holder),
  INDEX idx_token (token_id)
);

CREATE TABLE IF NOT EXISTS stake_pos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staker VARCHAR(42) NOT NULL,
  amount DECIMAL(38,0) NOT NULL,
  lock_term INT NOT NULL,
  start DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  weight INT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX idx_staker (staker)
);

CREATE TABLE IF NOT EXISTS claimable (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  beneficiary VARCHAR(42) NOT NULL,
  epoch_id INT NOT NULL,
  `group` VARCHAR(16) NOT NULL,
  amount DECIMAL(38,0) NOT NULL,
  UNIQUE KEY uq_beneficiary_epoch_group (beneficiary, epoch_id, `group`),
  INDEX idx_epoch (epoch_id),
  INDEX idx_beneficiary (beneficiary)
);

CREATE TABLE IF NOT EXISTS claimed (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  beneficiary VARCHAR(42) NOT NULL,
  epoch_id INT NOT NULL,
  amount DECIMAL(38,0) NOT NULL,
  tx_hash CHAR(66) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_beneficiary (beneficiary)
);
