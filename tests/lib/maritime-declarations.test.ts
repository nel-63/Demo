import { describe, expect, it } from "vitest";
import {
  calculateMaritimeTotals,
  MaritimeDeclarationValidationError,
  validateMaritimeDeclaration,
} from "@/lib/maritime-declarations";

const valid = {
  companyName: "Société Océan",
  boatName: "Makoa",
  boatRegistration: "MA-102",
  boatCapacity: "25.5",
  captainName: "Rabe",
  captainPhone: "",
  captainEmail: "capitaine@example.mg",
  originDepartureDate: "2026-10-01",
  arrivalDate: "2026-10-03",
  departureDate: "2026-10-05",
  products: [
    { productType: "Thon", quantity: "10.250", unitPrice: "1250.50" },
  ],
};

describe("validateMaritimeDeclaration", () => {
  it("normalise les textes et accepte les données cohérentes", () => {
    expect(validateMaritimeDeclaration({
      ...valid,
      companyName: "  Société Océan  ",
      captainPhone: " 034 00 000 00 ",
      captainEmail: "",
    })).toMatchObject({
      companyName: "Société Océan",
      captainPhone: "034 00 000 00",
      captainEmail: null,
      products: [{ quantity: "10.250", unitPrice: "1250.50" }],
    });
  });

  it.each([
    [{ ...valid, companyName: "   " }, "société"],
    [{ ...valid, captainPhone: "", captainEmail: "" }, "contact"],
    [{ ...valid, captainEmail: "pas-un-email" }, "email"],
    [{ ...valid, originDepartureDate: "2026-10-04" }, "ordre"],
    [{ ...valid, boatCapacity: "0" }, "supérieur à zéro"],
    [{ ...valid, products: [{ productType: "Thon", quantity: "0", unitPrice: "10" }] }, "supérieur à zéro"],
    [{ ...valid, products: [{ productType: "Thon", quantity: "1", unitPrice: "-1" }] }, "nombre positif"],
  ])("rejette les données invalides avec un message clair", (input, message) => {
    expect(() => validateMaritimeDeclaration(input)).toThrow(MaritimeDeclarationValidationError);
    expect(() => validateMaritimeDeclaration(input)).toThrow(message);
  });

  it("accepte un passage sans produit et sans date de sortie", () => {
    expect(validateMaritimeDeclaration({ ...valid, products: [], departureDate: "" })).toMatchObject({ products: [], departureDate: null });
  });
});

describe("calculateMaritimeTotals", () => {
  it("calcule les lignes et le total sans convertir les montants en flottants", () => {
    expect(calculateMaritimeTotals([
      { quantity: "10.250", unitPrice: "1250.50" },
      { quantity: "2.000", unitPrice: "0.25" },
    ])).toEqual({ lineTotals: ["12817.625", "0.5"], total: "12818.125" });
  });

  it("ne calcule pas une ligne incomplète en saisie", () => {
    expect(calculateMaritimeTotals([
      { quantity: "", unitPrice: "10" },
      { quantity: "2", unitPrice: "10" },
    ])).toEqual({ lineTotals: [null, "20"], total: "20" });
  });
});
