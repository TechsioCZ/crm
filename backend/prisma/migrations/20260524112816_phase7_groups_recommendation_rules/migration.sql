-- CreateEnum
CREATE TYPE "CustomerGroupScope" AS ENUM ('global', 'private');

-- CreateEnum
CREATE TYPE "CustomerGroupFilterType" AS ENUM ('active_orders_last_months');

-- CreateEnum
CREATE TYPE "RecommendationRuleScope" AS ENUM ('global', 'private');

-- CreateEnum
CREATE TYPE "RecommendationTargetType" AS ENUM ('category', 'top_product');

-- CreateTable
CREATE TABLE "CustomerGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "CustomerGroupScope" NOT NULL,
    "ownerUserId" INTEGER,
    "filterType" "CustomerGroupFilterType" NOT NULL DEFAULT 'active_orders_last_months',
    "monthsBack" INTEGER NOT NULL DEFAULT 12,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationRule" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "RecommendationRuleScope" NOT NULL,
    "ownerUserId" INTEGER,
    "groupId" INTEGER NOT NULL,
    "comparisonGroupId" INTEGER,
    "targetType" "RecommendationTargetType" NOT NULL,
    "targetValue" TEXT NOT NULL,
    "minPenetrationPct" DECIMAL(5,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerGroup_scope_ownerUserId_idx" ON "CustomerGroup"("scope", "ownerUserId");

-- CreateIndex
CREATE INDEX "CustomerGroup_name_idx" ON "CustomerGroup"("name");

-- CreateIndex
CREATE INDEX "RecommendationRule_scope_ownerUserId_isActive_idx" ON "RecommendationRule"("scope", "ownerUserId", "isActive");

-- CreateIndex
CREATE INDEX "RecommendationRule_groupId_idx" ON "RecommendationRule"("groupId");

-- CreateIndex
CREATE INDEX "RecommendationRule_comparisonGroupId_idx" ON "RecommendationRule"("comparisonGroupId");

-- AddForeignKey
ALTER TABLE "CustomerGroup" ADD CONSTRAINT "CustomerGroup_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationRule" ADD CONSTRAINT "RecommendationRule_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationRule" ADD CONSTRAINT "RecommendationRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationRule" ADD CONSTRAINT "RecommendationRule_comparisonGroupId_fkey" FOREIGN KEY ("comparisonGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
