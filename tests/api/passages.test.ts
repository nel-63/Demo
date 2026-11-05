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
  productType: "Agricole",
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
  db.supervisor.findUnique.mockResolvedValue({
    id: "sup-1",
    locationId: "loc-1",
    assignedLocation: { deletedAt: null },
  });
  db.location.findMany.mockResolvedValue([{ name: "Antsirabe" }, { name: "Toamasina" }]);
  db.product.create.mockResolvedValue({ id: "prod-1" });
  db.passage.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "pas-1",
    assignedAt: new Date("2026-10-29T12:00:00Z"),
    origin: data.origin,
    destination: data.destination,
    product: { name: "Riz blanc", type: "Agricole", tonnage: "8.50" },
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

  it("accepte des lieux de départ et d'arrivée libres, même inconnus de la table Location", async () => {
    db.location.findMany.mockResolvedValue([{ name: "Lieu existant uniquement" }]);
    const { status } = await read(await send({
      origin: "Point de chargement non répertorié",
      destination: "Zone industrielle - quai 4",
    }));
    expect(status).toBe(201);
    expect(created()).toMatchObject({
      origin: "Point de chargement non répertorié",
      destination: "Zone industrielle - quai 4",
    });
    expect(db.location.findMany).not.toHaveBeenCalled();
  });

  it("accepte une image PNG envoyée en multipart et la stocke en binaire", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(valid)) form.set(key, value);
    form.set("pjt", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" }), "ticket.png");
    const response = await POST(new Request("https://demo.test/api/passages", { method: "POST", body: form }));
    expect((await read(response)).status).toBe(201);
    expect(created().pjt).toBeInstanceOf(Uint8Array);
    expect(created().quittance).toBeNull();
  });

  it("rejette un fichier joint dont la signature ne correspond pas à une image autorisée", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(valid)) form.set(key, value);
    form.set("pjt", new Blob(["not an image"], { type: "image/png" }), "ticket.png");
    const response = await POST(new Request("https://demo.test/api/passages", { method: "POST", body: form }));
    expect((await read(response)).status).toBe(400);
    nothingWritten();
  });

  it("enregistre les nouvelles informations dans le passage et sa première révision", async () => {
    const { status } = await read(await send({
      nomOp: "Opérateur Alpha",
      nomSoc: "Société Bêta",
      coli: "Sacs de 50 kg",
      nbColi: "24",
      nQuittance: "Q-2026-0042",
      dateQuittance: "2026-10-15",
    }));
    expect(status).toBe(201);
    expect(created()).toMatchObject({
      nomOp: "Opérateur Alpha",
      nomSoc: "Société Bêta",
      coli: "Sacs de 50 kg",
      nbColi: 24,
      nQuittance: "Q-2026-0042",
      dateQuittance: new Date("2026-10-15T00:00:00.000Z"),
    });
    expect(db.recordRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        snapshot: expect.objectContaining({
          passage: expect.objectContaining({
            nomOp: "Opérateur Alpha",
            nomSoc: "Société Bêta",
            coli: "Sacs de 50 kg",
            nbColi: 24,
            nQuittance: "Q-2026-0042",
            dateQuittance: "2026-10-15",
          }),
        }),
      }),
    }));
  });

  it("Mobile Money exact avec référence", async () => {
    const { status } = await read(
      await send({ paymentMethod: "MOBILE_MONEY", reference: "MVOLA-1", amountReceived: "40000" }),
    );
    expect(status).toBe(201);
    expect(created().payment).toMatchObject({
      create: { paymentMethod: "MOBILE_MONEY", reference: "MVOLA-1", changeReturned: "0.00" },
    });
  });

  it("accepte un chèque avec montant exact et référence", async () => {
    const { status } = await read(
      await send({ paymentMethod: "CHECK", reference: "CHQ-1", amountReceived: "40000" }),
    );
    expect(status).toBe(201);
    expect(created().payment).toMatchObject({
      create: { paymentMethod: "CHECK", reference: "CHQ-1", changeReturned: "0.00" },
    });
  });

  it.each([
    ["virement bancaire", "BANK_TRANSFER"],
    ["autre", "OTHER"],
    ["valeur inconnue", "BITCOIN"],
    ["valeur vide", ""],
    ["casse différente", "cash"],
  ])("refuse côté serveur un nouveau paiement par %s", async (_label, paymentMethod) => {
    const { status } = await read(
      await send({ paymentMethod, reference: "REF-1", amountReceived: "40000" }),
    );
    expect(status).toBe(400);
    nothingWritten();
  });

  it.each([
    ["espèces insuffisantes", { amountReceived: "39999.99" }],
    ["Mobile Money sans référence", { paymentMethod: "MOBILE_MONEY", amountReceived: "40000" }],
    ["Mobile Money supérieur au montant", { paymentMethod: "MOBILE_MONEY", reference: "R", amountReceived: "40001" }],
    ["Mobile Money inférieur au montant", { paymentMethod: "MOBILE_MONEY", reference: "R", amountReceived: "30000" }],
    ["chèque sans référence", { paymentMethod: "CHECK", amountReceived: "40000" }],
    ["chèque supérieur au montant", { paymentMethod: "CHECK", reference: "CHQ-1", amountReceived: "40001" }],
    ["chèque inférieur au montant", { paymentMethod: "CHECK", reference: "CHQ-1", amountReceived: "39999" }],
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
    ["catégorie non autorisée", { productType: "Céréale" }],
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
    ["nombre de colis décimal", { nbColi: "2.5" }],
    ["nombre de colis négatif", { nbColi: "-1" }],
  ])("refuse : %s", async (_label, body) => {
    expect((await read(await send(body))).status).toBe(400);
    nothingWritten();
  });

  it("ne limite pas l'origine et la destination aux lieux présents dans Location", async () => {
    db.location.findMany.mockResolvedValue([{ name: "Lieu différent" }]);
    const { status } = await read(await send({ origin: "Départ libre", destination: "Arrivée libre" }));
    expect(status).toBe(201);
    expect(created()).toMatchObject({ origin: "Départ libre", destination: "Arrivée libre" });
    expect(db.location.findMany).not.toHaveBeenCalled();
  });

  it("refuse un passage depuis un lieu archivé", async () => {
    db.supervisor.findUnique.mockResolvedValue({
      id: "sup-1",
      locationId: "loc-1",
      assignedLocation: { deletedAt: new Date() },
    });
    const { status } = await read(await send({}));
    expect(status).toBe(403);
    nothingWritten();
  });

  it("véhicule et chauffeur sont facultatifs", async () => {
    await send({});
    expect(created()).toMatchObject({ vehicleInfo: null, driverName: null });

    resetFakePrisma(db);
    vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
    db.supervisor.findUnique.mockResolvedValue({
      id: "sup-1",
      locationId: "loc-1",
      assignedLocation: { deletedAt: null },
    });
    db.location.findMany.mockResolvedValue([{ name: "Antsirabe" }, { name: "Toamasina" }]);
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

  it("refuse une date de quittance qui n'existe pas", async () => {
    const { status } = await read(await send({ dateQuittance: "2026-02-30" }));
    expect(status).toBe(400);
    nothingWritten();
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
