-- AlterTable
ALTER TABLE "TransportAssignment" ADD COLUMN     "driverId" TEXT;

-- Reprise de l'existant : chaque ancien transport garde le chauffeur actuel de son vehicule.
UPDATE "TransportAssignment" AS ta
SET "driverId" = v."driverId"
FROM "Vehicle" AS v
WHERE ta."vehicleId" = v."id";

-- CreateIndex
CREATE INDEX "TransportAssignment_driverId_idx" ON "TransportAssignment"("driverId");

-- AddForeignKey
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
