import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { GET as listMaritimeUsers, POST as createMaritimeUser } from "@/app/api/maritime-users/route";
import {
  DELETE as deleteMaritimeUser,
  PATCH as patchMaritimeUser,
} from "@/app/api/maritime-users/[id]/route";
import { POST as resetMaritimeUserPassword } from "@/app/api/maritime-users/[id]/password/route";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditEntries, resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR, jsonRequest, params, read } from "../helpers/http";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;
const USER_MAR = { ...SUPERVISOR, id: "mar-user-1", role: "USER_MAR" as const };
const PASSWORD = "Mot-de-passe-maritime-42";

const account = {
  firstName: "Rina",
  lastName: "Maritime",
  email: "rina.maritime@test.mg",
  phoneNumber: "0340000000",
  latitude: "-20.2833",
  longitude: "44.2833",
  password: PASSWORD,
};

function createdProfile() {
  return {
    id: "mar-profile-1",
    latitude: "-20.283300",
    longitude: "44.283300",
    user: {
      firstName: account.firstName,
      lastName: account.lastName,
      email: account.email,
      phoneNumber: account.phoneNumber,
      isActive: true,
    },
  };
}

function patch(body: unknown) {
  return patchMaritimeUser(jsonRequest("/api/maritime-users/mar-profile-1", "PATCH", body), params("mar-profile-1"));
}

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
});

