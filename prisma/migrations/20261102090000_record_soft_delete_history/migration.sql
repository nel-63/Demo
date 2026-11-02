-- Soft deletion, transport snapshots and append-only version history.
ALTER TABLE "TransportAssignment"
  ADD COLUMN "vehicleRegistration" TEXT,
  ADD COLUMN "vehicleCharacteristics" TEXT,
  ADD COLUMN "driverLicenseNumber" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;

ALTER TABLE "Product"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;

ALTER TABLE "Payment"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;

CREATE INDEX "TransportAssignment_deletedAt_idx" ON "TransportAssignment"("deletedAt");
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");
CREATE INDEX "Payment_deletedAt_idx" ON "Payment"("deletedAt");

CREATE TABLE "RecordRevision" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecordRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecordRevision_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RecordRevision_entityType_entityId_version_key"
  ON "RecordRevision"("entityType", "entityId", "version");
CREATE INDEX "RecordRevision_entityType_entityId_createdAt_idx"
  ON "RecordRevision"("entityType", "entityId", "createdAt");
CREATE INDEX "RecordRevision_actorId_createdAt_idx"
  ON "RecordRevision"("actorId", "createdAt");

-- Audit and revision rows are append-only, including for administrators.
CREATE FUNCTION "reject_immutable_record_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'This record is append-only and cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "reject_immutable_record_change"();

CREATE TRIGGER "RecordRevision_append_only"
  BEFORE UPDATE OR DELETE ON "RecordRevision"
  FOR EACH ROW EXECUTE FUNCTION "reject_immutable_record_change"();
