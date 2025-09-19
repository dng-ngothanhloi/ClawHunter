-- CreateTable
CREATE TABLE "public"."claw_machines" (
    "id" TEXT NOT NULL,
    "machineId" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "deployedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "location" TEXT,
    "lastRevenueEpoch" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claw_machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."nft_owner_tokens" (
    "id" TEXT NOT NULL,
    "tokenId" BIGINT NOT NULL,
    "machineId" BIGINT NOT NULL,
    "shareBasisPoints" INTEGER NOT NULL,
    "totalSupply" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "burned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nft_owner_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."nft_owner_holdings" (
    "id" TEXT NOT NULL,
    "holderAddress" TEXT NOT NULL,
    "tokenId" BIGINT NOT NULL,
    "unitsHeld" BIGINT NOT NULL,
    "snapshotEpoch" BIGINT NOT NULL,
    "stakedInPool" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nft_owner_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."staking_positions" (
    "id" TEXT NOT NULL,
    "positionId" BIGINT NOT NULL,
    "stakerAddress" TEXT NOT NULL,
    "stakedAmount" DECIMAL(20,18) NOT NULL,
    "lockDurationDays" INTEGER NOT NULL,
    "lockWeight" INTEGER NOT NULL,
    "startTimestamp" TIMESTAMP(3) NOT NULL,
    "unlockTimestamp" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "investorProgram" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staking_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."claimable_rewards" (
    "id" TEXT NOT NULL,
    "beneficiaryAddress" TEXT NOT NULL,
    "epochId" BIGINT NOT NULL,
    "rewardGroup" TEXT NOT NULL,
    "claimableAmount" DECIMAL(20,6) NOT NULL,
    "sourceTokenId" BIGINT,
    "sourceMachineId" BIGINT,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claimable_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."claimed_rewards" (
    "id" TEXT NOT NULL,
    "claimableRewardId" TEXT NOT NULL,
    "beneficiaryAddress" TEXT NOT NULL,
    "epochId" BIGINT NOT NULL,
    "rewardGroup" TEXT NOT NULL,
    "claimedAmount" DECIMAL(20,6) NOT NULL,
    "txHash" TEXT NOT NULL,
    "gasUsed" BIGINT,
    "gasPrice" BIGINT,
    "claimedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claimed_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."oracle_batches" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "epochId" BIGINT NOT NULL,
    "oracleAddress" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "machineRevenues" JSONB NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockTimestamp" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verificationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oracle_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reward_pool_usage" (
    "id" TEXT NOT NULL,
    "usageId" TEXT NOT NULL,
    "epochId" BIGINT NOT NULL,
    "poolType" TEXT NOT NULL,
    "usedAmount" DECIMAL(20,6) NOT NULL,
    "carryoverAmount" DECIMAL(20,6) NOT NULL,
    "allocatedAmount" DECIMAL(20,6) NOT NULL,
    "previousCarryover" DECIMAL(20,6) NOT NULL,
    "usageDescription" TEXT NOT NULL,
    "usageCategory" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL,
    "blockNumber" BIGINT,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_pool_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "claw_machines_machineId_key" ON "public"."claw_machines"("machineId");

-- CreateIndex
CREATE UNIQUE INDEX "nft_owner_tokens_tokenId_key" ON "public"."nft_owner_tokens"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "nft_owner_tokens_machineId_tokenId_key" ON "public"."nft_owner_tokens"("machineId", "tokenId");

-- CreateIndex
CREATE INDEX "nft_owner_holdings_snapshotEpoch_idx" ON "public"."nft_owner_holdings"("snapshotEpoch");

-- CreateIndex
CREATE INDEX "nft_owner_holdings_holderAddress_idx" ON "public"."nft_owner_holdings"("holderAddress");

-- CreateIndex
CREATE UNIQUE INDEX "nft_owner_holdings_holderAddress_tokenId_snapshotEpoch_key" ON "public"."nft_owner_holdings"("holderAddress", "tokenId", "snapshotEpoch");

-- CreateIndex
CREATE UNIQUE INDEX "staking_positions_positionId_key" ON "public"."staking_positions"("positionId");

-- CreateIndex
CREATE INDEX "staking_positions_stakerAddress_idx" ON "public"."staking_positions"("stakerAddress");

-- CreateIndex
CREATE INDEX "staking_positions_active_idx" ON "public"."staking_positions"("active");

-- CreateIndex
CREATE INDEX "claimable_rewards_beneficiaryAddress_idx" ON "public"."claimable_rewards"("beneficiaryAddress");

-- CreateIndex
CREATE INDEX "claimable_rewards_epochId_idx" ON "public"."claimable_rewards"("epochId");

-- CreateIndex
CREATE INDEX "claimable_rewards_rewardGroup_idx" ON "public"."claimable_rewards"("rewardGroup");

-- CreateIndex
CREATE UNIQUE INDEX "claimable_rewards_beneficiaryAddress_epochId_rewardGroup_so_key" ON "public"."claimable_rewards"("beneficiaryAddress", "epochId", "rewardGroup", "sourceTokenId", "sourceMachineId");

-- CreateIndex
CREATE UNIQUE INDEX "claimed_rewards_claimableRewardId_key" ON "public"."claimed_rewards"("claimableRewardId");

-- CreateIndex
CREATE INDEX "claimed_rewards_beneficiaryAddress_idx" ON "public"."claimed_rewards"("beneficiaryAddress");

-- CreateIndex
CREATE INDEX "claimed_rewards_epochId_idx" ON "public"."claimed_rewards"("epochId");

-- CreateIndex
CREATE INDEX "claimed_rewards_txHash_idx" ON "public"."claimed_rewards"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "oracle_batches_batchId_key" ON "public"."oracle_batches"("batchId");

-- CreateIndex
CREATE INDEX "oracle_batches_epochId_idx" ON "public"."oracle_batches"("epochId");

-- CreateIndex
CREATE INDEX "oracle_batches_oracleAddress_idx" ON "public"."oracle_batches"("oracleAddress");

-- CreateIndex
CREATE INDEX "oracle_batches_verified_idx" ON "public"."oracle_batches"("verified");

-- CreateIndex
CREATE UNIQUE INDEX "reward_pool_usage_usageId_key" ON "public"."reward_pool_usage"("usageId");

-- CreateIndex
CREATE INDEX "reward_pool_usage_epochId_idx" ON "public"."reward_pool_usage"("epochId");

-- CreateIndex
CREATE INDEX "reward_pool_usage_poolType_idx" ON "public"."reward_pool_usage"("poolType");

-- CreateIndex
CREATE INDEX "reward_pool_usage_usageCategory_idx" ON "public"."reward_pool_usage"("usageCategory");
