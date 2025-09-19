-- MySQL 8.0+ DDL for Claw Hunters (no Prisma)
-- Charset/Collation for on-chain addresses and hex strings
SET NAMES utf8mb4;

-- Updated revenue_epoch table with comprehensive revenue distribution
CREATE TABLE IF NOT EXISTS revenue_epochs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  epoch_id INT NOT NULL UNIQUE,
  total_revenue DECIMAL(38,0) NOT NULL,
  opc_amount DECIMAL(38,0) NOT NULL,
  alpha_amount DECIMAL(38,0) NOT NULL,
  beta_amount DECIMAL(38,0) NOT NULL,
  gamma_amount DECIMAL(38,0) NOT NULL,
  delta_amount DECIMAL(38,0) NOT NULL,
  remainder_amount DECIMAL(38,0) NOT NULL,
  block_timestamp DECIMAL(20,0) NOT NULL,
  finalized BOOLEAN NOT NULL DEFAULT FALSE,
  oracle_posted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_epoch_id (epoch_id),
  INDEX idx_block_timestamp (block_timestamp),
  INDEX idx_finalized (finalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Updated machine_revenue table with comprehensive tracking
CREATE TABLE IF NOT EXISTS machine_revenues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  machine_id INT NOT NULL,
  epoch_id INT NOT NULL,
  revenue_amount DECIMAL(38,0) NOT NULL,
  root_hash CHAR(66) NOT NULL,       -- 0x + 64 hex
  oracle_address CHAR(42) NOT NULL,  -- 0x + 40 hex
  block_timestamp DECIMAL(20,0) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_machine_epoch (machine_id, epoch_id),
  INDEX idx_epoch_id (epoch_id),
  INDEX idx_machine_id (machine_id),
  INDEX idx_oracle_address (oracle_address),
  FOREIGN KEY (epoch_id) REFERENCES revenue_epochs(epoch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Claw machine lifecycle management
CREATE TABLE IF NOT EXISTS claw_machines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  machine_id INT NOT NULL UNIQUE,
  status ENUM('ACTIVE', 'EXPIRED', 'BROKEN', 'DECOMMISSIONED') NOT NULL DEFAULT 'ACTIVE',
  deployed_at DECIMAL(20,0) NOT NULL,
  expires_at DECIMAL(20,0) NULL,
  location VARCHAR(255) NULL,
  last_revenue_epoch INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_machine_id (machine_id),
  INDEX idx_status (status),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- NFT Owner token definitions
CREATE TABLE IF NOT EXISTS nft_owner_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token_id INT NOT NULL UNIQUE,
  machine_id INT NOT NULL,
  share_basis_points INT NOT NULL, -- 1-10000
  total_supply INT NOT NULL,
  expires_at DECIMAL(20,0) NULL,
  burned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_machine_id (machine_id),
  INDEX idx_burned (burned),
  FOREIGN KEY (machine_id) REFERENCES claw_machines(machine_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- NFT Owner holdings snapshots for reward calculations
CREATE TABLE IF NOT EXISTS nft_owner_holdings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  holder_address CHAR(42) NOT NULL,
  token_id INT NOT NULL,
  units_held INT NOT NULL,
  snapshot_epoch INT NOT NULL,
  staked_in_pool BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_holder_token_epoch (holder_address, token_id, snapshot_epoch),
  INDEX idx_holder_address (holder_address),
  INDEX idx_snapshot_epoch (snapshot_epoch),
  INDEX idx_staked_in_pool (staked_in_pool),
  FOREIGN KEY (token_id) REFERENCES nft_owner_tokens(token_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- CHG staking positions with lock weights
CREATE TABLE IF NOT EXISTS staking_positions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  position_id INT NOT NULL UNIQUE,
  staker_address CHAR(42) NOT NULL,
  staked_amount DECIMAL(38,0) NOT NULL,
  lock_duration_days INT NOT NULL,
  lock_weight INT NOT NULL, -- basis points multiplier
  start_timestamp DECIMAL(20,0) NOT NULL,
  unlock_timestamp DECIMAL(20,0) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  investor_program BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_staker_address (staker_address),
  INDEX idx_active (active),
  INDEX idx_unlock_timestamp (unlock_timestamp),
  INDEX idx_investor_program (investor_program)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Claimable rewards with double-claim prevention
CREATE TABLE IF NOT EXISTS claimable_rewards (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  beneficiary_address CHAR(42) NOT NULL,
  epoch_id INT NOT NULL,
  reward_group ENUM('STAKING_CHG', 'NFTCLAW_L1', 'NFTOWNER_L2') NOT NULL,
  claimable_amount DECIMAL(38,0) NOT NULL,
  source_token_id INT NULL,
  source_machine_id INT NULL,
  calculated_at DECIMAL(20,0) NOT NULL,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_beneficiary_epoch_group_token_machine (beneficiary_address, epoch_id, reward_group, source_token_id, source_machine_id),
  INDEX idx_beneficiary_address (beneficiary_address),
  INDEX idx_epoch_id (epoch_id),
  INDEX idx_reward_group (reward_group),
  INDEX idx_claimed (claimed),
  FOREIGN KEY (epoch_id) REFERENCES revenue_epochs(epoch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Claimed rewards audit trail
CREATE TABLE IF NOT EXISTS claimed_rewards (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  beneficiary_address CHAR(42) NOT NULL,
  epoch_id INT NOT NULL,
  claimed_amount DECIMAL(38,0) NOT NULL,
  transaction_hash CHAR(66) NOT NULL UNIQUE,
  block_timestamp DECIMAL(20,0) NOT NULL,
  gas_used INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_beneficiary_address (beneficiary_address),
  INDEX idx_epoch_id (epoch_id),
  INDEX idx_block_timestamp (block_timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Oracle posting batch tracking
CREATE TABLE IF NOT EXISTS oracle_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NOT NULL UNIQUE,
  epoch_id INT NOT NULL,
  merkle_root_hash CHAR(66) NOT NULL,
  oracle_address CHAR(42) NOT NULL,
  signature BLOB NOT NULL,
  total_machines INT NOT NULL,
  total_revenue DECIMAL(38,0) NOT NULL,
  posted_at DECIMAL(20,0) NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_epoch_id (epoch_id),
  INDEX idx_oracle_address (oracle_address),
  INDEX idx_verified (verified)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- RewardPool (δ) usage tracking
CREATE TABLE IF NOT EXISTS reward_pool_usage (
  epoch_id INT PRIMARY KEY,
  allocated_amount DECIMAL(38,0) NOT NULL,
  used_amount DECIMAL(38,0) NOT NULL DEFAULT 0,
  carryover_amount DECIMAL(38,0) NOT NULL DEFAULT 0,
  usage_description TEXT NULL,
  updated_at DECIMAL(20,0) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- View: effective share for owner (if using boost_bps)
CREATE OR REPLACE VIEW vw_owner_share_effective AS
SELECT
  token_id,
  machine_id,
  share_bps,
  boost_bps,
  (share_bps * (10000 + boost_bps)) / 10000 AS share_eff_bps
FROM owner_share;

-- Example upsert helpers:
-- Insert or update revenue_epoch (keep last total_r)
-- INSERT INTO revenue_epoch (epoch_id,total_r,alpha,beta,gamma,delta)
-- VALUES (1, 1000000, 4000,3000,2000,1000)
-- ON DUPLICATE KEY UPDATE total_r=VALUES(total_r), alpha=VALUES(alpha), beta=VALUES(beta), gamma=VALUES(gamma), delta=VALUES(delta), block_time=CURRENT_TIMESTAMP;

-- Insert/Upsert holdings on ERC1155 transfers:
-- INSERT INTO nft_owner_holding(holder, token_id, balance, machine_id, share_bps)
-- VALUES ('0xabc..', 1, 5, 12, 2500)
-- ON DUPLICATE KEY UPDATE balance = GREATEST(0, balance + VALUES(balance));
