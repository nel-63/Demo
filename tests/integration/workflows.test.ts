import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buildAuditWhere } from "@/lib/audit";
import { POST as createTransport } from "@/app/api/transports/route";
import { PATCH as patchTransport } from "@/app/api/transports/[id]/route";
import { POST as createPayment } from "@/app/api/payments/route";
import { PUT as updateVehicle } from "@/app/api/vehicles/[id]/route";
import { PATCH as patchSupervisor } from "@/app/api/supervisors/[id]/route";
import { POST as resetPassword } from "@/app/api/supervisors/[id]/password/route";
import { assertTestDatabase, resetDatabase, seed } from "./setup";
import { jsonRequest, params } from "../helpers/http";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

type World = Awaited<ReturnType<typeof seed>>;
let w: World;

const as = (user: Awaited<ReturnType<typeof getCurrentUser>>) =>
  vi.mocked(getCurrentUser).mockResolvedValue(user);

async function newTransport(user: World["supA1"]["user"], vehicleId: string, amountDue = "40000") {
  as(user);
  const response = await createTransport(
    jsonRequest("/api/transports", "POST", {
      productName: "Riz",
      productType: "Céréale",
      tonnage: "2.5",
      amountDue,
      vehicleId,
    }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { transport: { id: string } }).transport.id;
}

const pay = (assignmentId: string, body: Record<string, unknown> = {}) =>
  createPayment(
    jsonRequest("/api/payments", "POST", {
      assignmentId,
      paymentMethod: "CASH",
      amountReceived: "40000",
      ...body,
    }),
  );

const setStatus = (id: string, status: string) =>
  patchTransport(jsonRequest(`/api/transports/${id}`, "PATCH", { status }), params(id));

beforeAll(() => assertTestDatabase());
afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await resetDatabase();
  w = await seed();
});

describe("historique après changement de chauffeur", () => {
  it("les anciens transports gardent leur chauffeur, les nouveaux prennent le nouveau", async () => {
    const oldTransport = await newTransport(w.supA1.user, w.vehicle.id);

    as(w.supA1.user);
    const response = await updateVehicle(
      jsonRequest(`/api/vehicles/${w.vehicle.id}`, "PUT", {
        vehicleType: "Camion",
        licensePlate: "1000 AAA",
        driverId: w.driver2.id,
      }),
      params(w.vehicle.id),
    );
    expect(response.status).toBe(200);

    const newTransportId = await newTransport(w.supA1.user, w.vehicle.id);

    const [oldRow, newRow, vehicle] = await Promise.all([
      prisma.transportAssignment.findUniqueOrThrow({ where: { id: oldTransport } }),
      prisma.transportAssignment.findUniqueOrThrow({ where: { id: newTransportId } }),
      prisma.vehicle.findUniqueOrThrow({ where: { id: w.vehicle.id } }),
    ]);

    expect(vehicle.driverId).toBe(w.driver2.id);
    expect(oldRow.driverId).toBe(w.driver1.id);
    expect(newRow.driverId).toBe(w.driver2.id);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "CHANGE_DRIVER" } });
    expect(log.details).toMatchObject({ previousDriverId: w.driver1.id, newDriverId: w.driver2.id });
  });

  it("refuse un chauffeur inactif ou d'un autre lieu et ne change rien", async () => {
    as(w.supA1.user);

    for (const driverId of [w.driverInactive.id, w.driverB.id]) {
      const response = await updateVehicle(
        jsonRequest(`/api/vehicles/${w.vehicle.id}`, "PUT", {
          vehicleType: "Camion",
          licensePlate: "1000 AAA",
          driverId,
        }),
        params(w.vehicle.id),
      );
      expect(response.status).toBe(403);
    }

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: w.vehicle.id } });
    expect(vehicle.driverId).toBe(w.driver1.id);
  });
});