describe("création d'un utilisateur maritime", () => {
  it("crée ensemble le User, le profil et l'audit sans exposer de secret", async () => {
    db.user.create.mockResolvedValue({ id: "user-mar-1" });
    db.maritimeUser.create.mockResolvedValue(createdProfile());

    const { status, body } = await read(await createMaritimeUser(jsonRequest("/api/maritime-users", "POST", account)));

    expect(status).toBe(201);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.user.create.mock.calls[0][0]).toMatchObject({
      data: {
        firstName: "Rina",
        lastName: "Maritime",
        email: "rina.maritime@test.mg",
        role: "USER_MAR",
        designation: "Utilisateur maritime",
      },
    });
    const userData = db.user.create.mock.calls[0][0].data as { passwordHash: string };
    expect(await bcrypt.compare(PASSWORD, userData.passwordHash)).toBe(true);
    expect(db.maritimeUser.create.mock.calls[0][0].data).toEqual({
      userId: "user-mar-1",
    });
    expect(db.location.create).not.toHaveBeenCalled();
    expect(auditEntries(db)[0]).toMatchObject({
      userId: ADMIN.id,
      action: "CREATE",
      entityType: "MaritimeUser",
      details: { email: account.email },
    });
    expect(JSON.stringify(body)).not.toContain(PASSWORD);
    expect(JSON.stringify(body)).not.toContain(userData.passwordHash);
    expect(JSON.stringify(auditEntries(db))).not.toContain(PASSWORD);
  });

  it("ignore les coordonnées envoyées par l'administration et les remplace par un profil sans coordonnées", async () => {
    const invalid = { ...account, latitude: "-90.000001", longitude: "180.000001" };
    db.user.create.mockResolvedValue({ id: "user-mar-1" });
    db.maritimeUser.create.mockResolvedValue(createdProfile());

    const { status } = await read(await createMaritimeUser(jsonRequest("/api/maritime-users", "POST", invalid)));

    expect(status).toBe(201);
    expect(db.maritimeUser.create.mock.calls[0][0].data).toEqual({ userId: "user-mar-1" });
  });

  it("renvoie le message de doublon des régisseurs pour un email déjà utilisé", async () => {
    db.user.create.mockRejectedValue({ code: "P2002" });
    const { status, body } = await read(await createMaritimeUser(jsonRequest("/api/maritime-users", "POST", account)));

    expect(status).toBe(409);
    expect(body.message).toBe("Cet email ou cette CIN existe déjà.");
  });

  it.each([
    ["régisseur", SUPERVISOR],
    ["utilisateur maritime", USER_MAR],
  ])("refuse la création pour un %s", async (_label, user) => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    expect((await read(await createMaritimeUser(jsonRequest("/api/maritime-users", "POST", account)))).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuse la création sans connexion", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await read(await createMaritimeUser(jsonRequest("/api/maritime-users", "POST", account)))).status).toBe(401);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("modification du compte", () => {
  it("met à jour les informations et audite uniquement des données non sensibles", async () => {
    db.maritimeUser.findUnique.mockResolvedValue({
      id: "mar-profile-1",
      latitude: "-20.000000",
      longitude: "44.000000",
      user: {
        id: "user-mar-1",
        firstName: "Ancien",
        lastName: "Nom",
        email: "ancien@test.mg",
        phoneNumber: null,
      },
    });
    db.maritimeUser.update.mockResolvedValue(createdProfile());
    const { status } = await read(await patch({
      firstName: account.firstName,
      lastName: account.lastName,
      email: account.email,
      phoneNumber: account.phoneNumber,
      latitude: account.latitude,
      longitude: account.longitude,
    }));

    expect(status).toBe(200);
    expect(db.user.update.mock.calls[0][0]).toMatchObject({
      where: { id: "user-mar-1" },
      data: { firstName: account.firstName, lastName: account.lastName, email: account.email, phoneNumber: account.phoneNumber },
    });
    expect(auditEntries(db)[0]).toMatchObject({ action: "UPDATE", entityType: "MaritimeUser" });
  });

  it("désactive le compte en invalidant ses sessions", async () => {
    db.maritimeUser.findUnique.mockResolvedValue({
      id: "mar-profile-1",
      userId: "user-mar-1",
      user: { email: account.email, isActive: true },
    });
    const { status } = await read(await patch({ isActive: false }));

    expect(status).toBe(200);
    expect(db.user.update.mock.calls[0][0]).toMatchObject({
      data: { isActive: false, sessionVersion: { increment: 1 } },
    });
    expect(auditEntries(db)[0]).toMatchObject({ action: "DEACTIVATE", entityType: "MaritimeUser" });
  });

  it("réactive un compte sans modifier sa version de session", async () => {
    db.maritimeUser.findUnique.mockResolvedValue({
      id: "mar-profile-1",
      userId: "user-mar-1",
      user: { email: account.email, isActive: false },
    });
    expect((await read(await patch({ isActive: true }))).status).toBe(200);
    expect(db.user.update.mock.calls[0][0].data).toEqual({ isActive: true });
    expect(auditEntries(db)[0]).toMatchObject({ action: "ACTIVATE", entityType: "MaritimeUser" });
  });
});

describe("suppression et réinitialisation du mot de passe", () => {
  it("refuse de supprimer un profil qui possède des déclarations et recommande la désactivation", async () => {
    db.maritimeUser.findUnique.mockResolvedValue({
      id: "mar-profile-1",
      userId: "user-mar-1",
      latitude: "-20",
      longitude: "44",
      _count: { declarations: 2 },
      user: { firstName: "Rina", lastName: "M", email: account.email },
    });
    const { status, body } = await read(await deleteMaritimeUser(
      new Request("http://localhost/api/maritime-users/mar-profile-1", { method: "DELETE" }),
      params("mar-profile-1"),
    ));

    expect(status).toBe(409);
    expect(body.message).toContain("ne peut pas être supprimé");
    expect(body.message).toContain("Désactivez son compte");
    expect(db.maritimeUser.delete).not.toHaveBeenCalled();
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it("supprime un compte sans déclaration et journalise l'opération", async () => {
    db.maritimeUser.findUnique.mockResolvedValue({
      id: "mar-profile-1",
      userId: "user-mar-1",
      latitude: "-20",
      longitude: "44",
      _count: { declarations: 0 },
      user: { firstName: "Rina", lastName: "M", email: account.email },
    });
    const response = await deleteMaritimeUser(
      new Request("http://localhost/api/maritime-users/mar-profile-1", { method: "DELETE" }),
      params("mar-profile-1"),
    );

    expect(response.status).toBe(200);
    expect(db.maritimeUser.delete).toHaveBeenCalledWith({ where: { id: "mar-profile-1" } });
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "user-mar-1" } });
    expect(auditEntries(db)[0]).toMatchObject({
      userId: ADMIN.id,
      action: "DELETE",
      entityType: "MaritimeUser",
      entityId: "mar-profile-1",
    });
  });

  it("réinitialise le mot de passe, invalide les sessions et ne journalise pas le secret", async () => {
    db.maritimeUser.findUnique.mockResolvedValue({
      id: "mar-profile-1",
      userId: "user-mar-1",
      user: { email: account.email },
    });
    const newPassword = "Un-nouveau-mot-de-passe-42";
    const response = await resetMaritimeUserPassword(
      jsonRequest("/api/maritime-users/mar-profile-1/password", "POST", { password: newPassword }),
      params("mar-profile-1"),
    );
    const { status, body } = await read(response);
    const updateData = db.user.update.mock.calls[0][0].data as {
      passwordHash: string;
      sessionVersion: { increment: number };
    };

    expect(status).toBe(200);
    expect(await bcrypt.compare(newPassword, updateData.passwordHash)).toBe(true);
    expect(updateData.sessionVersion).toEqual({ increment: 1 });
    expect(db.loginFailure.deleteMany).toHaveBeenCalledWith({ where: { email: account.email } });
    expect(JSON.stringify(body)).not.toContain(newPassword);
    expect(JSON.stringify(auditEntries(db))).not.toContain(newPassword);
    expect(auditEntries(db)[0]).toMatchObject({ action: "RESET_PASSWORD", entityType: "MaritimeUser" });
  });
});

describe("liste paginée", () => {
  it("renvoie le compte sans données sensibles avec pagination", async () => {
    db.maritimeUser.count.mockResolvedValue(11);
    db.maritimeUser.findMany.mockResolvedValue([]);
    const { status, body } = await read(await listMaritimeUsers(
      new Request("http://localhost/api/maritime-users?q=Rina&page=2"),
    ));

    expect(status).toBe(200);
    expect(body.pagination).toEqual({ page: 2, totalPages: 2, total: 11 });
    expect(db.maritimeUser.findMany.mock.calls[0][0]).toMatchObject({
      skip: 10,
      take: 10,
    });
  });

  it("permet aussi de rechercher un statut", async () => {
    db.maritimeUser.count.mockResolvedValue(0);
    db.maritimeUser.findMany.mockResolvedValue([]);
    await listMaritimeUsers(new Request("http://localhost/api/maritime-users?q=Inactif"));
    expect(db.maritimeUser.findMany.mock.calls[0][0].where.OR).toContainEqual({
      user: { isActive: false },
    });
  });
});
