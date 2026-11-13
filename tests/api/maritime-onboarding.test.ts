import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { POST as completeOnboarding } from "@/app/api/maritime/onboarding/route";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditEntries, resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR, jsonRequest, read } from "../helpers/http";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;
// Compte société : saisi par l'admin, utilisé une seule fois pour la première connexion.
const COMPANY_USER = { ...SUPERVISOR, id: "company-user-1", role: "USER_MAR" as const };
const COMPANY_PROFILE_ID = "company-profile-1";
const PASSWORD = "un-mot-de-passe-bateau";
const payload = {
  contactEmail: "Bateau@Example.mg",
  contactPhone: "+261 34 00 000 00",
  password: PASSWORD,
  passwordConfirm: PASSWORD,
  boatName: "Makoa",
  boatRegistration: "MA-102",
  boatCapacity: "25.5",
  captainName: "Rabe",
  captainPhone: "0340000000",
  captainEmail: "",
  originDepartureDate: "2026-10-01",
  arrivalDate: "2026-10-03",
  departureDate: "",
  products: [{ productId: "type-1", productType: "Thon", quantity: "10.250", unitPrice: "1" }],
};

function storedDeclaration(overrides: Record<string, unknown> = {}) {
  return {
    id: "declaration-1",
    maritimeUserId: "boat-profile-1",
    companyName: "Société Océan",
    boatName: "Makoa",
    boatRegistration: "MA-102",
    boatCapacity: "25.500",
    captainName: "Rabe",
    captainPhone: "0340000000",
    captainEmail: null,
    originDepartureDate: new Date("2026-10-01T00:00:00.000Z"),
    arrivalDate: new Date("2026-10-03T00:00:00.000Z"),
    departureDate: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    products: [
      {
        id: "line-1",
        productType: "Thon",
        quantity: "10.250",
        unitPrice: "1250.50",
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        updatedAt: new Date("2026-10-01T00:00:00.000Z"),
      },
    ],
    ...overrides,
  };
}

const post = (body: unknown) => completeOnboarding(jsonRequest("/api/maritime/onboarding", "POST", body));

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(COMPANY_USER);
  db.maritimeUser.findUnique.mockResolvedValue({
    id: COMPANY_PROFILE_ID,
    companyName: "Société Océan",
    latitude: null,
    longitude: null,
    onboardingComplete: false,
  });
  db.maritimeProductType.findMany.mockResolvedValue([
    { id: "type-1", name: "Thon", unitPrice: "1250.50" },
  ]);
  db.user.create.mockResolvedValue({ id: "boat-user-1" });
  db.maritimeUser.create.mockResolvedValue({ id: "boat-profile-1" });
  db.maritimeDeclaration.create.mockResolvedValue(storedDeclaration());
});

describe("première connexion maritime : création du compte bateau", () => {
  it("crée un compte bateau distinct, relié à la société, avec ses propres identifiants", async () => {
    const { status, body } = await read(await post(payload));

    expect(status).toBe(201);

    const userData = db.user.create.mock.calls[0][0].data;
    expect(userData).toMatchObject({
      firstName: "Société Océan",
      lastName: "Makoa",
      email: "bateau@example.mg",
      role: "USER_MAR",
    });
    expect(userData.passwordHash).not.toBe(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, userData.passwordHash)).toBe(true);

    expect(db.maritimeUser.create.mock.calls[0][0].data).toMatchObject({
      userId: "boat-user-1",
      loginId: "bateau@example.mg",
      contactPhone: "+261 34 00 000 00",
      companyName: "Société Océan",
      onboardingComplete: true,
      companyAccountId: COMPANY_PROFILE_ID,
    });
    expect(body.login).toEqual({ email: "bateau@example.mg", phone: "+261 34 00 000 00" });
    expect(JSON.stringify(body)).not.toContain(PASSWORD);
  });

  it("rattache le passage et ses produits au compte bateau, au prix officiel du catalogue", async () => {
    await post(payload);

    const declarationData = db.maritimeDeclaration.create.mock.calls[0][0].data;
    expect(declarationData.maritimeUserId).toBe("boat-profile-1");
    expect(declarationData.products.create).toEqual([
      { productTypeId: "type-1", productType: "Thon", quantity: "10.250", unitPrice: "1250.50" },
    ]);
  });

  it("ferme le compte société et invalide sa session, sans toucher au compte bateau", async () => {
    const { body } = await read(await post(payload));

    const companyUpdate = db.user.update.mock.calls.find((call) => call[0].where.id === COMPANY_USER.id);
    expect(companyUpdate?.[0].data).toMatchObject({ isActive: false, sessionVersion: { increment: 1 } });
    expect(db.user.update.mock.calls.some((call) => call[0].where.id === "boat-user-1")).toBe(false);
    expect(body.accountDeactivated).toBe(false);

    const audits = auditEntries(db);
    expect(audits.some((entry) => entry.action === "DEACTIVATE" && entry.details?.reason === "BOAT_ACCOUNT_CREATED")).toBe(true);
    expect(audits.some((entry) => entry.entityType === "MaritimeUser" && entry.action === "CREATE")).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(PASSWORD);
  });

  it("ferme aussi le compte bateau si une date de sortie est renseignée", async () => {
    db.maritimeDeclaration.create.mockResolvedValue(
      storedDeclaration({ departureDate: new Date("2026-10-05T00:00:00.000Z") }),
    );

    const { status, body } = await read(await post({ ...payload, departureDate: "2026-10-05" }));

    expect(status).toBe(201);
    expect(body.accountDeactivated).toBe(true);
    expect(db.user.update.mock.calls.some((call) => call[0].where.id === "boat-user-1" && call[0].data.isActive === false)).toBe(true);
    expect(auditEntries(db).some((entry) => entry.details?.reason === "EXIT_DATE")).toBe(true);
  });
});

describe("première connexion maritime : refus", () => {
  it("refuse un mot de passe trop court ou non confirmé sans rien créer", async () => {
    expect((await post({ ...payload, password: "court", passwordConfirm: "court" })).status).toBe(400);
    expect((await post({ ...payload, passwordConfirm: "autre-mot-de-passe-12" })).status).toBe(400);

    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.maritimeUser.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuse un produit du catalogue introuvable ou désactivé", async () => {
    db.maritimeProductType.findMany.mockResolvedValue([]);

    const { status, body } = await read(await post(payload));

    expect(status).toBe(400);
    expect(body.message).toBe("Un produit maritime sélectionné est introuvable ou désactivé.");
  });

  it("refuse les visiteurs, les autres rôles et un compte société déjà utilisé", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await post(payload)).status).toBe(401);

    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
    expect((await post(payload)).status).toBe(403);

    vi.mocked(getCurrentUser).mockResolvedValue(COMPANY_USER);
    db.maritimeUser.findUnique.mockResolvedValue({
      id: COMPANY_PROFILE_ID,
      companyName: "Société Océan",
      latitude: null,
      longitude: null,
      onboardingComplete: true,
    });
    expect((await post(payload)).status).toBe(409);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("signale un email ou un téléphone déjà associé à un compte", async () => {
    db.user.create.mockRejectedValue({ code: "P2002" });

    const { status, body } = await read(await post(payload));

    expect(status).toBe(409);
    expect(body.message).toBe("Cet email ou ce téléphone est déjà associé à un compte.");
  });
});