describe("isolation des lieux", () => {
  it("deux régisseurs du même lieu partagent les transports", async () => {
    const id = await newTransport(w.supA1.user, w.vehicle.id);
    as(w.supA2.user);
    expect((await setStatus(id, "IN_PROGRESS")).status).toBe(200);
  });

  it("un régisseur d'un autre lieu ne peut ni modifier, ni payer, ni changer le véhicule", async () => {
    const id = await newTransport(w.supA1.user, w.vehicle.id);
    as(w.supB.user);

    expect((await setStatus(id, "IN_PROGRESS")).status).toBe(404);
    expect((await pay(id)).status).toBe(404);

    const response = await updateVehicle(
      jsonRequest(`/api/vehicles/${w.vehicle.id}`, "PUT", { vehicleType: "Pirate", licensePlate: "HACK" }),
      params(w.vehicle.id),
    );
    expect(response.status).toBe(404);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: w.vehicle.id } })).vehicleType).toBe("Camion");
  });
});

describe("paiements et concurrence", () => {
  it("deux paiements simultanés du même transport : un seul est enregistré", async () => {
    const id = await newTransport(w.supA1.user, w.vehicle.id);
    as(w.supA1.user);

    const results = await Promise.all([pay(id), pay(id), pay(id)]);
    const statuses = results.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 409, 409]);
    expect(await prisma.payment.count({ where: { assignmentId: id } })).toBe(1);
  });

  it("paiement espèces avec monnaie rendue, audit complet", async () => {
    const id = await newTransport(w.supA1.user, w.vehicle.id);
    as(w.supA1.user);

    const response = await pay(id, { amountReceived: "50000" });
    expect(response.status).toBe(201);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { assignmentId: id } });
    expect(String(payment.amountDue)).toBe("40000");
    expect(String(payment.changeReturned)).toBe("10000");

    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityType: "Payment" } });
    expect(log.details).toMatchObject({
      paymentMethod: "CASH",
      amountDue: "40000",
      amountReceived: "50000",
      changeReturned: "10000",
    });
  });

  it("paiement et annulation simultanés : jamais un transport à la fois payé et annulé", async () => {
    for (let round = 0; round < 8; round += 1) {
      const id = await newTransport(w.supA1.user, w.vehicle.id);
      as(w.supA1.user);

      await Promise.all([pay(id), setStatus(id, "CANCELLED")]);

      const row = await prisma.transportAssignment.findUniqueOrThrow({
        where: { id },
        include: { payment: true },
      });
      expect(row.status === "CANCELLED" && row.payment !== null).toBe(false);
    }
  });

  it("un transport annulé ne peut plus être payé ; un transport payé ne peut plus être annulé", async () => {
    const cancelled = await newTransport(w.supA1.user, w.vehicle.id);
    const paid = await newTransport(w.supA1.user, w.vehicle.id);
    as(w.supA1.user);

    expect((await setStatus(cancelled, "CANCELLED")).status).toBe(200);
    expect((await pay(cancelled)).status).toBe(404);

    expect((await pay(paid)).status).toBe(201);
    expect((await setStatus(paid, "CANCELLED")).status).toBe(409);
    expect((await pay(paid)).status).toBe(409);
  });

  it("un paiement non liquide incomplet est refusé", async () => {
    const id = await newTransport(w.supA1.user, w.vehicle.id);
    as(w.supA1.user);

    const response = await pay(id, {
      paymentMethod: "BANK_TRANSFER",
      reference: "VIR-1",
      amountReceived: "39999.99",
    });
    expect(response.status).toBe(400);
    expect(await prisma.payment.count()).toBe(0);
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

  it("réinitialisation : nouveau hash, sessions fermées, blocage de connexion levé, rien de secret dans l'audit", async () => {
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
    const id = await newTransport(w.supA1.user, w.vehicle.id);
    as(w.supA1.user);
    await pay(id, { amountReceived: "50000" });

    const filters = [
      { q: "", entityType: "", action: "", period: "" },
      { q: "", entityType: "Payment", action: "CREATE", period: "today" },
      { q: "A1 test", entityType: "", action: "", period: "30d" },
      { q: "a1@TEST.mg", entityType: "", action: "", period: "7d" },
    ];

    const counts = [];
    for (const filter of filters) {
      counts.push(await prisma.auditLog.count({ where: buildAuditWhere(filter) }));
    }

    expect(counts[0]).toBeGreaterThanOrEqual(2);
    expect(counts[1]).toBe(1);
    expect(counts[2]).toBeGreaterThanOrEqual(2);
    expect(counts[3]).toBeGreaterThanOrEqual(2);
    expect(await prisma.auditLog.count({ where: buildAuditWhere({ q: "personne-inconnue", entityType: "", action: "", period: "" }) })).toBe(0);
  });
});
