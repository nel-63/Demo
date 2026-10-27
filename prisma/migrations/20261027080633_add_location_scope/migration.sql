-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "Supervisor" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "TransportAssignment" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "locationId" TEXT;

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_normalizedName_key" ON "Location"("normalizedName");

-- CreateIndex
CREATE INDEX "Driver_locationId_idx" ON "Driver"("locationId");

-- CreateIndex
CREATE INDEX "Supervisor_locationId_idx" ON "Supervisor"("locationId");

-- CreateIndex
CREATE INDEX "TransportAssignment_locationId_idx" ON "TransportAssignment"("locationId");

-- CreateIndex
CREATE INDEX "Vehicle_locationId_idx" ON "Vehicle"("locationId");

-- AddForeignKey
ALTER TABLE "Supervisor" ADD CONSTRAINT "Supervisor_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
