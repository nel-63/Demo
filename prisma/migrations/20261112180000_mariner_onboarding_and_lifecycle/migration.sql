ALTER TABLE "User"
ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "User"
ADD COLUMN "lastLoginAt" TIMESTAMP(3);

ALTER TABLE "MaritimeUser"
ADD COLUMN "loginId" TEXT,
ADD COLUMN "contactPhone" TEXT,
ADD COLUMN "onboardingComplete" BOOLEAN NOT NULL DEFAULT true;

UPDATE "MaritimeUser" AS maritime_user
SET "loginId" = lower(account."email")
FROM "User" AS account
WHERE account."id" = maritime_user."userId";

UPDATE "User" AS account
SET "lastLoginAt" = CURRENT_TIMESTAMP
FROM "MaritimeUser" AS maritime_user
WHERE maritime_user."userId" = account."id";

ALTER TABLE "MaritimeUser"
ALTER COLUMN "loginId" SET NOT NULL;

CREATE UNIQUE INDEX "MaritimeUser_loginId_key" ON "MaritimeUser"("loginId");
CREATE UNIQUE INDEX "MaritimeUser_contactPhone_key" ON "MaritimeUser"("contactPhone");
