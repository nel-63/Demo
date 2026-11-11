ALTER TABLE "MaritimeUser"
  ALTER COLUMN "latitude" DROP NOT NULL,
  ALTER COLUMN "longitude" DROP NOT NULL;

CREATE TABLE "MaritimeProductType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "unitPrice" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'MGA',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaritimeProductType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaritimeProductType_normalizedName_key"
  ON "MaritimeProductType"("normalizedName");

CREATE INDEX "MaritimeProductType_isActive_idx"
  ON "MaritimeProductType"("isActive");

CREATE INDEX "MaritimeProductType_name_idx"
  ON "MaritimeProductType"("name");

ALTER TABLE "MaritimeDeclarationProduct"
  ADD COLUMN "productTypeId" TEXT;

CREATE INDEX "MaritimeDeclarationProduct_productTypeId_idx"
  ON "MaritimeDeclarationProduct"("productTypeId");

ALTER TABLE "MaritimeDeclarationProduct"
  ADD CONSTRAINT "MaritimeDeclarationProduct_productTypeId_fkey"
  FOREIGN KEY ("productTypeId") REFERENCES "MaritimeProductType"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
