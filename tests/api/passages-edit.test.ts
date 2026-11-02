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
  assignedAt: new Date("2026-10-30T12:00:00.000Z"),
  origin: "Antsirabe",
  destination: "Toamasina",
  vehicleInfo: null,
  driverName: "Jean",
  vehicleRegistration: "1234 TAA",
  vehicleCharacteristics: "Camion benne",
  driverLicenseNumber: "PER-123",
  notes: null,
  deletedAt: null,
  product: { id: "product-1", name: "Riz", type: "Céréale", tonnage: "8.00", description: null, deletedAt: null },
  payment: {
    id: "payment-1", paymentMethod: "CASH", reference: null,
    amountDue: "40000.00", amountReceived: "50000.00", changeReturned: "10000.00", deletedAt: null,
  },
};
const valid = {
  assignedAt: "2026-10-30",
  productName: "Riz blanc",
  productType: "Céréale",
  tonnage: "9",
  origin: "Antsirabe",
  destination: "Toamasina",
  vehicleInfo: "",
  driverName: "Jean Rakoto",
  vehicleRegistration: "1234 TAA",
  vehicleCharacteristics: "Camion benne blanc",
  driverLicenseNumber: "PER-123",
  notes: "",
  paymentMethod: "CASH",
  reference: "",
  amountDue: "45000",
  amountReceived: "50000",
};
const context = { params: Promise.resolve({ id: "pass-1" }) };

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
  db.passage.findUnique.mockResolvedValue(current);
  db.recordRevision.findFirst.mockResolvedValue({ version: 1 });
});

describe("gestion administrateur des passages", () => {
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
      data: expect.objectContaining({ origin: "Antsirabe", vehicleRegistration: "1234 TAA" }),
    }));
    expect(db.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "payment-1" },
      data: expect.objectContaining({ amountDue: "45000.00", amountReceived: "50000.00" }),
    }));
    expect(db.recordRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        entityType: "Passage", entityId: "pass-1", version: 2, action: "UPDATE",
        snapshot: expect.objectContaining({ before: expect.any(Object), after: expect.any(Object) }),
      }),
    }));
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  it("supprime logiquement le passage, le produit et le paiement", async () => {
    const response = await DELETE(
      new Request("https://demo.test/api/passages/pass-1", { method: "DELETE" }),
      context,
    );
    expect((await read(response)).status).toBe(200);
    expect(db.passage.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pass-1" },
      data: expect.objectContaining({ deletedById: ADMIN.id, deletedAt: expect.any(Date) }),
    }));
    expect(db.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "product-1" },
      data: expect.objectContaining({ deletedById: ADMIN.id, deletedAt: expect.any(Date) }),
    }));
    expect(db.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "payment-1" },
      data: expect.objectContaining({ deletedById: ADMIN.id, deletedAt: expect.any(Date) }),
    }));
    expect(db.recordRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "DELETE", entityType: "Passage", entityId: "pass-1" }),
    }));
  });

  it("refuse les modifications et suppressions aux régisseurs", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
    const update = await PATCH(jsonRequest("/api/passages/pass-1", "PATCH", valid), context);
    const remove = await DELETE(
      new Request("https://demo.test/api/passages/pass-1", { method: "DELETE" }),
      context,
    );
    expect((await read(update)).status).toBe(403);
    expect((await read(remove)).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
