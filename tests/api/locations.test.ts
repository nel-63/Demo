import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "@/app/api/locations/[id]/route";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR, jsonRequest, read } from "../helpers/http";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;
const context = { params: Promise.resolve({ id: "loc-1" }) };

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
  db.location.findUnique.mockResolvedValue({
    id: "loc-1",
    name: "Antsirabe",
    deletedAt: null,
  });
});

describe("archivage des lieux", () => {
  it("archive le lieu sans supprimer l'enregistrement et journalise l'action", async () => {
    const response = await DELETE(new Request("https://demo.test/api/locations/loc-1", { method: "DELETE" }), context);
    expect((await read(response)).status).toBe(200);
    expect(db.location.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "loc-1" },
      data: { deletedAt: expect.any(Date), deletedById: ADMIN.id },
    }));
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "DELETE",
        entityType: "Location",
        entityId: "loc-1",
      }),
    }));
    expect(db.location.deleteMany).not.toHaveBeenCalled();
  });

  it("réactive un lieu archivé sans perdre son nom", async () => {
    db.location.findUnique.mockResolvedValue({
      id: "loc-1",
      name: "Antsirabe",
      deletedAt: new Date(),
    });
    const response = await PATCH(
      jsonRequest("/api/locations/loc-1", "PATCH", { action: "RESTORE" }),
      context,
    );
    expect((await read(response)).status).toBe(200);
    expect(db.location.update).toHaveBeenCalledWith({
      where: { id: "loc-1" },
      data: { deletedAt: null, deletedById: null },
    });
  });

  it("refuse les mutations aux personnes non administratrices", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
    const response = await DELETE(new Request("https://demo.test/api/locations/loc-1", { method: "DELETE" }), context);
    expect((await read(response)).status).toBe(403);
    expect(db.location.update).not.toHaveBeenCalled();
  });
});
