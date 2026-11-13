-- Les comptes société (profils racines) restent les seuls comptes de connexion maritimes.
-- Les anciens comptes bateau liés à une société ne sont plus utilisés pour se connecter.
UPDATE "User" AS account
SET "isActive" = TRUE,
    "sessionVersion" = account."sessionVersion" + 1
FROM "MaritimeUser" AS profile
WHERE profile."userId" = account."id"
  AND profile."companyAccountId" IS NULL
  AND account."role" = 'USER_MAR';

UPDATE "User" AS account
SET "isActive" = FALSE,
    "sessionVersion" = account."sessionVersion" + 1
FROM "MaritimeUser" AS profile
WHERE profile."userId" = account."id"
  AND profile."companyAccountId" IS NOT NULL
  AND account."role" = 'USER_MAR';
