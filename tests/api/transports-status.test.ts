import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/transports/[id]/route";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { auditEntries, resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR, jsonRequest, params, read } from "../helpers/http";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;

function patch(body: unknown) {
  return PATCH(jsonRequest("/api/transports/t1", "PATCH", body), params("t1"));
}

function givenTransport(status: string, extra: Record<string, unknown> = {}) {
  db.transportAssignment.findFirst.mockResolvedValue({
    id: "t1",
    status,
    amountDue: "40000.00",
    payment: null,
    ...extra,
  });
}

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
  db.supervisor.findUnique.mockResolvedValue({ id: "sup-1", locationId: "loc-1" });
  db.transportAssignment.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({ id: "t1", ...data }),
  );
});

describe("accès", () => {
  it("refuse un utilisateur non connecté", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await read(await patch({ status: "IN_PROGRESS" }))).status).toBe(401);
  });

  it("refuse l'administrateur", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
    expect((await read(await patch({ status: "IN_PROGRESS" }))).status).toBe(403);
    expect(db.transportAssignment.update).not.toHaveBeenCalled();
  });

  it("ne trouve pas un transport d'un autre lieu", async () => {
    db.transportAssignment.findFirst.mockResolvedValue(null);
    expect((await read(await patch({ status: "IN_PROGRESS" }))).status).toBe(404);
    expect(db.transportAssignment.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "t1",
      locationId: "loc-1",
    });
  });
});

describe("transitions autorisées", () => {
  it.each([
    ["PLANNED", "IN_PROGRESS"],
    ["PLANNED", "CANCELLED"],
    ["IN_PROGRESS", "COMPLETED"],
    ["IN_PROGRESS", "CANCELLED"],
  ])("%s → %s est accepté et journalisé", async (from, to) => {
    givenTransport(from);
    const { status } = await read(await patch({ status: to }));

    expect(status).toBe(200);
    expect(db.transportAssignment.update.mock.calls[0][0].data).toEqual({ status: to });
    expect(auditEntries(db)[0]).toMatchObject({
      action: "CHANGE_TRANSPORT_STATUS",
      entityType: "TransportAssignment",
      details: { previousStatus: from, newStatus: to },
    });
  });
});

describe("transitions interdites", () => {
  it.each([
    ["PLANNED", "COMPLETED"],
    ["PLANNED", "PLANNED"],
    ["IN_PROGRESS", "PLANNED"],
    ["COMPLETED", "IN_PROGRESS"],
    ["COMPLETED", "CANCELLED"],
    ["CANCELLED", "PLANNED"],
    ["CANCELLED", "IN_PROGRESS"],
  ])("%s → %s est refusé", async (from, to) => {
    givenTransport(from);
    const { status } = await read(await patch({ status: to }));

    expect(status).toBe(409);
    expect(db.transportAssignment.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuse un statut inconnu", async () => {
    givenTransport("PLANNED");
    expect((await read(await patch({ status: "EXPLODED" }))).status).toBe(400);
  });
});

describe("transport déjà payé", () => {
  it.each(["PLANNED", "IN_PROGRESS"])(
    "l'annulation ordinaire d'un transport %s payé est refusée",
    async (from) => {
      givenTransport(from, { payment: { id: "pay-1" } });
      const { status, body } = await read(await patch({ status: "CANCELLED" }));

      expect(status).toBe(409);
      expect(String(body.message)).toMatch(/déjà payé/);
      expect(db.transportAssignment.update).not.toHaveBeenCalled();
    },
  );

  it("un transport payé peut quand même être terminé", async () => {
    givenTransport("IN_PROGRESS", { payment: { id: "pay-1" } });
    expect((await read(await patch({ status: "COMPLETED" }))).status).toBe(200);
  });

  it("verrouille la ligne avant de décider (course paiement / annulation)", async () => {
    givenTransport("PLANNED");
    await patch({ status: "CANCELLED" });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("montant officiel", () => {
  it("accepte de fixer un montant manquant, une seule fois", async () => {
    givenTransport("PLANNED", { amountDue: null });
    const { status } = await read(await patch({ amountDue: "25000.50" }));

    expect(status).toBe(200);
    expect(db.transportAssignment.update.mock.calls[0][0].data).toEqual({ amountDue: "25000.50" });
    expect(auditEntries(db)[0]).toMatchObject({ action: "SET_TRANSPORT_AMOUNT" });
  });

  it("refuse de modifier un montant déjà fixé", async () => {
    givenTransport("PLANNED");
    expect((await read(await patch({ amountDue: "1000" }))).status).toBe(409);
  });

  it("refuse de modifier le montant après un paiement", async () => {
    givenTransport("PLANNED", { amountDue: null, payment: { id: "pay-1" } });
    expect((await read(await patch({ amountDue: "1000" }))).status).toBe(409);
  });

  it("refuse de fixer le montant d'un transport annulé", async () => {
    givenTransport("CANCELLED", { amountDue: null });
    expect((await read(await patch({ amountDue: "1000" }))).status).toBe(409);
  });

  it.each(["-1", "0", "abc", "10.999", ""])("refuse le montant invalide %j", async (amount) => {
    givenTransport("PLANNED", { amountDue: null });
    expect((await read(await patch({ amountDue: amount }))).status).toBe(400);
  });

  it("refuse d'envoyer un montant et un statut dans la même requête", async () => {
    givenTransport("PLANNED", { amountDue: null });
    expect((await read(await patch({ amountDue: "1000", status: "IN_PROGRESS" }))).status).toBe(400);
  });
});
