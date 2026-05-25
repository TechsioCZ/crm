-- AlterTable
ALTER TABLE "GlobalTopProduct" ADD COLUMN     "historicalSalesQty" INTEGER,
ADD COLUMN     "incomingFromSupplierQty" INTEGER,
ADD COLUMN     "stockQuantity" INTEGER,
ADD COLUMN     "unitPriceNetCzk" DECIMAL(14,2);
