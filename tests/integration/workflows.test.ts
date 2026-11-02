import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buildAuditWhere } from "@/lib/audit";
import { POST as createPassage } from "@/app/api/passages/route";
import { PATCH as patchSupervisor } from "@/app/api/supervisors/[id]/route";
import { POST as resetPassword } from "@/app/api/supervisors/[id]/password/route";
import { assertTestDatabase, resetDatabase, seed } from "./setup";
import { jsonRequest, params } from "../helpers/http";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

type World = Awaited<ReturnType<typeof seed>>;
let w: World;

const as = (user: Awaited<ReturnType<typeof getCurrentUser>>) =>
  vi.mocked(getCurrentUser).mockResolvedValue(user);

const passage = (body: Record<string, unknown> = {}) =>
  createPassage(
    jsonRequest("/api/passages", "POST", {
      productName: "Riz blanc",
      productType: "Céréale",
      tonnage: "8.5",
      origin: "Antsirabe",
      destination: "Toamasina",
      vehicleInfo: "Camion benne blanc",
      driverName: "Jean",
      amountDue: "40000",
      paymentMethod: "CASH",
      amountReceived: "40000",
      ...body,
    }),
  );

const counts = async () => ({
  products: await prisma.product.count(),
  passages: await prisma.passage.count(),
  payments: await prisma.payment.count(),
});

beforeAll(() => assertTestDatabase());
afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await resetDatabase();
  w = await seed();
});

