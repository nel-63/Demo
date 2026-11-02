import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/passages/route";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { auditEntries, resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR, jsonRequest, read } from "../helpers/http";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;

const valid = {
  productName: "Riz blanc",
  productType: "Céréale",
  tonnage: "8.5",
  origin: "Antsirabe",
  destination: "Toamasina",
  amountDue: "40000",
  paymentMethod: "CASH",
  amountReceived: "40000",
};

const send = (body: Record<string, unknown>) =>
  POST(jsonRequest("/api/passages", "POST", { ...valid, ...body }));

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
  db.supervisor.findUnique.mockResolvedValue({ id: "sup-1", locationId: "loc-1" });
  db.product.create.mockResolvedValue({ id: "prod-1" });
  db.passage.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "pas-1",
    assignedAt: new Date("2026-10-29T12:00:00Z"),
    origin: data.origin,
    destination: data.destination,
    product: { name: "Riz blanc", type: "Céréale", tonnage: "8.50" },
    payment: { id: "pay-1", ...(data.payment as { create: Record<string, unknown> }).create },
  }));
});

const created = () => db.passage.create.mock.calls[0][0].data;
const nothingWritten = () => {
  expect(db.$transaction).not.toHaveBeenCalled();
  expect(db.passage.create).not.toHaveBeenCalled();
  expect(db.product.create).not.toHaveBeenCalled();
};

describe("accès", () => {
  it("refuse un utilisateur non connecté", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await read(await send({}))).status).toBe(401);
    nothingWritten();
  });

  it("refuse l'administrateur et les rôles non prévus", async () => {
    for (const user of [ADMIN, { ...SUPERVISOR, role: "CASHIER" as const }]) {
      vi.mocked(getCurrentUser).mockResolvedValue(user);
      expect((await read(await send({}))).status).toBe(403);
    }
    nothingWritten();
  });

  it("refuse un régisseur sans lieu", async () => {
    db.supervisor.findUnique.mockResolvedValue({ id: "sup-1", locationId: null });
    expect((await read(await send({}))).status).toBe(403);
    nothingWritten();
  });
});

