-- CreateTable
CREATE TABLE "InsiderTransaction" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "txDate" TIMESTAMP(3) NOT NULL,
    "side" TEXT NOT NULL,
    "insiderName" TEXT NOT NULL,
    "insiderRelation" TEXT,
    "shares" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "valueUsd" DOUBLE PRECISION,
    "sourceProvider" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsiderTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsiderMonitoringRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scope" TEXT NOT NULL,
    "symbols" JSONB,
    "topN" INTEGER,
    "side" TEXT NOT NULL,
    "minValueUsd" DOUBLE PRECISION,
    "lookbackDays" INTEGER NOT NULL DEFAULT 30,
    "lastCheckedAt" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    "agentNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsiderMonitoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRunLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "invokedToolNames" JSONB NOT NULL,
    "providerName" TEXT,
    "providerLatencyMs" INTEGER,
    "cacheHitCount" INTEGER NOT NULL DEFAULT 0,
    "cacheMissCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION,
    "elapsedMs" INTEGER,
    "warnings" JSONB,
    "guardrail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InsiderTransaction_sourceKey_key" ON "InsiderTransaction"("sourceKey");

-- CreateIndex
CREATE INDEX "InsiderTransaction_symbol_txDate_idx" ON "InsiderTransaction"("symbol", "txDate");

-- CreateIndex
CREATE INDEX "InsiderMonitoringRule_userId_updatedAt_idx" ON "InsiderMonitoringRule"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiRunLog_userId_createdAt_idx" ON "AiRunLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "InsiderMonitoringRule" ADD CONSTRAINT "InsiderMonitoringRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
