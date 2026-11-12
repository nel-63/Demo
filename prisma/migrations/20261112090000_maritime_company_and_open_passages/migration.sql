ALTER TABLE "MaritimeUser"
ADD COLUMN "companyName" TEXT NOT NULL DEFAULT '';

UPDATE "MaritimeUser" AS mu
SET "companyName" = COALESCE(
  (
    SELECT md."companyName"
    FROM "MaritimeDeclaration" AS md
    WHERE md."maritimeUserId" = mu."id"
    ORDER BY md."createdAt" ASC
    LIMIT 1
  ),
  (
    SELECT NULLIF(BTRIM(CONCAT(u."firstName", ' ', u."lastName")), '')
    FROM "User" AS u
    WHERE u."id" = mu."userId"
  ),
  'Société maritime'
);

ALTER TABLE "MaritimeUser"
ALTER COLUMN "companyName" DROP DEFAULT;

ALTER TABLE "MaritimeDeclaration"
ALTER COLUMN "departureDate" DROP NOT NULL;
