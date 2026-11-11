import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "@/app/api/passages/[id]/route";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR, jsonRequest, read } from "../helpers/http";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;
const current = {
  id: "pass-1",
  productId: "product-1",
  locationId: "location-1",
  assignedAt: new Date("2026-10-30T12:00:00.000Z"),
  origin: "Antsirabe",
  destination: "Toamasina",
  dateQuittance: null,
  driverName: "Jean",
  vehicleRegistration: "1234 TAA",
  vehicleCharacteristics: "Camion benne",
  driverLicenseNumber: "PER-123",
  deletedAt: null,
  product: { id: "product-1", name: "Riz", type: "Céréale", tonnage: "8.00", description: null, deletedAt: null },
  payment: {
    id: "payment-1", paymentMethod: "CASH", reference: null,
    amountDue: "40000.00", deletedAt: null,
  },
};
const valid = {
  assignedAt: "2026-10-30",
  productName: "Riz blanc",
  productType: "Céréale",
  tonnage: "9",
  origin: "Antsirabe",
  destination: "Toamasina",
  driverName: "Jean Rakoto",
  vehicleRegistration: "1234 TAA",
  vehicleCharacteristics: "Camion benne blanc",
  driverLicenseNumber: "PER-123",
  paymentMethod: "CASH",
  reference: "",
  amountDue: "45000",
  dateQuittance: "2026-10-15",
};
const context = { params: Promise.resolve({ id: "pass-1" }) };

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
  db.supervisor.findUnique.mockResolvedValue({ id: "supervisor-1", locationId: "location-1" });
  db.passage.findUnique.mockResolvedValue(current);
  db.location.findMany.mockResolvedValue([{ name: "Antsirabe" }, { name: "Toamasina" }]);
  db.recordRevision.findFirst.mockResolvedValue({ version: 1 });
});

