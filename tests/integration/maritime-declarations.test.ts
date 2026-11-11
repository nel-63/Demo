import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { POST as createDeclaration } from "@/app/api/maritime/declarations/route";
import { DELETE as deleteDeclaration } from "@/app/api/maritime/declarations/[id]/route";
import { POST as createMaritimeUser } from "@/app/api/maritime-users/route";
import { jsonRequest, params } from "../helpers/http";
import { assertTestDatabase, resetDatabase } from "./setup";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const payload = {
  companyName: "Société Océan",
  boatName: "Makoa",
  boatRegistration: "MA-102",
  boatCapacity: "25.5",
  captainName: "Rabe",
  captainPhone: "0340000000",
  captainEmail: "",
  originDepartureDate: "2026-10-01",
  arrivalDate: "2026-10-03",
  departureDate: "2026-10-05",
  products: [
    { productType: "Thon", quantity: "10.250", unitPrice: "1250.50" },
    { productType: "Crabe", quantity: "2.000", unitPrice: "0.25" },
  ],
};

let actorId = "";

beforeAll(() => assertTestDatabase());
afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await resetDatabase();
  const user = await prisma.user.create({
    data: {
      firstName: "Maritime",
      lastName: "Test",
      email: "maritime@test.mg",
      passwordHash: "unused",
      role: "USER_MAR",
    },
  });
  actorId = user.id;
  await prisma.maritimeUser.create({
    data: { userId: user.id, latitude: "-20.2833", longitude: "44.2833" },
  });
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: "USER_MAR",
    designation: null,
    isActive: true,
  });
});

describe("déclarations maritimes en PostgreSQL", () => {
  it("crée les lignes et l'audit en transaction, puis supprime les produits par cascade", async () => {
    const response = await createDeclaration(jsonRequest("/api/maritime/declarations", "POST", payload));
    expect(response.status).toBe(201);
    const result = await response.json() as { declaration: { id: string; total: string } };
    expect(result.declaration.total).toBe("12818.125");
    expect(await prisma.maritimeDeclaration.count()).toBe(1);
    expect(await prisma.maritimeDeclarationProduct.count()).toBe(2);
    expect(await prisma.auditLog.count({ where: { entityType: "MaritimeDeclaration", action: "CREATE" } })).toBe(1);

    const deleted = await deleteDeclaration(
      new Request(`http://localhost/api/maritime/declarations/${result.declaration.id}`, { method: "DELETE" }),
      params(result.declaration.id),
    );
    expect(deleted.status).toBe(200);
    expect(await prisma.maritimeDeclaration.count()).toBe(0);
    expect(await prisma.maritimeDeclarationProduct.count()).toBe(0);
    const deletionLog = await prisma.auditLog.findFirst({
      where: { entityType: "MaritimeDeclaration", action: "DELETE" },
    });
    expect(deletionLog?.userId).toBe(actorId);
    expect(deletionLog?.details).toMatchObject({
      before: { companyName: "Société Océan", products: [{ productType: "Thon" }, { productType: "Crabe" }] },
    });
  });

  describe("création de compte maritime en PostgreSQL", () => {
    async function signInAsAdmin() {
      const admin = await prisma.user.create({
        data: {
          firstName: "Ada",
          lastName: "Admin",
          email: "admin-maritime@test.mg",
          passwordHash: "unused",
          role: "ADMIN",
        },
      });
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: admin.id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: "ADMIN",
        designation: null,
        isActive: true,
      });
    }

    const account = {
      firstName: "Compte",
      lastName: "Maritime",
      email: "nouveau-maritime@test.mg",
      phoneNumber: "",
      password: "Mot-de-passe-maritime-42",
      latitude: "-20.283300",
      longitude: "44.283300",
    };

    it("crée réellement User, MaritimeUser et AuditLog en une transaction", async () => {
      await signInAsAdmin();
      const response = await createMaritimeUser(
        jsonRequest("/api/maritime-users", "POST", account),
      );

      expect(response.status).toBe(201);
      const user = await prisma.user.findUnique({ where: { email: account.email } });
      expect(user?.role).toBe("USER_MAR");
      const profile = await prisma.maritimeUser.findUnique({ where: { userId: user!.id } });
      expect(profile?.latitude.toString()).toBe("-20.2833");
      expect(profile?.longitude.toString()).toBe("44.2833");
      expect(await prisma.auditLog.count({
        where: { entityType: "MaritimeUser", entityId: profile!.id, action: "CREATE" },
      })).toBe(1);
    });

    it("annule aussi User et AuditLog si la création du profil maritime échoue", async () => {
      await signInAsAdmin();
      const initialUsers = await prisma.user.count();
      const initialProfiles = await prisma.maritimeUser.count();
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "MaritimeUser" ADD CONSTRAINT "test_maritime_user_create_failure" CHECK (false)`,
      );
      const logError = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        const response = await createMaritimeUser(
          jsonRequest("/api/maritime-users", "POST", {
            ...account,
            email: "rollback-maritime@test.mg",
          }),
        );
        expect(response.status).toBe(500);
        expect(await prisma.user.count()).toBe(initialUsers);
        expect(await prisma.maritimeUser.count()).toBe(initialProfiles);
        expect(await prisma.user.findUnique({ where: { email: "rollback-maritime@test.mg" } })).toBeNull();
        expect(await prisma.auditLog.count({ where: { entityType: "MaritimeUser", action: "CREATE" } })).toBe(0);
      } finally {
        logError.mockRestore();
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "MaritimeUser" DROP CONSTRAINT "test_maritime_user_create_failure"`,
        );
      }
    });
  });

  it("annule une déclaration et ses produits si une écriture liée échoue", async () => {
    const profile = await prisma.maritimeUser.findUniqueOrThrow({ where: { userId: actorId } });
    await expect(prisma.$transaction(async (tx) => {
      await tx.maritimeDeclaration.create({
        data: {
          maritimeUserId: profile.id,
          companyName: "Société annulée",
          boatName: "Bateau",
          boatRegistration: "MA-1",
          boatCapacity: "1",
          captainName: "Commandant",
          captainPhone: "0340000000",
          originDepartureDate: new Date("2026-10-01T00:00:00.000Z"),
          arrivalDate: new Date("2026-10-02T00:00:00.000Z"),
          departureDate: new Date("2026-10-03T00:00:00.000Z"),
          products: { create: [{ productType: "Thon", quantity: "1", unitPrice: "0" }] },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: "user-inexistant",
          action: "CREATE",
          entityType: "MaritimeDeclaration",
          details: {},
        },
      });
    })).rejects.toThrow();

    expect(await prisma.maritimeDeclaration.count()).toBe(0);
    expect(await prisma.maritimeDeclarationProduct.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });
});
