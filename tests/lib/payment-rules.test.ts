import { describe, expect, it } from "vitest";
import {
  LEGACY_PAYMENT_METHODS,
  PAYMENT_METHODS,
  checkPayment,
  isPaymentMethod,
  parseCents,
  toDecimal,
} from "@/lib/payment-rules";
import { ALL_PAYMENT_METHOD_LABELS, LEGACY_PAYMENT_METHOD_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/audit";

describe("parseCents / toDecimal", () => {
  it("convertit un montant en centimes et inversement", () => {
    expect(parseCents("40000")).toBe(4000000);
    expect(parseCents("12500.5")).toBe(1250050);
    expect(parseCents("0.01")).toBe(1);
    expect(toDecimal(1250050)).toBe("12500.50");
    expect(toDecimal(5)).toBe("0.05");
  });

  it.each(["", "abc", "-5", "10.123", "1,5", "1e3", " 5", "1234567890123"])(
    "refuse %j",
    (value) => expect(parseCents(value)).toBeNull(),
  );
});

describe("checkPayment", () => {
  it("n'exige pas de référence pour les espèces", () => {
    expect(checkPayment({ method: "CASH", reference: "" })).toEqual({ ok: true });
  });

  it.each(["MOBILE_MONEY", "CHECK"] as const)(
    "%s : référence obligatoire",
    (method) => {
      expect(checkPayment({ method, reference: "REF-1" })).toEqual({ ok: true });
      expect(checkPayment({ method, reference: "" })).toEqual({ ok: false, error: "REFERENCE_REQUIRED" });
    },
  );

  it("reconnaît les modes de paiement valides", () => {
    expect(isPaymentMethod("CASH")).toBe(true);
    expect(isPaymentMethod("MOBILE_MONEY")).toBe(true);
    expect(isPaymentMethod("CHECK")).toBe(true);
    expect(isPaymentMethod("BITCOIN")).toBe(false);
  });

  it.each(["BANK_TRANSFER", "OTHER", "BITCOIN", "", "cash"])(
    "refuse %j pour une nouvelle opération",
    (value) => expect(isPaymentMethod(value)).toBe(false),
  );
});

describe("modes autorisés et modes historiques", () => {
  it("autorise Espèces, Mobile Money et Chèque en saisie", () => {
    expect([...PAYMENT_METHODS]).toEqual(["CASH", "MOBILE_MONEY", "CHECK"]);
  });

  it("les formulaires proposent tous les modes autorisés", () => {
    expect(Object.keys(PAYMENT_METHOD_LABELS)).toEqual([...PAYMENT_METHODS]);
    expect(PAYMENT_METHOD_LABELS).toEqual({
      CASH: "Espèces",
      MOBILE_MONEY: "Mobile Money",
      CHECK: "Chèque",
    });
  });

  it("chaque ancien mode garde un libellé explicite pour l'historique", () => {
    expect(Object.keys(LEGACY_PAYMENT_METHOD_LABELS).sort()).toEqual([...LEGACY_PAYMENT_METHODS].sort());
    expect(ALL_PAYMENT_METHOD_LABELS).toMatchObject({
      CASH: "Espèces",
      MOBILE_MONEY: "Mobile Money",
      CHECK: "Chèque",
      BANK_TRANSFER: "Virement bancaire",
      OTHER: "Autre",
    });
  });
});