describe("un passage n'existe qu'avec son paiement", () => {
  it("crée produit, passage, paiement et journal d'un seul coup", async () => {
    as(w.supA1.user);
    const response = await passage({ amountReceived: "50000" });
    expect(response.status).toBe(201);

    const row = await prisma.passage.findFirstOrThrow({
      include: { product: true, payment: true, assignedLocation: true },
    });
    expect(row).toMatchObject({
      origin: "Antsirabe",
      destination: "Toamasina",
      vehicleInfo: "Camion benne blanc",
      driverName: "Jean",
      supervisorId: w.supA1.profile.id,
      locationId: w.locA.id,
    });
    expect(row.assignedLocation?.name).toBe("Tana");
    expect(String(row.product.tonnage)).toBe("8.5");
    expect(row.payment).toMatchObject({ paymentMethod: "CASH", recordedById: w.supA1.user.id });
    expect(String(row.payment?.changeReturned)).toBe("10000");

    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(logs.map((log) => `${log.action} ${log.entityType}`).sort()).toEqual([
      "CREATE Passage",
      "CREATE Payment",
    ]);
    const paymentLog = logs.find((log) => log.entityType === "Payment");
    expect(paymentLog?.details).toMatchObject({ amountReceived: "50000.00", changeReturned: "10000.00" });
  });

  it("sans paiement valide, rien n'est enregistré (pas même le produit)", async () => {
    as(w.supA1.user);

    expect((await passage({ amountReceived: "39999" })).status).toBe(400);
    expect((await passage({ paymentMethod: "BANK_TRANSFER", reference: "" })).status).toBe(400);
    expect((await passage({ paymentMethod: "CHECK", reference: "C-1", amountReceived: "40001" })).status).toBe(400);

    expect(await counts()).toEqual({ products: 0, passages: 0, payments: 0 });
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("le passage est rattaché au lieu du régisseur qui l'enregistre", async () => {
    as(w.supA1.user);
    await passage({ productName: "Riz" });
    as(w.supB.user);
    await passage({ productName: "Sucre" });
    as(w.supA2.user);
    await passage({ productName: "Farine" });

    const rows = await prisma.passage.findMany({ include: { product: true } });
    const byProduct = Object.fromEntries(rows.map((r) => [r.product.name, r.locationId]));
    expect(byProduct).toEqual({ Riz: w.locA.id, Sucre: w.locB.id, Farine: w.locA.id });
  });

  it("ignore un lieu ou un régisseur envoyé dans la requête", async () => {
    as(w.supA1.user);
    await passage({ locationId: w.locB.id, supervisorId: w.supB.profile.id });
    const row = await prisma.passage.findFirstOrThrow();
    expect(row.locationId).toBe(w.locA.id);
    expect(row.supervisorId).toBe(w.supA1.profile.id);
  });

  it("des enregistrements simultanés créent chacun leur passage sans se mélanger", async () => {
    as(w.supA1.user);
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => passage({ productName: `Produit ${n}`, amountReceived: "45000" })),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(await counts()).toEqual({ products: 5, passages: 5, payments: 5 });
  });
});

describe("fiches : retrouver ce qui a été fait", () => {
  it("l'activité d'un régisseur et celle d'un lieu sont retrouvées dans le journal", async () => {
    as(w.supA1.user);
    await passage({ productName: "Riz" });
    as(w.supB.user);
    await passage({ productName: "Sucre" });

    // Ce que fait la fiche d'un régisseur
    const bySupervisor = await prisma.auditLog.findMany({ where: { userId: w.supA1.user.id } });
    expect(bySupervisor).toHaveLength(2);
    expect(bySupervisor.every((log) => log.userId === w.supA1.user.id)).toBe(true);

    // Ce que fait la fiche d'un lieu
    const inLocationA = await prisma.auditLog.findMany({
      where: { OR: [{ details: { path: ["locationId"], equals: w.locA.id } }, { entityType: "Location", entityId: w.locA.id }] },
    });
    expect(inLocationA).toHaveLength(2);
    const inLocationB = await prisma.auditLog.findMany({
      where: { details: { path: ["locationId"], equals: w.locB.id } },
    });
    expect(inLocationB).toHaveLength(2);

    const passagesOfA = await prisma.passage.count({ where: { supervisorId: w.supA1.profile.id } });
    expect(passagesOfA).toBe(1);
  });
});

describe("comptes régisseurs", () => {
  it("désactivation : compte inactif et sessions invalidées", async () => {
    as(w.admin);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: w.supA1.user.id } });

    const response = await patchSupervisor(
      jsonRequest(`/api/supervisors/${w.supA1.profile.id}`, "PATCH", { isActive: false }),
      params(w.supA1.profile.id),
    );
    expect(response.status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: w.supA1.user.id } });
    expect(after.isActive).toBe(false);
    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
    expect(await prisma.auditLog.count({ where: { action: "DEACTIVATE", entityId: w.supA1.profile.id } })).toBe(1);
  });

  it("désactiver un régisseur ne supprime rien de son historique", async () => {
    as(w.supA1.user);
    await passage();
    as(w.admin);
    await patchSupervisor(
      jsonRequest(`/api/supervisors/${w.supA1.profile.id}`, "PATCH", { isActive: false }),
      params(w.supA1.profile.id),
    );
    expect(await prisma.passage.count({ where: { supervisorId: w.supA1.profile.id } })).toBe(1);
  });

  it("réinitialisation : nouveau hash, sessions fermées, blocage levé, rien de secret dans l'audit", async () => {
    await prisma.loginFailure.create({ data: { email: "a1@test.mg", ipAddress: "1.2.3.4" } });
    as(w.admin);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: w.supA1.user.id } });
    const newPassword = "Nouveau-mot-de-passe-42";

    const response = await resetPassword(
      jsonRequest(`/api/supervisors/${w.supA1.profile.id}/password`, "POST", { password: newPassword }),
      params(w.supA1.profile.id),
    );
    expect(response.status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: w.supA1.user.id } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.passwordHash.startsWith("$2")).toBe(true);
    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
    expect(await prisma.loginFailure.count({ where: { email: "a1@test.mg" } })).toBe(0);

    const logs = await prisma.auditLog.findMany({ where: { action: "RESET_PASSWORD" } });
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0])).not.toContain(newPassword);
  });
});

describe("requêtes du journal d'audit", () => {
  it("les filtres de buildAuditWhere sont acceptés par la vraie base", async () => {
    as(w.supA1.user);
    await passage({ amountReceived: "50000" });

    const filters = [
      { q: "", entityType: "", action: "", period: "" },
      { q: "", entityType: "Payment", action: "CREATE", period: "today" },
      { q: "A1 test", entityType: "", action: "", period: "30d" },
      { q: "a1@TEST.mg", entityType: "", action: "", period: "7d" },
    ];
    const counts: number[] = [];
    for (const filter of filters) counts.push(await prisma.auditLog.count({ where: buildAuditWhere(filter) }));

    expect(counts[0]).toBe(2);
    expect(counts[1]).toBe(1);
    expect(counts[2]).toBe(2);
    expect(counts[3]).toBe(2);
    expect(await prisma.auditLog.count({ where: buildAuditWhere({ q: "inconnu", entityType: "", action: "", period: "" }) })).toBe(0);
  });
});
