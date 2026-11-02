-- Simplification : un « passage » de produit n'existe que s'il est payé.
-- Plus de statuts, plus de véhicules ni de chauffeurs gérés (simple description sur le passage).
-- ATTENTION : cette migration supprime définitivement les transports non payés,
-- les chauffeurs et les véhicules (leurs informations sont recopiées en texte sur chaque passage).

-- 1. Un transport sans paiement n'a jamais eu lieu : on l'écarte, avec son produit.
DELETE FROM "TransportAssignment" AS ta
WHERE NOT EXISTS (SELECT 1 FROM "Payment" AS p WHERE p."assignmentId" = ta."id");

DELETE FROM "Product" AS pr
WHERE NOT EXISTS (SELECT 1 FROM "TransportAssignment" AS ta WHERE ta."productId" = pr."id");

-- 2. Nouvelles colonnes : trajet et informations libres.
ALTER TABLE "TransportAssignment"
  ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'Non renseignée',
  ADD COLUMN "destination" TEXT NOT NULL DEFAULT 'Non renseignée',
  ADD COLUMN "vehicleInfo" TEXT,
  ADD COLUMN "driverName" TEXT;

ALTER TABLE "TransportAssignment"
  ALTER COLUMN "origin" DROP DEFAULT,
  ALTER COLUMN "destination" DROP DEFAULT;

-- 3. Reprise de l'existant : véhicule et chauffeur recopiés en texte sur chaque passage.
UPDATE "TransportAssignment" AS ta
SET "vehicleInfo" = v."vehicleType" || ' — ' || v."licensePlate",
    "driverName" = (
      SELECT d."firstName" || ' ' || d."lastName"
      FROM "Driver" AS d
      WHERE d."id" = COALESCE(ta."driverId", v."driverId")
    )
FROM "Vehicle" AS v
WHERE v."id" = ta."vehicleId";

-- 4. Suppression de ce qui n'existe plus (les clés étrangères et index partent avec les colonnes).
ALTER TABLE "TransportAssignment"
  DROP COLUMN "vehicleId",
  DROP COLUMN "driverId",
  DROP COLUMN "status",
  DROP COLUMN "amountDue";

DROP TABLE "Vehicle";
DROP TABLE "Driver";
DROP TYPE "TransportStatus";
