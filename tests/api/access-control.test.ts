import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR, jsonRequest, params } from "../helpers/http";

import { POST as passagesPost } from "@/app/api/passages/route";
import { POST as locationsPost } from "@/app/api/locations/route";
import { POST as supervisorsPost } from "@/app/api/supervisors/route";
import { PATCH as supervisorsPatch } from "@/app/api/supervisors/[id]/route";
import { POST as supervisorsPassword } from "@/app/api/supervisors/[id]/password/route";
import { GET as dbTest } from "@/app/api/db-test/route";
import { GET as detailsGet } from "@/app/api/details/[kind]/route";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;

type Call = () => Promise<Response>;

const body = { x: "y" };
const post = (url: string) => jsonRequest(url, "POST", body);
const patch = (url: string) => jsonRequest(url, "PATCH", body);

// Routes réservées aux régisseurs : enregistrement d'un passage et de son paiement.
const supervisorRoutes: Array<[string, Call]> = [
  ["POST /api/passages", () => passagesPost(post("/api/passages"))],
];

// Routes réservées à l'administrateur : lieux et comptes.
const adminRoutes: Array<[string, Call]> = [
  ["POST /api/locations", () => locationsPost(post("/api/locations"))],
  ["POST /api/supervisors", () => supervisorsPost(post("/api/supervisors"))],
  ["PATCH /api/supervisors/[id]", () => supervisorsPatch(patch("/api/supervisors/x"), params())],
  ["POST /api/supervisors/[id]/password", () => supervisorsPassword(post("/api/supervisors/x/password"), params())],
  ["GET /api/db-test", () => dbTest()],
];

// Aucune de ces routes ne doit toucher à la base avant d'avoir vérifié l'identité et le rôle.
function expectDatabaseUntouched() {
  expect(db.$transaction).not.toHaveBeenCalled();
  for (const [name, model] of Object.entries(db)) {
    if (name.startsWith("$")) continue;
    for (const fn of Object.values(model as Record<string, { mock: { calls: unknown[] } }>)) {
      expect(fn.mock.calls).toHaveLength(0);
    }
  }
}

beforeEach(() => {
  resetFakePrisma(db);
});

describe("utilisateur non connecté : toute l'API est fermée", () => {
  it("GET /api/details/[kind] → 401", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await detailsGet(new Request("http://localhost/api/details/passages"), { params: Promise.resolve({ kind: "passages" }) });
    expect(response.status).toBe(401);
    expectDatabaseUntouched();
  });

  it.each([...supervisorRoutes, ...adminRoutes])("%s → 401", async (_name, call) => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await call();

    expect(response.status).toBe(401);
    expectDatabaseUntouched();
  });
});

describe("l'administrateur n'accède pas aux formulaires opérationnels", () => {
  it.each(supervisorRoutes)("%s → 403", async (_name, call) => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
    const response = await call();

    expect(response.status).toBe(403);
    expectDatabaseUntouched();
  });
});

describe("un régisseur n'accède pas à l'administration", () => {
  it.each(adminRoutes)("%s → 403", async (_name, call) => {
    vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
    const response = await call();

    expect(response.status).toBe(403);
    expectDatabaseUntouched();
  });
});

describe("rôles non prévus (CASHIER, MANAGER, ANALYST)", () => {
  it.each(["CASHIER", "MANAGER", "ANALYST"] as const)(
    "%s est refusé partout",
    async (role) => {
      vi.mocked(getCurrentUser).mockResolvedValue({ ...SUPERVISOR, role });

      for (const [, call] of [...supervisorRoutes, ...adminRoutes]) {
        const response = await call();
        expect(response.status).toBe(403);
      }
      expectDatabaseUntouched();
    },
  );
});