describe("gestion des passages par les régisseurs", () => {
  it("modifie le passage, le produit et le paiement en créant une version", async () => {
    db.passage.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({ ...current, origin: "Antsirabe centre", product: { ...current.product, name: "Riz blanc" } });

    const response = await PATCH(
      jsonRequest("/api/passages/pass-1", "PATCH", valid),
      context,
    );
    expect((await read(response)).status).toBe(200);
    expect(db.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "product-1" },
      data: expect.objectContaining({ name: "Riz blanc", tonnage: "9" }),
    }));
    expect(db.passage.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pass-1" },
      data: expect.objectContaining({
        origin: "Antsirabe", vehicleRegistration: "1234 TAA",
        dateQuittance: new Date("2026-10-15T00:00:00.000Z"),
      }),
    }));
    expect(db.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "payment-1" },
      data: expect.objectContaining({ amountDue: "45000.00" }),
    }));
    expect(db.recordRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityType: "Passage", entityId: "pass-1", version: 2, action: "UPDATE",
        snapshot: expect.objectContaining({ before: expect.any(Object), after: expect.any(Object) }),
      }),
    }));
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  it("accepte de passer un paiement à Mobile Money avec référence", async () => {
    db.passage.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current);
    const response = await PATCH(
      jsonRequest("/api/passages/pass-1", "PATCH", {
        ...valid, paymentMethod: "MOBILE_MONEY", reference: "MVOLA-9",
      }),
      context,
    );
    expect((await read(response)).status).toBe(200);
    expect(db.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentMethod: "MOBILE_MONEY", reference: "MVOLA-9" }),
    }));
  });

  it("accepte de passer un paiement par chèque avec référence", async () => {
    db.passage.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current);
    const response = await PATCH(
      jsonRequest("/api/passages/pass-1", "PATCH", {
        ...valid, paymentMethod: "CHECK", reference: "CHQ-9",
      }),
      context,
    );
    expect((await read(response)).status).toBe(200);
    expect(db.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentMethod: "CHECK", reference: "CHQ-9" }),
    }));
  });

  it("refuse un paiement par chèque sans référence", async () => {
    const response = await PATCH(
      jsonRequest("/api/passages/pass-1", "PATCH", {
        ...valid, paymentMethod: "CHECK", reference: "",
      }),
      context,
    );
    expect((await read(response)).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.payment.update).not.toHaveBeenCalled();
  });

  it.each(["vehicleRegistration", "vehicleCharacteristics", "driverName", "driverLicenseNumber"])(
    "refuse de modifier un passage sans %s",
    async (field) => {
      const response = await PATCH(
        jsonRequest("/api/passages/pass-1", "PATCH", { ...valid, [field]: " " }),
        context,
      );
      expect((await read(response)).status).toBe(400);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it("conserve un lieu historique inchangé même s'il n'est plus actif", async () => {
    db.location.findMany.mockResolvedValue([]);
    const response = await PATCH(jsonRequest("/api/passages/pass-1", "PATCH", valid), context);
    expect((await read(response)).status).toBe(200);
  });

  it("accepte des lieux de départ et d'arrivée librement saisis", async () => {
    db.passage.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({ ...current, origin: "Point non répertorié", destination: "Quai privé" });
    const response = await PATCH(
      jsonRequest("/api/passages/pass-1", "PATCH", {
        ...valid, origin: "Point non répertorié", destination: "Quai privé",
        nomOp: "Opérateur Gamma", nomSoc: "Société Delta", coli: "Cartons",
        nbColi: "12", nQuittance: "QT-12",
      }),
      context,
    );
    expect((await read(response)).status).toBe(200);
    expect(db.passage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        origin: "Point non répertorié", destination: "Quai privé",
        nomOp: "Opérateur Gamma", nomSoc: "Société Delta", coli: "Cartons",
        nbColi: 12, nQuittance: "QT-12",
        dateQuittance: new Date("2026-10-15T00:00:00.000Z"),
      }),
    }));
    expect(db.location.findMany).not.toHaveBeenCalled();
  });

  it("refuse une date de quittance invalide à la modification", async () => {
    const response = await PATCH(
      jsonRequest("/api/passages/pass-1", "PATCH", { ...valid, dateQuittance: "2026-13-01" }),
      context,
    );
    expect((await read(response)).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("permet d'effacer la date de quittance", async () => {
    const response = await PATCH(
      jsonRequest("/api/passages/pass-1", "PATCH", { ...valid, dateQuittance: "" }),
      context,
    );
    expect((await read(response)).status).toBe(200);
    expect(db.passage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dateQuittance: null }),
    }));
  });

  it.each(["BANK_TRANSFER", "OTHER", "BITCOIN"])(
    "refuse une requête forgée qui réintroduit %s à la modification",
    async (paymentMethod) => {
      const response = await PATCH(
        jsonRequest("/api/passages/pass-1", "PATCH", {
          ...valid, paymentMethod, reference: "REF-1",
        }),
        context,
      );
      expect((await read(response)).status).toBe(400);
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(db.payment.update).not.toHaveBeenCalled();
    },
  );

  it("supprime logiquement le passage, le produit et le paiement", async () => {
    const response = await DELETE(
      new Request("https://demo.test/api/passages/pass-1", { method: "DELETE" }),
      context,
    );
    expect((await read(response)).status).toBe(200);
    expect(db.passage.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pass-1" },
      data: expect.objectContaining({ deletedById: SUPERVISOR.id, deletedAt: expect.any(Date) }),
    }));
    expect(db.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "product-1" },
      data: expect.objectContaining({ deletedById: SUPERVISOR.id, deletedAt: expect.any(Date) }),
    }));
    expect(db.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "payment-1" },
      data: expect.objectContaining({ deletedById: SUPERVISOR.id, deletedAt: expect.any(Date) }),
    }));
    expect(db.recordRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "DELETE", entityType: "Passage", entityId: "pass-1" }),
    }));
  });

  it("refuse les modifications et suppressions à l'administrateur", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
    const update = await PATCH(jsonRequest("/api/passages/pass-1", "PATCH", valid), context);
    const remove = await DELETE(
      new Request("https://demo.test/api/passages/pass-1", { method: "DELETE" }),
      context,
    );
    expect((await read(update)).status).toBe(403);
    expect((await read(remove)).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuse à un régisseur de modifier un passage situé dans un autre lieu", async () => {
    db.passage.findUnique.mockResolvedValue({ ...current, locationId: "location-2" });
    const response = await PATCH(jsonRequest("/api/passages/pass-1", "PATCH", valid), context);
    expect((await read(response)).status).toBe(404);
    expect(db.product.update).not.toHaveBeenCalled();
  });
});
