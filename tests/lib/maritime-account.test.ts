import { describe, expect, it } from "vitest";
import {
  isMaritimeAccountExpired,
  MaritimeContactValidationError,
  validateMaritimeContact,
} from "@/lib/maritime-account";

describe("expiration du compte maritime", () => {
  it("mesure trois mois depuis la dernière connexion, ou depuis la création si jamais connecté", () => {
    const createdAt = new Date("2026-01-31T12:00:00.000Z");
    const lastLoginAt = new Date("2026-02-15T12:00:00.000Z");

    expect(isMaritimeAccountExpired(lastLoginAt, createdAt, new Date("2026-05-14T12:00:00.000Z"))).toBe(false);
    expect(isMaritimeAccountExpired(lastLoginAt, createdAt, new Date("2026-05-15T12:00:00.000Z"))).toBe(true);
    expect(isMaritimeAccountExpired(null, createdAt, new Date("2026-04-29T12:00:00.000Z"))).toBe(false);
    expect(isMaritimeAccountExpired(null, createdAt, new Date("2026-04-30T12:00:00.000Z"))).toBe(true);
  });
});

describe("coordonnées de connexion maritimes", () => {
  it("normalise l'email et conserve un téléphone au format saisi", () => {
    expect(validateMaritimeContact("  MARINER@EXAMPLE.MG ", "+261 34 00 000 00")).toEqual({
      email: "mariner@example.mg",
      phone: "+261 34 00 000 00",
    });
  });

  it("refuse un email ou un téléphone invalide", () => {
    expect(() => validateMaritimeContact("invalid", "0340000000")).toThrow(MaritimeContactValidationError);
    expect(() => validateMaritimeContact("mariner@example.mg", "x")).toThrow(MaritimeContactValidationError);
  });
});
