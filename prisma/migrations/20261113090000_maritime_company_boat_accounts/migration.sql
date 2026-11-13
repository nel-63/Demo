-- Un compte bateau (créé à la première connexion) est relié au compte société saisi par l'admin.
ALTER TABLE "MaritimeUser" ADD COLUMN "companyAccountId" TEXT;

CREATE INDEX "MaritimeUser_companyAccountId_idx" ON "MaritimeUser"("companyAccountId");

ALTER TABLE "MaritimeUser"
  ADD CONSTRAINT "MaritimeUser_companyAccountId_fkey"
  FOREIGN KEY ("companyAccountId") REFERENCES "MaritimeUser"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
