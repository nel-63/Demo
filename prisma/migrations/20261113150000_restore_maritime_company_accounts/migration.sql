-- Les comptes société (profils racines) restent les seuls comptes de connexion maritimes.
-- Réactiver les comptes société qui avaient été fermés par l'ancien parcours.
UPDATE "User" AS account
SET "isActive" = TRUE,
    "sessionVersion" = account."sessionVersion" + 1
FROM "MaritimeUser" AS profile
WHERE profile."userId" = account."id"
  AND profile."companyAccountId" IS NULL
  AND account."role" = 'USER_MAR';

-- Les anciens comptes bateau liés à une société ne sont plus utilisés pour se connecter.
-- Libérer leurs coordonnées de connexion pour que la société puisse les réenregistrer
-- sur son compte unique, sans conflit avec les anciens comptes bateau.
UPDATE "User" AS account
SET "isActive" = FALSE,
    "sessionVersion" = account."sessionVersion" + 1,
    "email" = NULL,
    "phoneNumber" = NULL
FROM "MaritimeUser" AS profile
WHERE profile."userId" = account."id"
  AND profile."companyAccountId" IS NOT NULL
  AND account."role" = 'USER_MAR';

UPDATE "MaritimeUser"
SET "contactPhone" = NULL
WHERE "companyAccountId" IS NOT NULL;
