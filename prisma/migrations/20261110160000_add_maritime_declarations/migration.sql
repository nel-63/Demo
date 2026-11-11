CREATE TABLE "MaritimeUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaritimeUser_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MaritimeUser_latitude_range_check" CHECK ("latitude" >= -90 AND "latitude" <= 90),
    CONSTRAINT "MaritimeUser_longitude_range_check" CHECK ("longitude" >= -180 AND "longitude" <= 180)
);

CREATE TABLE "MaritimeDeclaration" (
    "id" TEXT NOT NULL,
    "maritimeUserId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "boatName" TEXT NOT NULL,
    "boatRegistration" TEXT NOT NULL,
    "boatCapacity" DECIMAL(12,3) NOT NULL,
    "captainName" TEXT NOT NULL,
    "captainPhone" TEXT,
    "captainEmail" TEXT,
    "originDepartureDate" DATE NOT NULL,
    "arrivalDate" DATE NOT NULL,
    "departureDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaritimeDeclaration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MaritimeDeclaration_company_name_check" CHECK (btrim("companyName") <> ''),
    CONSTRAINT "MaritimeDeclaration_boat_name_check" CHECK (btrim("boatName") <> ''),
    CONSTRAINT "MaritimeDeclaration_boat_registration_check" CHECK (btrim("boatRegistration") <> ''),
    CONSTRAINT "MaritimeDeclaration_captain_name_check" CHECK (btrim("captainName") <> ''),
    CONSTRAINT "MaritimeDeclaration_captain_phone_check" CHECK ("captainPhone" IS NULL OR btrim("captainPhone") <> ''),
    CONSTRAINT "MaritimeDeclaration_captain_email_check" CHECK ("captainEmail" IS NULL OR btrim("captainEmail") <> ''),
    CONSTRAINT "MaritimeDeclaration_captain_contact_check" CHECK (
        ("captainPhone" IS NOT NULL AND btrim("captainPhone") <> '') OR
        ("captainEmail" IS NOT NULL AND btrim("captainEmail") <> '')
    ),
    CONSTRAINT "MaritimeDeclaration_boat_capacity_check" CHECK ("boatCapacity" > 0),
    CONSTRAINT "MaritimeDeclaration_date_order_check" CHECK (
        "originDepartureDate" <= "arrivalDate" AND "arrivalDate" <= "departureDate"
    )
);

CREATE TABLE "MaritimeDeclarationProduct" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaritimeDeclarationProduct_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MaritimeDeclarationProduct_type_check" CHECK (btrim("productType") <> ''),
    CONSTRAINT "MaritimeDeclarationProduct_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "MaritimeDeclarationProduct_unit_price_check" CHECK ("unitPrice" >= 0)
);

CREATE UNIQUE INDEX "MaritimeUser_userId_key" ON "MaritimeUser"("userId");
CREATE INDEX "MaritimeDeclaration_maritimeUserId_createdAt_idx" ON "MaritimeDeclaration"("maritimeUserId", "createdAt");
CREATE INDEX "MaritimeDeclaration_companyName_idx" ON "MaritimeDeclaration"("companyName");
CREATE INDEX "MaritimeDeclaration_boatName_idx" ON "MaritimeDeclaration"("boatName");
CREATE INDEX "MaritimeDeclarationProduct_declarationId_idx" ON "MaritimeDeclarationProduct"("declarationId");

ALTER TABLE "MaritimeUser"
    ADD CONSTRAINT "MaritimeUser_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaritimeDeclaration"
    ADD CONSTRAINT "MaritimeDeclaration_maritimeUserId_fkey"
    FOREIGN KEY ("maritimeUserId") REFERENCES "MaritimeUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaritimeDeclarationProduct"
    ADD CONSTRAINT "MaritimeDeclarationProduct_declarationId_fkey"
    FOREIGN KEY ("declarationId") REFERENCES "MaritimeDeclaration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
