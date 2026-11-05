// Règles de paiement d'un passage (montants en centimes pour éviter les erreurs d'arrondi).

// Modes acceptés pour toute NOUVELLE opération (création ou modification d'un passage).
export const PAYMENT_METHODS = ["CASH", "MOBILE_MONEY", "CHECK"] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

// Modes qui ne peuvent plus être saisis mais restent lisibles dans l'historique, les
// rapports et les exports (valeurs conservées dans l'enum Prisma et en base).
export const LEGACY_PAYMENT_METHODS = ["BANK_TRANSFER", "OTHER"] as const;
export type LegacyPaymentMethodValue = (typeof LEGACY_PAYMENT_METHODS)[number];

// Vrai uniquement pour un mode autorisé en saisie ; refuse les anciens modes et toute valeur inconnue.
export function isPaymentMethod(value: string): value is PaymentMethodValue {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

// "12500.50" -> 1250050 ; null si le texte n'est pas un montant valide (2 décimales max).
export function parseCents(value: string): number | null {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

export function toDecimal(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export type PaymentCheck =
  | { ok: true; changeCents: number }
  | { ok: false; error: "INSUFFICIENT" | "EXACT_REQUIRED" };

// Espèces : le montant reçu couvre au moins le montant dû, la monnaie est rendue.
// Mobile Money : montant exact et référence obligatoire. Jamais de paiement partiel.
export function checkPayment(input: {
  method: PaymentMethodValue;
  reference: string;
  dueCents: number;
  receivedCents: number;
}): PaymentCheck {
  if (input.method === "CASH") {
    if (input.receivedCents < input.dueCents) return { ok: false, error: "INSUFFICIENT" };
    return { ok: true, changeCents: input.receivedCents - input.dueCents };
  }

  if (!input.reference || input.receivedCents !== input.dueCents) {
    return { ok: false, error: "EXACT_REQUIRED" };
  }
  return { ok: true, changeCents: 0 };
}
