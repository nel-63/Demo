-- Conserver les colonnes historiques vehicleInfo et notes sans les exposer
-- dans le client, et rendre obligatoires les données véhicule/chauffeur.
UPDATE "TransportAssignment"
SET
  "vehicleRegistration" = COALESCE(NULLIF(BTRIM("vehicleRegistration"), ''), 'Non renseigné'),
  "vehicleCharacteristics" = COALESCE(NULLIF(BTRIM("vehicleCharacteristics"), ''), 'Non renseigné'),
  "driverName" = COALESCE(NULLIF(BTRIM("driverName"), ''), 'Non renseigné'),
  "driverLicenseNumber" = COALESCE(NULLIF(BTRIM("driverLicenseNumber"), ''), 'Non renseigné');

ALTER TABLE "TransportAssignment"
  ALTER COLUMN "vehicleRegistration" SET NOT NULL,
  ALTER COLUMN "vehicleCharacteristics" SET NOT NULL,
  ALTER COLUMN "driverName" SET NOT NULL,
  ALTER COLUMN "driverLicenseNumber" SET NOT NULL;

-- Le paiement ne conserve que le montant à payer, sans montant reçu ni monnaie.
ALTER TABLE "Payment"
  DROP COLUMN "amountReceived",
  DROP COLUMN "changeReturned";
