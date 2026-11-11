import { describe, expect, it } from "vitest";
import { buildHistory, type RawRevision } from "@/lib/passage-history";

const actor = { firstName: "Rina", lastName: "Rakoto" };

const snapshot = (over: { passage?: object; product?: object; payment?: object | null } = {}) => ({
  passage: {
    id: "pas-1",
    assignedAt: "2026-10-29T12:00:00.000Z",
    origin: "Antsirabe",
    destination: "Toamasina",
    driverName: "Jean",
    vehicleRegistration: "1234 TAA",
    vehicleCharacteristics: "Camion benne blanc",
    driverLicenseNumber: "P-998877",
    deletedAt: null,
    ...over.passage,
  },
  product: { id: "prod-1", name: "Riz blanc", type: "Céréale", tonnage: "8.50", description: null, deletedAt: null, ...over.product },
  payment:
    over.payment === null
      ? null
      : {
          id: "pay-1", paymentMethod: "CASH", reference: null,
          amountDue: "40000.00", deletedAt: null,
          ...over.payment,
        },
});

const revision = (over: Partial<RawRevision>): RawRevision => ({
  id: "rev-1", version: 2, action: "UPDATE", snapshot: {}, createdAt: "2026-11-02T08:20:00.000Z", actor, ...over,
});

describe("historique lisible d'un passage", () => {
  it("n'affiche ni numéro de version ni code technique", () => {
    const [entry] = buildHistory([
      revision({ snapshot: { before: snapshot(), after: snapshot({ product: { tonnage: "9.00" } }) } }),
    ]);
    // Ce que l'utilisateur voit : titre, auteur, changements et détails.
    const text = JSON.stringify([entry.title, entry.author, entry.changes, entry.details]);

    expect(entry.title).toBe("Passage modifié");
    expect(entry.author).toBe("Rina Rakoto");
    expect(text).not.toMatch(/version|UPDATE|BASELINE|DELETE|snapshot/i);
  });

  it("décrit chaque changement avec « avant » et « maintenant » en français", () => {
    const [entry] = buildHistory([
      revision({
        snapshot: {
          before: snapshot(),
          after: snapshot({
            product: { tonnage: "9.00" },
            payment: { paymentMethod: "BANK_TRANSFER", reference: "VIR-1" },
          }),
        },
      }),
    ]);

    expect(entry.changes).toEqual([
      { label: "Tonnage", before: "8,5 t", after: "9 t" },
      { label: "Mode de paiement", before: "Espèces", after: "Virement bancaire" },
      { label: "Référence du paiement", before: "Non renseigné", after: "VIR-1" },
    ]);
  });

  it("affiche lisiblement un ancien paiement par chèque ou par autre mode", () => {
    const [entry] = buildHistory([
      revision({
        snapshot: {
          before: snapshot({ payment: { paymentMethod: "CHECK", reference: "CHQ-1" } }),
          after: snapshot({ payment: { paymentMethod: "OTHER", reference: "CHQ-1" } }),
        },
      }),
    ]);
    expect(entry.changes).toContainEqual({ label: "Mode de paiement", before: "Chèque", after: "Autre" });
  });

  it("ne signale pas comme un changement une simple différence d'écriture", () => {
    const [entry] = buildHistory([
      revision({ snapshot: { before: snapshot({ product: { tonnage: "8.5" } }), after: snapshot({ product: { tonnage: "8.50" } }) } }),
    ]);
    expect(entry.changes).toEqual([]);
  });

  it("formate la date du passage", () => {
    const [entry] = buildHistory([
      revision({
        snapshot: {
          before: snapshot(),
          after: snapshot({ passage: { assignedAt: "2026-10-30T12:00:00.000Z" } }),
        },
      }),
    ]);

    expect(entry.changes).toContainEqual({ label: "Date du passage", before: "29 octobre 2026", after: "30 octobre 2026" });
  });

  it("ignore les champs retirés des anciennes révisions", () => {
    const [entry] = buildHistory([
      revision({
        snapshot: {
          before: snapshot({
            passage: { vehicleInfo: "Ancienne description", notes: "Ancienne observation" },
            payment: { amountReceived: "50000.00", changeReturned: "10000.00" },
          }),
          after: snapshot({
            passage: { vehicleInfo: null, notes: null },
            payment: { amountReceived: "40000.00", changeReturned: "0.00" },
          }),
        },
      }),
    ]);

    expect(entry.changes).toEqual([]);
    expect(JSON.stringify(entry)).not.toContain("Ancienne");
  });

  it("affiche la date de quittance dans l'historique et les résumés", () => {
    const [entry] = buildHistory([
      revision({
        action: "BASELINE",
        snapshot: snapshot({ passage: { dateQuittance: "2026-10-15" } }),
      }),
    ]);
    expect(entry.details).toContainEqual({ label: "Date de quittance", value: "15 octobre 2026" });
  });

  it("résume le passage supprimé et indique qui l'a supprimé", () => {
    const [entry] = buildHistory([
      revision({ action: "DELETE", snapshot: { before: snapshot(), after: snapshot({ passage: { deletedAt: "2026-11-02T09:00:00.000Z" } }) } }),
    ]);

    expect(entry.kind).toBe("deleted");
    expect(entry.title).toBe("Passage supprimé");
    expect(entry.author).toBe("Rina Rakoto");
    expect(entry.details).toContainEqual({ label: "Nom du produit", value: "Riz blanc" });
    expect(entry.details).toContainEqual({ label: "Tonnage", value: "8,5 t" });
    expect(entry.details).toContainEqual({ label: "Immatriculation du véhicule", value: "1234 TAA" });
  });

  it("présente l'état d'origine sans l'attribuer à la personne qui a fait la première modification", () => {
    const [entry] = buildHistory([revision({ action: "BASELINE", version: 1, snapshot: snapshot() })]);

    expect(entry.kind).toBe("initial");
    expect(entry.author).toBeNull();
    expect(entry.details).toContainEqual({ label: "Destination", value: "Toamasina" });
    expect(entry.changes).toEqual([]);
  });

  it("garde l'ordre reçu (le plus récent d'abord) et ne plante pas sur des données inattendues", () => {
    const entries = buildHistory([
      revision({ id: "b", snapshot: "n'importe quoi" }),
      revision({ id: "a", action: "BASELINE", snapshot: null }),
    ]);

    expect(entries.map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(entries[0].changes).toEqual([]);
    expect(entries[1].details).toEqual([]);
  });
});
