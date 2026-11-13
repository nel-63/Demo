import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR, read } from "../helpers/http";
import { GET as listProductTypes } from "@/app/api/maritime-product-types/route";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;
const USER_MAR = { ...SUPERVISOR, id: "mar-user-1", role: "USER_MAR" as const };
const list = () => listProductTypes(new Request("http://localhost/api/maritime-product-types"));

beforeEach(() => {
  resetFakePrisma(db);
});

describe("catalogue des produits maritimes (lecture)", () => {
  it("refuse les visiteurs non connectés (401) et les régisseurs (403) sans interroger la base", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await read(await list())).status).toBe(401);

    vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
    expect((await read(await list())).status).toBe(403);

    expect(db.maritimeProductType.findMany).not.toHaveBeenCalled();
  });

  it("donne à un utilisateur maritime les seuls produits actifs, avec les champs utiles au formulaire", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(USER_MAR);
    db.maritimeProductType.findMany.mockResolvedValue([
      { id: "type-1", name: "Thon", unitPrice: "1250.5", isActive: true },
    ]);

    const result = await read(await list());

    expect(result.status).toBe(200);
    expect(result.body.maritimeProductTypes).toEqual([
      { id: "type-1", name: "Thon", unitPrice: "1250.5", isActive: true },
    ]);
    const query = db.maritimeProductType.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({ isActive: true });
    expect(query.select).toEqual({ id: true, name: true, unitPrice: true, isActive: true });
  });

  it("garde pour l'administrateur la liste complète (actifs et inactifs)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
    db.maritimeProductType.findMany.mockResolvedValue([]);

    expect((await read(await list())).status).toBe(200);

    const query = db.maritimeProductType.findMany.mock.calls[0][0];
    expect(query.where).not.toHaveProperty("isActive");
    expect(query.select).toMatchObject({ normalizedName: true, createdAt: true, updatedAt: true });
  });
});
