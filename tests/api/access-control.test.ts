import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR, jsonRequest, params } from "../helpers/http";

import { POST as driversPost } from "@/app/api/drivers/route";
import { PUT as driversPut, PATCH as driversPatch } from "@/app/api/drivers/[id]/route";
import { POST as vehiclesPost } from "@/app/api/vehicles/route";
import { PUT as vehiclesPut, PATCH as vehiclesPatch } from "@/app/api/vehicles/[id]/route";
import { POST as transportsPost } from "@/app/api/transports/route";
import { PATCH as transportsPatch } from "@/app/api/transports/[id]/route";
import { POST as paymentsPost } from "@/app/api/payments/route";
import { POST as locationsPost } from "@/app/api/locations/route";
import { POST as supervisorsPost } from "@/app/api/supervisors/route";
import { PATCH as supervisorsPatch } from "@/app/api/supervisors/[id]/route";
import { POST as supervisorsPassword } from "@/app/api/supervisors/[id]/password/route";
import { GET as dbTest } from "@/app/api/db-test/route";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;

type Call = () => Promise<Response>;

const body = { x: "y" };
const post = (url: string) => jsonRequest(url, "POST", body);
const put = (url: string) => jsonRequest(url, "PUT", body);
const patch = (url: string) => jsonRequest(url, "PATCH", body);

// Routes réservées aux régisseurs : formulaires opérationnels.
const supervisorRoutes: Array<[string, Call]> = [
  ["POST /api/drivers", () => driversPost(post("/api/drivers"))],
  ["PUT /api/drivers/[id]", () => driversPut(put("/api/drivers/x"), params())],
  ["PATCH /api/drivers/[id]", () => driversPatch(patch("/api/drivers/x"), params())],
  ["POST /api/vehicles", () => vehiclesPost(post("/api/vehicles"))],
  ["PUT /api/vehicles/[id]", () => vehiclesPut(put("/api/vehicles/x"), params())],
  ["PATCH /api/vehicles/[id]", () => vehiclesPatch(patch("/api/vehicles/x"), params())],
  ["POST /api/transports", () => transportsPost(post("/api/transports"))],
  ["PATCH /api/transports/[id]", () => transportsPatch(patch("/api/transports/x"), params())],
  ["POST /api/payments", () => paymentsPost(post("/api/payments"))],
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
