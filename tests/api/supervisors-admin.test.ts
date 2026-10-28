import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { PATCH } from "@/app/api/supervisors/[id]/route";
import { POST as resetPassword } from "@/app/api/supervisors/[id]/password/route";
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

function givenSupervisor(isActive: boolean) {
  db.supervisor.findUnique.mockResolvedValue({
    id: "sup-1",
    userId: "user-sup-1",
    user: { email: "rina@test.mg", isActive },
  });
}

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
});

describe("désactivation / réactivation du compte", () => {
  const patch = (body: unknown) =>
    PATCH(jsonRequest("/api/supervisors/sup-1", "PATCH", body), params("sup-1"));

  it("désactive le compte, ferme ses sessions et journalise", async () => {
    givenSupervisor(true);
    const { status } = await read(await patch({ isActive: false }));

    expect(status).toBe(200);
    expect(db.user.update.mock.calls[0][0]).toMatchObject({
      where: { id: "user-sup-1" },
      data: { isActive: false, sessionVersion: { increment: 1 } },
    });
    expect(auditEntries(db)[0]).toMatchObject({
      userId: ADMIN.id,
      action: "DEACTIVATE",
      entityType: "Supervisor",
      entityId: "sup-1",
      details: { email: "rina@test.mg" },
    });
  });

  it("réactive le compte sans toucher à la version de session", async () => {
    givenSupervisor(false);
    const { status } = await read(await patch({ isActive: true }));

    expect(status).toBe(200);
    expect(db.user.update.mock.calls[0][0].data).toEqual({ isActive: true });
    expect(auditEntries(db)[0]).toMatchObject({ action: "ACTIVATE" });
  });

  it("refuse de désactiver un compte déjà inactif", async () => {
    givenSupervisor(false);
    expect((await read(await patch({ isActive: false }))).status).toBe(409);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("répond 404 pour un régisseur inconnu", async () => {
    db.supervisor.findUnique.mockResolvedValue(null);
    expect((await read(await patch({ isActive: false }))).status).toBe(404);
  });

  it("refuse un statut qui n'est pas un booléen", async () => {
    expect((await read(await patch({ isActive: "false" }))).status).toBe(400);
  });

  it("refuse de mélanger statut et changement de lieu", async () => {
    expect((await read(await patch({ isActive: false, locationId: "loc-2" }))).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuse un régisseur et un utilisateur non connecté", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
    expect((await read(await patch({ isActive: false }))).status).toBe(403);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await read(await patch({ isActive: false }))).status).toBe(401);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("changement de lieu (non-régression)", () => {
  it("garde le comportement existant : le lieu change et l'historique est conservé", async () => {
    db.supervisor.findUnique.mockResolvedValue({
      id: "sup-1",
      locationId: "loc-1",
      location: "Tana",
      user: { firstName: "R", lastName: "R", email: "rina@test.mg" },
    });
    db.location.findUnique.mockResolvedValue({ id: "loc-2", name: "Tamatave" });
    db.supervisor.update.mockResolvedValue({ id: "sup-1", locationId: "loc-2" });

    const { status } = await read(
      await PATCH(jsonRequest("/api/supervisors/sup-1", "PATCH", { locationId: "loc-2" }), params("sup-1")),
    );

    expect(status).toBe(200);
    expect(db.supervisor.update.mock.calls[0][0].data).toEqual({
      locationId: "loc-2",
      location: "Tamatave",
    });
    expect(auditEntries(db)[0]).toMatchObject({ action: "CHANGE_LOCATION" });
    // aucun transport, véhicule ou chauffeur n'est déplacé
    expect(db.transportAssignment.update).not.toHaveBeenCalled();
    expect(db.vehicle.update).not.toHaveBeenCalled();
    expect(db.driver.update).not.toHaveBeenCalled();
  });
});

describe("réinitialisation du mot de passe", () => {
  const reset = (body: unknown) =>
    resetPassword(jsonRequest("/api/supervisors/sup-1/password", "POST", body), params("sup-1"));

  beforeEach(() => givenSupervisor(true));

  it("enregistre un hash bcrypt, ferme les sessions et lève le blocage de connexion", async () => {
    const newPassword = "Nouveau-mot-de-passe-42";
    const { status } = await read(await reset({ password: newPassword }));

    expect(status).toBe(200);

    const data = db.user.update.mock.calls[0][0].data as {
      passwordHash: string;
      sessionVersion: { increment: number };
    };
    expect(data.passwordHash).not.toBe(newPassword);
    expect(await bcrypt.compare(newPassword, data.passwordHash)).toBe(true);
    expect(data.sessionVersion).toEqual({ increment: 1 });
    expect(db.loginFailure.deleteMany.mock.calls[0][0]).toEqual({
      where: { email: "rina@test.mg" },
    });
  });

  it("n'écrit jamais le mot de passe dans le journal d'audit", async () => {
    const newPassword = "Nouveau-mot-de-passe-42";
    await reset({ password: newPassword });

    const [entry] = auditEntries(db);
    expect(entry).toMatchObject({
      userId: ADMIN.id,
      action: "RESET_PASSWORD",
      entityType: "Supervisor",
      entityId: "sup-1",
    });
    expect(JSON.stringify(entry)).not.toContain(newPassword);
  });

  it("refuse un mot de passe trop court sans toucher au compte", async () => {
    const { status } = await read(await reset({ password: "court" }));
    expect(status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("répond 404 pour un régisseur inconnu", async () => {
    db.supervisor.findUnique.mockResolvedValue(null);
    expect((await read(await reset({ password: "Nouveau-mot-de-passe-42" }))).status).toBe(404);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("est réservée à l'administrateur", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
    expect((await read(await reset({ password: "Nouveau-mot-de-passe-42" }))).status).toBe(403);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await read(await reset({ password: "Nouveau-mot-de-passe-42" }))).status).toBe(401);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
