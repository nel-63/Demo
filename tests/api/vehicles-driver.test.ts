import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/vehicles/[id]/route";
import { POST as createTransport } from "@/app/api/transports/route";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { auditEntries, resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR, jsonRequest, params, read } from "../helpers/http";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;

const base = { vehicleType: "Camion", licensePlate: "1234 taa" };

function put(body: Record<string, unknown>) {
  return PUT(jsonRequest("/api/vehicles/v1", "PUT", { ...base, ...body }), params("v1"));
}

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
  db.supervisor.findUnique.mockResolvedValue({ id: "sup-1", locationId: "loc-1" });
  db.vehicle.findFirst.mockResolvedValue({
    id: "v1",
    driverId: "d-old",
    driver: { firstName: "Jean", lastName: "Rakoto" },
  });
  db.vehicle.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "v1",
    ...data,
    driver: { firstName: "X", lastName: "Y" },
  }));
});

describe("changement de chauffeur d'un véhicule", () => {
  it("affecte un chauffeur actif du même lieu et journalise l'ancien et le nouveau", async () => {
    db.driver.findFirst.mockResolvedValue({ id: "d-new", firstName: "Paul", lastName: "Rabe" });
    const { status } = await read(await put({ driverId: "d-new" }));

    expect(status).toBe(200);
    expect(db.driver.findFirst.mock.calls[0][0].where).toEqual({
      id: "d-new",
      locationId: "loc-1",
      isActive: true,
    });
    expect(db.vehicle.update.mock.calls[0][0].data).toMatchObject({
      licensePlate: "1234 TAA",
      driverId: "d-new",
    });

    const actions = auditEntries(db).map((entry) => entry.action);
    expect(actions).toEqual(["UPDATE", "CHANGE_DRIVER"]);
    expect(auditEntries(db)[1].details).toMatchObject({
      previousDriverId: "d-old",
      previousDriverName: "Jean Rakoto",
      newDriverId: "d-new",
      newDriverName: "Paul Rabe",
      historyPreserved: true,
    });
  });

  it("refuse un chauffeur inactif ou d'un autre lieu", async () => {
    db.driver.findFirst.mockResolvedValue(null);
    const { status } = await read(await put({ driverId: "d-inactif" }));

    expect(status).toBe(403);
    expect(db.vehicle.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("ne change rien quand on renvoie le chauffeur actuel (même s'il est devenu inactif)", async () => {
    const { status } = await read(await put({ driverId: "d-old" }));

    expect(status).toBe(200);
    expect(db.driver.findFirst).not.toHaveBeenCalled();
    expect(db.vehicle.update.mock.calls[0][0].data).not.toHaveProperty("driverId");
    expect(auditEntries(db).map((entry) => entry.action)).toEqual(["UPDATE"]);
  });

  it("garde le chauffeur quand driverId est absent", async () => {
    const { status } = await read(await put({}));

    expect(status).toBe(200);
    expect(db.vehicle.update.mock.calls[0][0].data).not.toHaveProperty("driverId");
  });

  it("ne trouve pas un véhicule d'un autre lieu", async () => {
    db.vehicle.findFirst.mockResolvedValue(null);
    expect((await read(await put({ driverId: "d-new" }))).status).toBe(404);
    expect(db.vehicle.findFirst.mock.calls[0][0].where).toEqual({ id: "v1", locationId: "loc-1" });
  });

  it("garde le contrôle des immatriculations en double", async () => {
    db.vehicle.update.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    expect((await read(await put({}))).status).toBe(409);
  });

  it("verrouille le véhicule pendant le changement", async () => {
    await put({});
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("refuse l'administrateur et l'utilisateur non connecté", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
    expect((await read(await put({ driverId: "d-new" }))).status).toBe(403);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await read(await put({ driverId: "d-new" }))).status).toBe(401);
    expect(db.vehicle.update).not.toHaveBeenCalled();
  });
});

describe("historique des transports après un changement de chauffeur", () => {
  const transportBody = {
    productName: "Riz",
    productType: "Céréale",
    tonnage: "2.5",
    amountDue: "40000",
    vehicleId: "v1",
  };

  beforeEach(() => {
    db.product.create.mockResolvedValue({ id: "p1" });
  });

  it("un nouveau transport mémorise le chauffeur du véhicule à cet instant", async () => {
    db.vehicle.findFirst.mockResolvedValue({ id: "v1", driverId: "d-current" });
    db.transportAssignment.create.mockResolvedValue({
      id: "t1",
      assignedAt: new Date(),
      status: "PLANNED",
      amountDue: "40000.00",
      product: { name: "Riz", type: "Céréale", tonnage: "2.50" },
      vehicle: { licensePlate: "1234 TAA" },
    });

    const { status } = await read(await createTransport(jsonRequest("/api/transports", "POST", transportBody)));

    expect(status).toBe(201);
    expect(db.transportAssignment.create.mock.calls[0][0].data).toMatchObject({
      vehicleId: "v1",
      driverId: "d-current",
    });
  });

  it("refuse un véhicule inactif ou dont le chauffeur est inactif", async () => {
    db.vehicle.findFirst.mockResolvedValue(null);
    const { status } = await read(await createTransport(jsonRequest("/api/transports", "POST", transportBody)));

    expect(status).toBe(403);
    expect(db.vehicle.findFirst.mock.calls[0][0].where).toMatchObject({
      isActive: true,
      driver: { isActive: true },
    });
    expect(db.transportAssignment.create).not.toHaveBeenCalled();
  });
});
