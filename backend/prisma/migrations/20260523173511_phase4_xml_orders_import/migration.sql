-- CreateEnum
CREATE TYPE "OrderItemType" AS ENUM ('product', 'shipping', 'payment', 'other');

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" SERIAL NOT NULL,
    "orderDbId" INTEGER NOT NULL,
    "lineType" "OrderItemType" NOT NULL DEFAULT 'product',
    "sku" TEXT,
    "name" TEXT,
    "category" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPriceNetCzk" DECIMAL(14,2) NOT NULL,
    "lineNetCzk" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" SERIAL NOT NULL,
    "sourceName" TEXT,
    "triggeredById" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "createdOrders" INTEGER NOT NULL DEFAULT 0,
    "updatedOrders" INTEGER NOT NULL DEFAULT 0,
    "errorRecords" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRunError" (
    "id" SERIAL NOT NULL,
    "importRunId" INTEGER NOT NULL,
    "recordIndex" INTEGER NOT NULL,
    "orderIdValue" TEXT,
    "customerIdValue" TEXT,
    "message" TEXT NOT NULL,
    "rawRecord" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRunError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderId_key" ON "Order"("orderId");

-- CreateIndex
CREATE INDEX "Order_customerId_importedAt_idx" ON "Order"("customerId", "importedAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderDbId_idx" ON "OrderItem"("orderDbId");

-- CreateIndex
CREATE INDEX "OrderItem_lineType_idx" ON "OrderItem"("lineType");

-- CreateIndex
CREATE INDEX "ImportRun_startedAt_idx" ON "ImportRun"("startedAt");

-- CreateIndex
CREATE INDEX "ImportRunError_importRunId_recordIndex_idx" ON "ImportRunError"("importRunId", "recordIndex");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderDbId_fkey" FOREIGN KEY ("orderDbId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRun" ADD CONSTRAINT "ImportRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRunError" ADD CONSTRAINT "ImportRunError_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
