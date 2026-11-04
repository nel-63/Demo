ALTER TABLE "Location"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;

CREATE INDEX "Location_deletedAt_idx" ON "Location"("deletedAt");
