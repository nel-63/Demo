import { describe, expect, it } from "vitest";
import {
  actionLabel,
  buildAuditWhere,
  describeAudit,
  entityLabel,
  formatMGA,
  periodStart,
} from "@/lib/audit";

describe("describeAudit", () => {
  it("affiche montant dû, montant reçu, monnaie, mode et référence d'un paiement", () => {
    const lines = describeAudit("Payment", "CREATE", {
      amountDue: "40000.00",
      amountReceived: "50000.00",
      changeReturned: "10000.00",
      paymentMethod: "BANK_TRANSFER",
      reference: "VIR-2026-001",
    });

    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/^Montant dû : .*40.*000,00 MGA$/);
    expect(lines[1]).toMatch(/^Montant reçu : .*50.*000,00 MGA$/);
    expect(lines[2]).toMatch(/^Monnaie rendue : .*10.*000,00 MGA$/);
    expect(lines).toContain("Mode : Virement bancaire");
    expect(lines).toContain("Référence : VIR-2026-001");
  });

  it("n'affiche pas de référence vide pour un paiement en espèces", () => {
    const lines = describeAudit("Payment", "CREATE", {
      amountDue: "1000.00",
      amountReceived: "1000.00",
      changeReturned: "0.00",
      paymentMethod: "CASH",
      reference: null,
    });

    expect(lines).toContain("Mode : Espèces");
    expect(lines.some((line) => line.startsWith("Référence"))).toBe(false);
  });

  it("décrit un changement de statut avec les libellés français", () => {
    expect(
      describeAudit("TransportAssignment", "CHANGE_TRANSPORT_STATUS", {
        previousStatus: "PLANNED",
        newStatus: "IN_PROGRESS",
      }),
    ).toEqual(["Statut : Planifié → En cours"]);
  });

  it("décrit un changement de chauffeur", () => {
    expect(
      describeAudit("Vehicle", "CHANGE_DRIVER", {
        previousDriverName: "Jean Rakoto",
        newDriverName: "Paul Rabe",
      }),
    ).toEqual(["Chauffeur : Jean Rakoto → Paul Rabe"]);
  });

  it("ne contient jamais de mot de passe pour une réinitialisation", () => {
    const lines = describeAudit("Supervisor", "RESET_PASSWORD", {
      email: "rina@test.mg",
      password: "ne-doit-pas-apparaitre",
    });

    expect(lines.join(" ")).not.toContain("ne-doit-pas-apparaitre");
    expect(lines).toContain("Compte : rina@test.mg");
  });

  it("remplace un identifiant de lieu par son nom quand il est connu", () => {
    const lines = describeAudit(
      "Driver",
      "CREATE",
      { locationId: "loc-1" },
      { locations: { "loc-1": "Tamatave" } },
    );

    expect(lines).toContain("Lieu : Tamatave");
  });

  it("supporte des détails absents ou invalides sans planter", () => {
    expect(describeAudit("Driver", "CREATE", null)).toEqual([]);
    expect(describeAudit("Driver", "CREATE", "texte")).toEqual([]);
    expect(describeAudit("Driver", "CREATE", [1, 2])).toEqual([]);
  });
});

describe("libellés", () => {
  it("traduit les actions et types connus et garde les inconnus tels quels", () => {
    expect(actionLabel("DEACTIVATE")).toBe("Désactivation");
    expect(actionLabel("AUTRE")).toBe("AUTRE");
    expect(entityLabel("TransportAssignment")).toBe("Transport");
    expect(entityLabel("Inconnu")).toBe("Inconnu");
  });

  it("formate les montants en MGA", () => {
    expect(formatMGA("1234.5")).toMatch(/^1.234,50 MGA$/);
    expect(formatMGA("abc")).toBe("abc");
  });
});

describe("filtres du journal", () => {
  const now = new Date("2026-10-28T10:30:00.000Z");

  it("calcule le début de chaque période", () => {
    expect(periodStart("today", now)?.toISOString()).toBe("2026-10-28T00:00:00.000Z");
    expect(periodStart("7d", now)?.toISOString()).toBe("2026-10-21T10:30:00.000Z");
    expect(periodStart("30d", now)?.toISOString()).toBe("2026-09-28T10:30:00.000Z");
    expect(periodStart("", now)).toBeNull();
  });

  it("sans filtre, aucune condition n'est ajoutée", () => {
    expect(buildAuditWhere({ q: "", entityType: "", action: "", period: "" }, now)).toEqual({});
  });

  it("combine type, action et période", () => {
    const where = buildAuditWhere(
      { q: "", entityType: "Payment", action: "CREATE", period: "today" },
      now,
    );

    expect(where).toMatchObject({
      entityType: "Payment",
      action: "CREATE",
      createdAt: { gte: new Date("2026-10-28T00:00:00.000Z") },
    });
  });

  it("chaque mot de la recherche doit être trouvé (nom, email ou identifiant)", () => {
    const where = buildAuditWhere(
      { q: "rina rakoto", entityType: "", action: "", period: "" },
      now,
    ) as { AND: Array<{ OR: unknown[] }> };

    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR).toHaveLength(4);
  });

  it("limite la recherche à 5 mots", () => {
    const where = buildAuditWhere(
      { q: "a b c d e f g", entityType: "", action: "", period: "" },
      now,
    ) as { AND: unknown[] };

    expect(where.AND).toHaveLength(5);
  });
});
