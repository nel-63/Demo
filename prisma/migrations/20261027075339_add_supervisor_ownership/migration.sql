-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "supervisorId" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "supervisorId" TEXT;

-- CreateIndex
CREATE INDEX "Driver_supervisorId_idx" ON "Driver"("supervisorId");

-- CreateIndex
CREATE INDEX "Vehicle_supervisorId_idx" ON "Vehicle"("supervisorId");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Supervisor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Supervisor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
