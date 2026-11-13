import { describe, expect, it } from "vitest";
import { MaritimeContactValidationError, validateMaritimeContact } from "@/lib/maritime-account";

describe("coordonnées de contact du compte maritime", () => {
  it("normalise l'email et conserve le téléphone au format saisi", () => {
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
