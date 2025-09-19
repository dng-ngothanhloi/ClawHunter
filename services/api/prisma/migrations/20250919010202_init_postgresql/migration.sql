-- CreateTable
CREATE TABLE "public"."indexer_checkpoints" (
    "id" TEXT NOT NULL,
    "contractName" TEXT NOT NULL,
    "lastProcessedBlock" BIGINT NOT NULL,
    "lastProcessedTx" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indexer_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."revenue_epochs" (
    "epochId" BIGINT NOT NULL,
    "totalR" DECIMAL(20,6) NOT NULL,
    "alpha" DECIMAL(20,6) NOT NULL,
    "beta" DECIMAL(20,6) NOT NULL,
    "gamma" DECIMAL(20,6) NOT NULL,
    "delta" DECIMAL(20,6) NOT NULL,
    "opc" DECIMAL(20,6) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_epochs_pkey" PRIMARY KEY ("epochId")
);

-- CreateTable
CREATE TABLE "public"."machine_revenues" (
    "id" TEXT NOT NULL,
    "epochId" BIGINT NOT NULL,
    "machineId" BIGINT NOT NULL,
    "Rm" DECIMAL(20,6) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machine_revenues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."owner_share_snapshots" (
    "id" TEXT NOT NULL,
    "epochId" BIGINT NOT NULL,
    "account" TEXT NOT NULL,
    "machineId" BIGINT NOT NULL,
    "shareBps" INTEGER NOT NULL,
    "effectiveShare" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_share_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."staking_snapshots" (
    "id" TEXT NOT NULL,
    "epochId" BIGINT NOT NULL,
    "account" TEXT NOT NULL,
    "amount" DECIMAL(20,18) NOT NULL,
    "weight" INTEGER NOT NULL,
    "effectiveWeight" DECIMAL(20,18) NOT NULL,
    "lockUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staking_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."merkle_roots" (
    "id" TEXT NOT NULL,
    "epochId" BIGINT NOT NULL,
    "group" TEXT NOT NULL,
    "root" TEXT NOT NULL,
    "total" DECIMAL(20,6) NOT NULL,
    "leafCount" INTEGER NOT NULL,
    "treeCid" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedTx" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merkle_roots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."merkle_leaves" (
    "id" TEXT NOT NULL,
    "epochId" BIGINT NOT NULL,
    "group" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "leafHash" TEXT NOT NULL,
    "proof" JSONB NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedTx" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merkle_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."event_logs" (
    "id" TEXT NOT NULL,
    "contractName" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "indexer_checkpoints_contractName_key" ON "public"."indexer_checkpoints"("contractName");

-- CreateIndex
CREATE UNIQUE INDEX "machine_revenues_epochId_machineId_key" ON "public"."machine_revenues"("epochId", "machineId");

-- CreateIndex
CREATE UNIQUE INDEX "owner_share_snapshots_epochId_account_machineId_key" ON "public"."owner_share_snapshots"("epochId", "account", "machineId");

-- CreateIndex
CREATE UNIQUE INDEX "staking_snapshots_epochId_account_key" ON "public"."staking_snapshots"("epochId", "account");

-- CreateIndex
CREATE UNIQUE INDEX "merkle_roots_epochId_group_key" ON "public"."merkle_roots"("epochId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "merkle_leaves_epochId_group_account_key" ON "public"."merkle_leaves"("epochId", "group", "account");

-- CreateIndex
CREATE INDEX "event_logs_contractName_eventName_idx" ON "public"."event_logs"("contractName", "eventName");

-- CreateIndex
CREATE INDEX "event_logs_blockNumber_idx" ON "public"."event_logs"("blockNumber");

-- CreateIndex
CREATE INDEX "event_logs_processed_idx" ON "public"."event_logs"("processed");

-- CreateIndex
CREATE UNIQUE INDEX "event_logs_txHash_logIndex_key" ON "public"."event_logs"("txHash", "logIndex");

-- AddForeignKey
ALTER TABLE "public"."machine_revenues" ADD CONSTRAINT "machine_revenues_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "public"."revenue_epochs"("epochId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."owner_share_snapshots" ADD CONSTRAINT "owner_share_snapshots_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "public"."revenue_epochs"("epochId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."staking_snapshots" ADD CONSTRAINT "staking_snapshots_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "public"."revenue_epochs"("epochId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."merkle_roots" ADD CONSTRAINT "merkle_roots_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "public"."revenue_epochs"("epochId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."merkle_leaves" ADD CONSTRAINT "merkle_leaves_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "public"."revenue_epochs"("epochId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."merkle_leaves" ADD CONSTRAINT "merkle_leaves_epochId_group_fkey" FOREIGN KEY ("epochId", "group") REFERENCES "public"."merkle_roots"("epochId", "group") ON DELETE CASCADE ON UPDATE CASCADE;
