-- CreateTable
CREATE TABLE "Billing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'LEMONSQUEEZY',
    "lemonsqueezyCustomerId" TEXT,
    "lemonsqueezySubscriptionId" TEXT,
    "lemonsqueezyVariantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "currentPeriodEnd" DATETIME,
    "cancelAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Billing_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Billing_shopId_key" ON "Billing"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Billing_lemonsqueezySubscriptionId_key" ON "Billing"("lemonsqueezySubscriptionId");

-- CreateIndex
CREATE INDEX "Billing_shopId_idx" ON "Billing"("shopId");