describe("un passage n'existe qu'avec son paiement", () => {
  it("espèces avec monnaie : tout est créé ensemble", async () => {
    const { status } = await read(await send({ amountReceived: "50000" }));

    expect(status).toBe(201);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(created()).toMatchObject({
      productId: "prod-1",
      supervisorId: "sup-1",
      locationId: "loc-1",
      origin: "Antsirabe",
      destination: "Toamasina",
      payment: {
        create: {
          recordedById: SUPERVISOR.id,
          paymentMethod: "CASH",
          amountDue: "40000.00",
          amountReceived: "50000.00",
          changeReturned: "10000.00",
        },
      },
    });
  });

  it("virement exact avec référence", async () => {
    const { status } = await read(
      await send({ paymentMethod: "BANK_TRANSFER", reference: "VIR-1", amountReceived: "40000" }),
    );
    expect(status).toBe(201);
    expect(created().payment).toMatchObject({
      create: { paymentMethod: "BANK_TRANSFER", reference: "VIR-1", changeReturned: "0.00" },
    });
  });

  it.each([
    ["espèces insuffisantes", { amountReceived: "39999.99" }],
    ["virement sans référence", { paymentMethod: "BANK_TRANSFER", amountReceived: "40000" }],
    ["virement supérieur au montant", { paymentMethod: "MOBILE_MONEY", reference: "R", amountReceived: "40001" }],
    ["chèque incomplet", { paymentMethod: "CHECK", reference: "R", amountReceived: "30000" }],
  ])("sans paiement valide, pas de passage : %s", async (_label, body) => {
    const { status } = await read(await send(body));
    expect(status).toBe(400);
    nothingWritten();
  });

  it("si l'enregistrement échoue, rien n'est confirmé", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.passage.create.mockRejectedValue(new Error("base indisponible"));
    expect((await read(await send({}))).status).toBe(500);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("validation", () => {
  it.each(["productName", "productType", "tonnage", "origin", "destination"])(
    "refuse l'absence de %s",
    async (field) => {
      expect((await read(await send({ [field]: "" }))).status).toBe(400);
      nothingWritten();
    },
  );

  it.each([
    ["tonnage nul", { tonnage: "0" }],
    ["tonnage négatif", { tonnage: "-2" }],
    ["tonnage non numérique", { tonnage: "beaucoup" }],
    ["montant à payer nul", { amountDue: "0", amountReceived: "0" }],
    ["montant à payer à 3 décimales", { amountDue: "10.123" }],
    ["montant reçu absent", { amountReceived: "" }],
    ["mode inconnu", { paymentMethod: "BITCOIN" }],
    ["date invalide", { assignedAt: "2026-02-31" }],
    ["format de date invalide", { assignedAt: "29/10/2026" }],
    ["champ trop long", { origin: "x".repeat(151) }],
  ])("refuse : %s", async (_label, body) => {
    expect((await read(await send(body))).status).toBe(400);
    nothingWritten();
  });

  it("véhicule et chauffeur sont facultatifs", async () => {
    await send({});
    expect(created()).toMatchObject({ vehicleInfo: null, driverName: null });

    resetFakePrisma(db);
    vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
    db.supervisor.findUnique.mockResolvedValue({ id: "sup-1", locationId: "loc-1" });
    db.product.create.mockResolvedValue({ id: "prod-2" });
    db.passage.create.mockResolvedValue({ id: "p", assignedAt: new Date(), product: { tonnage: "1" }, payment: null });
    await send({ vehicleInfo: " Camion benne blanc ", driverName: " Jean " });
    expect(created()).toMatchObject({ vehicleInfo: "Camion benne blanc", driverName: "Jean" });
  });

  it("conserve les données du véhicule et du chauffeur dans le passage et sa première version", async () => {
    const { status } = await read(await send({
      vehicleRegistration: "1234 TAA",
      vehicleCharacteristics: "Camion benne blanc, 10 roues",
      driverName: "Jean Rakoto",
      driverLicenseNumber: "PER-123",
    }));
    expect(status).toBe(201);
    expect(created()).toMatchObject({
      vehicleRegistration: "1234 TAA",
      vehicleCharacteristics: "Camion benne blanc, 10 roues",
      driverName: "Jean Rakoto",
      driverLicenseNumber: "PER-123",
    });
    expect(db.recordRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityType: "Passage",
        version: 1,
        action: "CREATE",
        snapshot: expect.objectContaining({
          passage: expect.objectContaining({
            vehicleRegistration: "1234 TAA",
            vehicleCharacteristics: "Camion benne blanc, 10 roues",
            driverName: "Jean Rakoto",
            driverLicenseNumber: "PER-123",
          }),
        }),
      }),
    }));
  });

  it("utilise la date fournie", async () => {
    await send({ assignedAt: "2026-10-15" });
    expect(created().assignedAt).toEqual(new Date("2026-10-15T12:00:00.000Z"));
  });

  it("le lieu vient toujours du profil, jamais de la requête", async () => {
    await send({ locationId: "loc-pirate", supervisorId: "sup-pirate" });
    expect(created()).toMatchObject({ locationId: "loc-1", supervisorId: "sup-1" });
  });
});

describe("traçabilité", () => {
  it("journalise le passage (trajet) et le paiement (montants, mode)", async () => {
    await send({ amountReceived: "50000" });

    const entries = auditEntries(db);
    expect(entries.map((e) => `${e.action} ${e.entityType}`)).toEqual(["CREATE Passage", "CREATE Payment"]);
    expect(entries[0]).toMatchObject({
      userId: SUPERVISOR.id,
      entityId: "pas-1",
      details: { locationId: "loc-1", productName: "Riz blanc", origin: "Antsirabe", destination: "Toamasina" },
    });
    expect(entries[1].details).toMatchObject({
      passageId: "pas-1",
      paymentMethod: "CASH",
      amountDue: "40000.00",
      amountReceived: "50000.00",
      changeReturned: "10000.00",
    });
  });
});
