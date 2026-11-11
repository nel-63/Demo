import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR, jsonRequest, params, read } from "../helpers/http";
import { GET as listDeclarations, POST as createDeclaration } from "@/app/api/maritime/declarations/route";
import {
  DELETE as deleteDeclaration,
  GET as getDeclaration,
  PATCH as patchDeclaration,
  PUT as putDeclaration,
} from "@/app/api/maritime/declarations/[id]/route";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;
const USER_MAR = {
  ...SUPERVISOR,
  id: "mar-user-1",
  role: "USER_MAR" as const,
};
const PROFILE_ID = "mar-profile-1";
const valid = {
  companyName: "Société Océan",
  boatName: "Makoa",
  boatRegistration: "MA-102",
  boatCapacity: "25.5",
  captainName: "Rabe",
  captainPhone: "",
  captainEmail: "capitaine@example.mg",
  originDepartureDate: "2026-10-01",
  arrivalDate: "2026-10-03",
  departureDate: "2026-10-05",
  products: [
    { productType: "Thon", quantity: "10.250", unitPrice: "1250.50" },
    { productType: "Crabe", quantity: "2.000", unitPrice: "0.25" },
  ],
};

function storedDeclaration(overrides: Record<string, unknown> = {}) {
  return {
    id: "declaration-1",
    maritimeUserId: PROFILE_ID,
    companyName: "Société Océan",
    boatName: "Makoa",
    boatRegistration: "MA-102",
    boatCapacity: "25.500",
    captainName: "Rabe",
    captainPhone: null,
    captainEmail: "capitaine@example.mg",
    originDepartureDate: new Date("2026-10-01T00:00:00.000Z"),
    arrivalDate: new Date("2026-10-03T00:00:00.000Z"),
    departureDate: new Date("2026-10-05T00:00:00.000Z"),
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    products: [
      {
        id: "product-1",
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

const post = (body: unknown) =>
  createDeclaration(jsonRequest("/api/maritime/declarations", "POST", body));

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(USER_MAR);
  db.maritimeUser.findUnique.mockResolvedValue({ id: PROFILE_ID });
});

describe("accès aux déclarations maritimes", () => {
  it("refuse les comptes non connectés et les autres rôles avant toute requête métier", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await read(await post(valid))).status).toBe(401);

    for (const user of [ADMIN, SUPERVISOR]) {
      vi.mocked(getCurrentUser).mockResolvedValue(user);
      expect((await read(await post(valid))).status).toBe(403);
      expect((await read(await listDeclarations(new Request("http://localhost/api/maritime/declarations")))).status).toBe(403);
      expect((await read(await getDeclaration(new Request("http://localhost"), params()))).status).toBe(403);
      expect((await read(await putDeclaration(jsonRequest("/api/maritime/declarations/id-1", "PUT", valid), params()))).status).toBe(403);
      expect((await read(await patchDeclaration(jsonRequest("/api/maritime/declarations/id-1", "PATCH", valid), params()))).status).toBe(403);
      expect((await read(await deleteDeclaration(new Request("http://localhost", { method: "DELETE" }), params()))).status).toBe(403);
    }

    expect(db.maritimeUser.findUnique).not.toHaveBeenCalled();
    expect(db.maritimeDeclaration.findMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuse l'accès métier si le compte maritime n'a pas de profil", async () => {
    db.maritimeUser.findUnique.mockResolvedValue(null);
    expect((await read(await post(valid))).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("validation et création", () => {
  it.each([
    [{ ...valid, captainEmail: "", captainPhone: "" }],
    [{ ...valid, arrivalDate: "2026-09-30" }],
    [{ ...valid, products: [] }],
    [{ ...valid, products: [{ productType: "Thon", quantity: "1", unitPrice: "-1" }] }],
  ])("rejette les données invalides avant d'ouvrir la transaction", async (body) => {
    const response = await read(await post(body));
    expect(response.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("crée la déclaration et ses produits avec un audit atomique et calcule le total côté serveur", async () => {
    const created = storedDeclaration({ products: valid.products.map((product, index) => ({
      id: `product-${index + 1}`,
      ...product,
      quantity: Number(index) === 0 ? "10.250" : "2.000",
      unitPrice: Number(index) === 0 ? "1250.50" : "0.25",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    })) });
    db.maritimeDeclaration.create.mockResolvedValue(created);
    const { status, body } = await read(await post({ ...valid, total: "0" }));

    expect(status).toBe(201);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.maritimeDeclaration.create.mock.calls[0][0].data).toMatchObject({
      maritimeUserId: PROFILE_ID,
      products: { create: valid.products },
    });
    expect(body.declaration).toMatchObject({
      total: "12818.125",
      products: [{ lineTotal: "12817.625" }, { lineTotal: "0.5" }],
    });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      userId: USER_MAR.id,
      action: "CREATE",
      entityType: "MaritimeDeclaration",
      details: { after: { total: "12818.125" } },
    });
  });
});

describe("isolation et CRUD", () => {
  it("filtre les listes et les détails par profil, et masque les déclarations d'un autre utilisateur", async () => {
    db.maritimeDeclaration.count.mockResolvedValue(0);
    db.maritimeDeclaration.findMany.mockResolvedValue([]);
    await listDeclarations(new Request("http://localhost/api/maritime/declarations?q=Ocean"));
    expect(db.maritimeDeclaration.findMany.mock.calls[0][0].where).toMatchObject({
      maritimeUserId: PROFILE_ID,
    });

    db.maritimeDeclaration.findFirst.mockResolvedValue(null);
    expect((await read(await getDeclaration(new Request("http://localhost"), params("other-id")))).status).toBe(404);
    expect(db.maritimeDeclaration.findFirst.mock.calls[0][0].where).toEqual({
      id: "other-id",
      maritimeUserId: PROFILE_ID,
    });
  });

  it("met à jour, ajoute et retire des produits dans la transaction", async () => {
    const current = storedDeclaration();
    const updated = storedDeclaration({
      companyName: "Société mise à jour",
      products: [
        { ...current.products[0], productType: "Thon frais" },
        { ...current.products[0], id: "product-new", productType: "Crabe", quantity: "2.000", unitPrice: "0.25" },
      ],
    });
    db.maritimeDeclaration.findFirst.mockResolvedValue(current);
    db.maritimeDeclaration.findUniqueOrThrow.mockResolvedValue(updated);
    const input = {
      ...valid,
      companyName: "Société mise à jour",
      products: [
        { id: "product-1", productType: "Thon frais", quantity: "10.250", unitPrice: "1250.50" },
        { productType: "Crabe", quantity: "2", unitPrice: "0.25" },
      ],
    };
    const response = await read(await patchDeclaration(
      jsonRequest("/api/maritime/declarations/declaration-1", "PATCH", input),
      params("declaration-1"),
    ));

    expect(response.status).toBe(200);
    expect(db.maritimeDeclaration.update).toHaveBeenCalledTimes(1);
    expect(db.maritimeDeclarationProduct.update).toHaveBeenCalledWith({
      where: { id: "product-1" },
      data: { productType: "Thon frais", quantity: "10.250", unitPrice: "1250.50" },
    });
    expect(db.maritimeDeclarationProduct.create).toHaveBeenCalledWith({
      data: { declarationId: "declaration-1", productType: "Crabe", quantity: "2.000", unitPrice: "0.25" },
    });
    expect(db.maritimeDeclarationProduct.deleteMany).toHaveBeenCalledWith({
      where: { declarationId: "declaration-1", id: { notIn: ["product-1"] } },
    });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "UPDATE" });
  });

  it("supprime définitivement avec cascade attendue et conserve l'instantané dans l'audit", async () => {
    db.maritimeDeclaration.findFirst.mockResolvedValue(storedDeclaration());
    const response = await read(await deleteDeclaration(
      new Request("http://localhost/api/maritime/declarations/declaration-1", { method: "DELETE" }),
      params("declaration-1"),
    ));

    expect(response.status).toBe(200);
    expect(db.maritimeDeclaration.delete).toHaveBeenCalledWith({ where: { id: "declaration-1" } });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "DELETE",
      entityType: "MaritimeDeclaration",
      details: { before: { companyName: "Société Océan", products: [{ productType: "Thon" }] } },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("refuse de rattacher une ligne produit appartenant à une autre déclaration", async () => {
    db.maritimeDeclaration.findFirst.mockResolvedValue(storedDeclaration());
    const response = await read(await patchDeclaration(
      jsonRequest("/api/maritime/declarations/declaration-1", "PATCH", {
        ...valid,
        products: [{ id: "foreign-product", productType: "Thon", quantity: "1", unitPrice: "10" }],
      }),
      params("declaration-1"),
    ));
    expect(response.status).toBe(400);
    expect(db.maritimeDeclaration.update).not.toHaveBeenCalled();
    expect(db.maritimeDeclarationProduct.update).not.toHaveBeenCalled();
  });
});
