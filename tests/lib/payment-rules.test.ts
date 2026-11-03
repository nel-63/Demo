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
  const base = { reference: "", dueCents: 4000000 };

  it("espèces : montant exact ou supérieur avec monnaie", () => {
    expect(checkPayment({ ...base, method: "CASH", receivedCents: 4000000 })).toEqual({ ok: true, changeCents: 0 });
    expect(checkPayment({ ...base, method: "CASH", receivedCents: 5000000 })).toEqual({ ok: true, changeCents: 1000000 });
  });

  it("espèces : jamais de paiement partiel", () => {
    expect(checkPayment({ ...base, method: "CASH", receivedCents: 3999999 })).toEqual({ ok: false, error: "INSUFFICIENT" });
  });

  it.each(["MOBILE_MONEY"] as const)(
    "%s : montant exact et référence obligatoires",
    (method) => {
      expect(checkPayment({ ...base, method, reference: "REF-1", receivedCents: 4000000 })).toEqual({ ok: true, changeCents: 0 });
      expect(checkPayment({ ...base, method, reference: "", receivedCents: 4000000 })).toEqual({ ok: false, error: "EXACT_REQUIRED" });
      expect(checkPayment({ ...base, method, reference: "REF-1", receivedCents: 4000001 })).toEqual({ ok: false, error: "EXACT_REQUIRED" });
      expect(checkPayment({ ...base, method, reference: "REF-1", receivedCents: 3999999 })).toEqual({ ok: false, error: "EXACT_REQUIRED" });
    },
  );

  it("reconnaît les modes de paiement valides", () => {
    expect(isPaymentMethod("CASH")).toBe(true);
    expect(isPaymentMethod("MOBILE_MONEY")).toBe(true);
    expect(isPaymentMethod("BITCOIN")).toBe(false);
  });

  it.each(["CHECK", "BANK_TRANSFER", "OTHER", "BITCOIN", "", "cash"])(
    "refuse %j pour une nouvelle opération",
    (value) => expect(isPaymentMethod(value)).toBe(false),
  );
});

describe("modes autorisés et modes historiques", () => {
  it("n'autorise que Espèces et Mobile Money en saisie", () => {
    expect([...PAYMENT_METHODS]).toEqual(["CASH", "MOBILE_MONEY"]);
  });

  it("les formulaires (libellés de saisie) ne proposent que les deux modes autorisés", () => {
    expect(Object.keys(PAYMENT_METHOD_LABELS)).toEqual([...PAYMENT_METHODS]);
    expect(PAYMENT_METHOD_LABELS).toEqual({ CASH: "Espèces", MOBILE_MONEY: "Mobile Money" });
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
