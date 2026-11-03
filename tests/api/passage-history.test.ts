import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/passages/[id]/history/route";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR, jsonRequest, params, read } from "../helpers/http";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;
const call = () => GET(jsonRequest("/api/passages/pas-1/history", "GET"), params("pas-1"));

const revisionRow = {
  id: "rev-2",
  version: 2,
  action: "UPDATE",
  createdAt: new Date("2026-11-02T08:20:00Z"),
  actor: { firstName: "Rina", lastName: "Rakoto" },
  snapshot: {
    before: { passage: { origin: "Antsirabe" }, product: { tonnage: "8.50" }, payment: null },
    after: { passage: { origin: "Mahajanga" }, product: { tonnage: "8.50" }, payment: null },
  },
};

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
  db.supervisor.findUnique.mockResolvedValue({ locationId: "loc-1" });
  db.passage.findUnique.mockResolvedValue({ locationId: "loc-1", deletedAt: null });
  db.recordRevision.findMany.mockResolvedValue([revisionRow]);
});

describe("historique d'un passage", () => {
  it("renvoie un historique lisible, sans instantané brut ni adresse email", async () => {
    const { status, body } = await read(await call());

    expect(status).toBe(200);
    expect(body.entries).toEqual([
      expect.objectContaining({
        kind: "updated",
        author: "Rina Rakoto",
        changes: [{ label: "Provenance", before: "Antsirabe", after: "Mahajanga" }],
      }),
    ]);
    expect(JSON.stringify(body)).not.toMatch(/snapshot|version|email|UPDATE/);
  });

  it("refuse un utilisateur non connecté", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await read(await call())).status).toBe(401);
  });

  it("cache à un régisseur l'historique d'un passage supprimé", async () => {
    db.passage.findUnique.mockResolvedValue({ locationId: "loc-1", deletedAt: new Date() });
    expect((await read(await call())).status).toBe(404);
    expect(db.recordRevision.findMany).not.toHaveBeenCalled();
  });

  it("refuse un passage d'un autre lieu", async () => {
    db.passage.findUnique.mockResolvedValue({ locationId: "loc-2", deletedAt: null });
    expect((await read(await call())).status).toBe(404);
  });

  it("l'administrateur voit l'historique, y compris d'un passage supprimé", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
    db.passage.findUnique.mockResolvedValue({ locationId: "loc-2", deletedAt: new Date() });
    expect((await read(await call())).status).toBe(200);
  });
});
