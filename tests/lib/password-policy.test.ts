import { describe, expect, it } from "vitest";
import { validatePassword } from "@/lib/password-policy";

describe("validatePassword", () => {
  it("accepte un mot de passe de 12 à 200 caractères", () => {
    expect(validatePassword("a".repeat(12))).toBeNull();
    expect(validatePassword("a".repeat(200))).toBeNull();
  });

  it("refuse un mot de passe trop court ou trop long", () => {
    expect(validatePassword("a".repeat(11))).toMatch(/entre 12 et 200/);
    expect(validatePassword("a".repeat(201))).toMatch(/entre 12 et 200/);
  });

  it("refuse une valeur qui n'est pas du texte", () => {
    expect(validatePassword(undefined)).not.toBeNull();
    expect(validatePassword(123456789012)).not.toBeNull();
    expect(validatePassword(null)).not.toBeNull();
  });
});
