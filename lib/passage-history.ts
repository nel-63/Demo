// Transforme les révisions brutes d'un passage (instantanés JSON) en historique lisible :
// qui a fait quoi, quand, et ce qui a changé (avant / maintenant). Fonctions pures, testables.

import { ALL_PAYMENT_METHOD_LABELS, formatMGA } from "@/lib/audit";

export type RawRevision = {
  id: string;
  version: number;
  action: string; // BASELINE | UPDATE | DELETE
  snapshot: unknown;
  createdAt: string;
  actor: { firstName: string; lastName: string };
};

export type HistoryChange = { label: string; before: string; after: string };
export type HistoryDetail = { label: string; value: string };

export type HistoryEntry = {
  id: string;
  kind: "initial" | "updated" | "deleted";
  title: string;
  // Auteur de l'action. Absent pour l'état d'origine : le journal ne garde pas qui l'a créé
  // à cet endroit (c'est le régisseur indiqué dans la liste des passages).
  author: string | null;
  when: string; // date ISO
  changes: HistoryChange[]; // modifications : ce qui a changé
  details: HistoryDetail[]; // état d'origine ou suppression : résumé du passage
};

type Group = "passage" | "product" | "payment";
type Kind = "text" | "date" | "tonnage" | "money" | "method";
type Field = { group: Group; key: string; label: string; kind: Kind };

// L'ordre est celui du formulaire : produit, trajet, véhicule et chauffeur, paiement, observations.
const FIELDS: Field[] = [
  { group: "product", key: "name", label: "Nom du produit", kind: "text" },
  { group: "product", key: "type", label: "Type de produit", kind: "text" },
  { group: "product", key: "tonnage", label: "Tonnage", kind: "tonnage" },
  { group: "product", key: "description", label: "Description du produit", kind: "text" },
  { group: "passage", key: "origin", label: "Provenance", kind: "text" },
  { group: "passage", key: "destination", label: "Destination", kind: "text" },
  { group: "passage", key: "assignedAt", label: "Date du passage", kind: "date" },
  { group: "passage", key: "dateQuittance", label: "Date de quittance", kind: "date" },
  { group: "passage", key: "vehicleRegistration", label: "Immatriculation du véhicule", kind: "text" },
  { group: "passage", key: "vehicleCharacteristics", label: "Caractéristiques du véhicule", kind: "text" },
  { group: "passage", key: "vehicleInfo", label: "Autres informations sur le véhicule", kind: "text" },
  { group: "passage", key: "driverName", label: "Chauffeur", kind: "text" },
  { group: "passage", key: "driverLicenseNumber", label: "N° de permis du chauffeur", kind: "text" },
  { group: "payment", key: "paymentMethod", label: "Mode de paiement", kind: "method" },
  { group: "payment", key: "reference", label: "Référence du paiement", kind: "text" },
  { group: "payment", key: "amountDue", label: "Montant à payer", kind: "money" },
  { group: "payment", key: "amountReceived", label: "Montant reçu", kind: "money" },
  { group: "payment", key: "changeReturned", label: "Monnaie rendue", kind: "money" },
  { group: "passage", key: "notes", label: "Observations", kind: "text" },
];

// Champs affichés dans le résumé d'un passage (état d'origine, suppression).
const SUMMARY_KEYS = new Set([
  "name", "tonnage", "origin", "destination", "assignedAt", "dateQuittance",
  "vehicleRegistration", "driverName", "paymentMethod", "amountDue",
]);

const EMPTY = "Non renseigné";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeZone: "Indian/Antananarivo",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Snap = Partial<Record<Group, Record<string, unknown> | null>>;

function asSnap(value: unknown): Snap | null {
  if (!isRecord(value)) return null;
  return {
    passage: isRecord(value.passage) ? value.passage : null,
    product: isRecord(value.product) ? value.product : null,
    payment: isRecord(value.payment) ? value.payment : null,
  };
}

function formatValue(kind: Kind, value: unknown): string {
  if (value === null || value === undefined || value === "") return EMPTY;
  switch (kind) {
    case "date": {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? String(value) : dateFormatter.format(date);
    }
    case "tonnage": {
      const number = Number(value);
      return Number.isFinite(number) ? `${number.toLocaleString("fr-FR")} t` : String(value);
    }
    case "money":
      return formatMGA(value);
    case "method":
      return ALL_PAYMENT_METHOD_LABELS[String(value)] ?? String(value);
    default:
      return String(value);
  }
}

const read = (snap: Snap | null, field: Field) =>
  formatValue(field.kind, snap?.[field.group]?.[field.key]);

function diff(before: Snap | null, after: Snap | null): HistoryChange[] {
  const changes: HistoryChange[] = [];
  for (const field of FIELDS) {
    const from = read(before, field);
    const to = read(after, field);
    // On compare les textes affichés : « 8.50 » et « 8,5 t » ne sont pas un changement.
    if (from !== to) changes.push({ label: field.label, before: from, after: to });
  }
  return changes;
}

function summary(snap: Snap | null): HistoryDetail[] {
  if (!snap) return [];
  const details: HistoryDetail[] = [];
  for (const field of FIELDS) {
    if (!SUMMARY_KEYS.has(field.key)) continue;
    const value = read(snap, field);
    if (value !== EMPTY) details.push({ label: field.label, value });
  }
  return details;
}

const fullName = (actor: { firstName: string; lastName: string }) =>
  `${actor.firstName} ${actor.lastName}`.trim();

export function buildHistory(revisions: RawRevision[]): HistoryEntry[] {
  return revisions.map((revision) => {
    const base = { id: revision.id, when: revision.createdAt };

    if (revision.action === "BASELINE") {
      return {
        ...base,
        kind: "initial" as const,
        title: "Passage tel qu'il a été enregistré à l'origine",
        author: null,
        changes: [],
        details: summary(asSnap(revision.snapshot)),
      };
    }

    const pair = isRecord(revision.snapshot) ? revision.snapshot : {};
    const before = asSnap(pair.before);
    const after = asSnap(pair.after);

    if (revision.action === "DELETE") {
      return {
        ...base,
        kind: "deleted" as const,
        title: "Passage supprimé",
        author: fullName(revision.actor),
        changes: [],
        details: summary(before),
      };
    }

    return {
      ...base,
      kind: "updated" as const,
      title: "Passage modifié",
      author: fullName(revision.actor),
      changes: diff(before, after),
      details: [],
    };
  });
}
