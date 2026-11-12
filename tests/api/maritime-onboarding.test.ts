import { beforeEach, describe, expect, it, vi } from "vitest";
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
const MARINER = { ...SUPERVISOR, id: "mariner-1", role: "USER_MAR" as const };
const payload = {
  contactEmail: "mariner@example.mg",
  contactPhone: "+261 34 00 000 00",
  boatName: "Makoa",
  boatRegistration: "MA-102",
  boatCapacity: "25.5",
  captainName: "Rabe",
  captainPhone: "0340000000",
  captainEmail: "",
  originDepartureDate: "2026-10-01",
  arrivalDate: "2026-10-03",
  departureDate: "",
};

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(MARINER);
  db.maritimeUser.findUnique.mockResolvedValue({
    id: "profile-1",
    companyName: "Société Océan",
    onboardingComplete: false,
  });
  db.maritimeDeclaration.create.mockResolvedValue({
    id: "declaration-1",
    maritimeUserId: "profile-1",
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
    products: [],
  });
});

describe("première connexion maritime", () => {
  it("enregistre les coordonnées et le bateau sans créer de produits", async () => {
    const { status, body } = await read(await completeOnboarding(
      jsonRequest("/api/maritime/onboarding", "POST", payload),
    ));

    expect(status).toBe(201);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: MARINER.id },
      data: { email: "mariner@example.mg", phoneNumber: "+261 34 00 000 00" },
    });
    expect(db.maritimeUser.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { contactPhone: "+261 34 00 000 00", onboardingComplete: true },
    });
    expect(db.maritimeDeclaration.create.mock.calls[0][0].data).not.toHaveProperty("products");
    expect((body.declaration as { products: unknown[] }).products).toEqual([]);
    expect(auditEntries(db)).toHaveLength(1);
    expect(body.accountDeactivated).toBe(false);
  });

  it("désactive le compte lors de l'enregistrement de la date de sortie", async () => {
    db.maritimeDeclaration.create.mockResolvedValue({
      id: "declaration-1",
      maritimeUserId: "profile-1",
      companyName: "Société Océan",
      boatName: "Makoa",
      boatRegistration: "MA-102",
      boatCapacity: "25.500",
      captainName: "Rabe",
      captainPhone: "0340000000",
      captainEmail: null,
      originDepartureDate: new Date("2026-10-01T00:00:00.000Z"),
      arrivalDate: new Date("2026-10-03T00:00:00.000Z"),
      departureDate: new Date("2026-10-05T00:00:00.000Z"),
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
      products: [],
    });

    const { status, body } = await read(await completeOnboarding(
      jsonRequest("/api/maritime/onboarding", "POST", {
        ...payload,
        departureDate: "2026-10-05",
      }),
    ));

    expect(status).toBe(201);
    expect(body.accountDeactivated).toBe(true);
    expect(db.user.update.mock.calls.some((call) =>
      (call[0].data as { isActive?: boolean }).isActive === false,
    )).toBe(true);
    expect(auditEntries(db).some((entry) => entry.details?.reason === "EXIT_DATE")).toBe(true);
  });

  it("refuses other roles and already completed profiles", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
    expect((await completeOnboarding(jsonRequest("/api/maritime/onboarding", "POST", payload))).status).toBe(403);

    vi.mocked(getCurrentUser).mockResolvedValue(MARINER);
    db.maritimeUser.findUnique.mockResolvedValue({
      id: "profile-1",
      companyName: "Société Océan",
      onboardingComplete: true,
    });
    expect((await completeOnboarding(jsonRequest("/api/maritime/onboarding", "POST", payload))).status).toBe(409);
  });
});
