import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { prisma } from "@/lib/prisma";
import { createSession, endSession } from "@/lib/auth";
import { resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { jsonRequest, read } from "../helpers/http";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({
  createSession: vi.fn(),
  endSession: vi.fn(),
}));

const db = prisma as unknown as FakePrisma;

const PASSWORD = "Mot-de-passe-correct-1";
// Coût 4 : suffisant pour un test, bien plus rapide que le coût 12 de production.
const hash = bcrypt.hashSync(PASSWORD, 4);

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    firstName: "Rina",
    lastName: "R",
    email: "rina@test.mg",
    passwordHash: hash,
    role: "SUPERVISOR",
    isActive: true,
    sessionVersion: 3,
    createdAt: new Date(),
    lastLoginAt: new Date(),
    maritimeProfile: null,
    ...overrides,
  };
}

function attempt(identifier: string, password: string) {
  return login(jsonRequest("/api/auth/login", "POST", { identifier, password }));
}

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(createSession).mockReset();
  vi.mocked(endSession).mockReset();
  db.loginFailure.count.mockResolvedValue(0);
});

describe("connexion réussie", () => {
  it("ouvre une session avec la version de session actuelle et efface les échecs", async () => {
    db.user.findFirst.mockResolvedValue(user());
    const { status, body } = await read(await attempt("Rina@Test.mg ", PASSWORD));

    expect(status).toBe(200);
    expect(createSession).toHaveBeenCalledWith({ id: "u1", sessionVersion: 3 });
    expect(db.user.findFirst.mock.calls[0][0].where.OR[0]).toEqual({ email: "rina@test.mg" });
    expect(db.loginFailure.deleteMany).toHaveBeenCalled();
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(JSON.stringify(body)).not.toContain("passwordHash");
  });

  it("authentifie un utilisateur maritime avec le même mécanisme de session", async () => {
    db.user.findFirst.mockResolvedValue(user({
      role: "USER_MAR",
      maritimeProfile: { id: "mar-1", companyName: "Société Océan", onboardingComplete: true },
    }));
    const { status, body } = await read(await attempt("rina@test.mg", PASSWORD));

    expect(status).toBe(200);
    expect((body.user as { role: string }).role).toBe("USER_MAR");
    expect(createSession).toHaveBeenCalledWith({ id: "u1", sessionVersion: 3 });
  });

  it("signale le premier profil à compléter, sans demander le nom de société", async () => {
    db.user.findFirst.mockResolvedValue(user({
      role: "USER_MAR",
      email: null,
      maritimeProfile: { id: "mar-1", companyName: "Société Océan", onboardingComplete: false },
    }));

    const { status, body } = await read(await attempt("mariner-01", PASSWORD));

    expect(status).toBe(200);
    expect(db.user.findFirst.mock.calls[0][0].where.OR).toContainEqual({
      maritimeProfile: { is: { loginId: "mariner-01", onboardingComplete: false } },
    });
    expect(body.needsOnboarding).toBe(true);
  });

  it("n'exige jamais le nom de société : identifiant et mot de passe suffisent", async () => {
    db.user.findFirst.mockResolvedValue(user({
      role: "USER_MAR",
      email: null,
      maritimeProfile: { id: "mar-1", companyName: "Société Océan", onboardingComplete: false },
    }));

    expect((await read(await attempt("mariner-01", PASSWORD))).status).toBe(200);
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it("refuse un mauvais mot de passe à la première connexion", async () => {
    db.user.findFirst.mockResolvedValue(user({
      role: "USER_MAR",
      email: null,
      maritimeProfile: { id: "mar-1", companyName: "Société Océan", onboardingComplete: false },
    }));

    expect((await read(await attempt("mariner-01", "mot-de-passe-incorrect"))).status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("erreurs de connexion", () => {
  it("refuse un mauvais mot de passe et enregistre l'échec", async () => {
    db.user.findFirst.mockResolvedValue(user());
    const { status, body } = await read(await attempt("rina@test.mg", "mauvais-mot-de-passe"));

    expect(status).toBe(401);
    expect(body.message).toBe("Identifiant ou mot de passe incorrect.");
    expect(createSession).not.toHaveBeenCalled();
    expect(db.loginFailure.create).toHaveBeenCalledTimes(1);
  });

  it("répond de la même façon pour un email inconnu (pas de fuite d'information)", async () => {
    db.user.findFirst.mockResolvedValue(null);
    const unknown = await read(await attempt("inconnu@test.mg", PASSWORD));

    db.user.findFirst.mockResolvedValue(user());
    const wrong = await read(await attempt("rina@test.mg", "mauvais-mot-de-passe"));

    expect(unknown.status).toBe(401);
    expect(unknown).toEqual(wrong);
  });

  it("refuse un compte désactivé même avec le bon mot de passe", async () => {
    db.user.findFirst.mockResolvedValue(user({ isActive: false }));
    const { status } = await read(await attempt("rina@test.mg", PASSWORD));

    expect(status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("refuse un mauvais mot de passe pour un utilisateur maritime et enregistre l'échec", async () => {
    db.user.findFirst.mockResolvedValue(user({
      role: "USER_MAR",
      maritimeProfile: { id: "mar-1", companyName: "Société Océan", onboardingComplete: true },
    }));
    const { status } = await read(await attempt("rina@test.mg", "mot-de-passe-incorrect"));

    expect(status).toBe(401);
    expect(db.loginFailure.create).toHaveBeenCalledTimes(1);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("refuse un compte maritime désactivé", async () => {
    const lastLoginAt = new Date();
    lastLoginAt.setUTCMonth(lastLoginAt.getUTCMonth() - 4);
    db.user.findFirst.mockResolvedValue(user({
      role: "USER_MAR",
      isActive: false,
      lastLoginAt,
      maritimeProfile: { id: "mar-1", companyName: "Société Océan", onboardingComplete: true },
    }));
    const { status, body } = await read(await attempt("rina@test.mg", PASSWORD));

    expect(status).toBe(403);
    expect(body.message).toBe("Ce compte n'est plus actif. Contactez votre société ou l'administrateur.");
    expect(createSession).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.loginFailure.create).not.toHaveBeenCalled();
  });

  it("refuse des champs vides ou trop longs", async () => {
    expect((await read(await attempt("", PASSWORD))).status).toBe(400);
    expect((await read(await attempt("rina@test.mg", ""))).status).toBe(400);
    expect((await read(await attempt("rina@test.mg", "x".repeat(201)))).status).toBe(400);
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it("désactive automatiquement un compte maritime après trois mois sans connexion", async () => {
    const lastLoginAt = new Date();
    lastLoginAt.setUTCMonth(lastLoginAt.getUTCMonth() - 4);
    db.user.findFirst.mockResolvedValue(user({
      role: "USER_MAR",
      lastLoginAt,
      maritimeProfile: { id: "mar-1", companyName: "Société Océan", onboardingComplete: true },
    }));
    const { status, body } = await read(await attempt("rina@test.mg", PASSWORD));

    expect(status).toBe(403);
    expect(body.message).toContain("n'est plus actif");
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { isActive: false, sessionVersion: { increment: 1 } },
    });
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("limitation des tentatives", () => {
  it("bloque un email après 5 échecs, même avec le bon mot de passe", async () => {
    db.loginFailure.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
    db.user.findFirst.mockResolvedValue(user());
    const response = await attempt("rina@test.mg", PASSWORD);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("bloque une adresse IP après 20 échecs", async () => {
    db.loginFailure.count.mockResolvedValueOnce(0).mockResolvedValueOnce(20);
    const response = await attempt("autre@test.mg", PASSWORD);

    expect(response.status).toBe(429);
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });
});

describe("déconnexion", () => {
  it("invalide la session côté serveur", async () => {
    const { status } = await read(await logout());

    expect(status).toBe(200);
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it("répond quand même si l'invalidation échoue (le cookie est supprimé)", async () => {
    vi.mocked(endSession).mockRejectedValue(new Error("base indisponible"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await read(await logout())).status).toBe(200);
  });
});
