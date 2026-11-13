import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/maritime-product-types/route";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR } from "../helpers/http";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;
const USER_MAR = { ...SUPERVISOR, id: "mar-user-1", role: "USER_MAR" as const };
const active = { id: "p1", name: "Thon", unitPrice: "1250.00", isActive: true };
const inactive = { id: "p2", name: "Crabe", unitPrice: "500.00", isActive: false };

beforeEach(() => resetFakePrisma(db));

describe("GET /api/maritime-product-types", () => {
  it("autorise USER_MAR et ne renvoie que les produits actifs et les champs publics", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(USER_MAR);
    db.maritimeProductType.findMany.mockResolvedValue([active]);
    const response = await GET(new Request("http://localhost/api/maritime-product-types"));
    expect(response.status).toBe(200);
    expect(db.maritimeProductType.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unitPrice: true },
    });
    expect(await response.json()).toEqual({
      maritimeProductTypes: [{ id: "p1", name: "Thon", unitPrice: "1250.00" }],
    });
    expect(JSON.stringify(await response.clone().json())).not.toContain("normalizedName");
    expect(inactive.isActive).toBe(false);
  });

  it("refuse SUPERVISOR", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
    const response = await GET(new Request("http://localhost/api/maritime-product-types"));
    expect(response.status).toBe(403);
    expect(db.maritimeProductType.findMany).not.toHaveBeenCalled();
  });

  it("refuse les visiteurs non connectés", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/maritime-product-types"));
    expect(response.status).toBe(401);
    expect(db.maritimeProductType.findMany).not.toHaveBeenCalled();
  });

  it("conserve le catalogue complet pour ADMIN, y compris les inactifs", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
    db.maritimeProductType.findMany.mockResolvedValue([active, inactive]);
    const response = await GET(new Request("http://localhost/api/maritime-product-types"));
    expect(response.status).toBe(200);
    expect(db.maritimeProductType.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        id: true, name: true, normalizedName: true, unitPrice: true, currency: true,
        isActive: true, createdAt: true, updatedAt: true,
      },
    }));
    expect((await response.json()).maritimeProductTypes).toHaveLength(2);
  });
});
