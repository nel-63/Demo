// Outils du journal d'audit : libellés français, description lisible des détails
// et construction des filtres. Fonctions pures (sans accès base) pour rester testables.

export const ACTION_LABELS: Record<string, string> = {
  CREATE: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression logique",
  ACTIVATE: "Activation",
  DEACTIVATE: "Désactivation",
  CHANGE_LOCATION: "Changement de lieu",
  CHANGE_DRIVER: "Changement de chauffeur",
  CHANGE_TRANSPORT_STATUS: "Changement de statut",
  SET_TRANSPORT_AMOUNT: "Fixation du montant",
  RESET_PASSWORD: "Réinitialisation du mot de passe",
};

export const ENTITY_LABELS: Record<string, string> = {
  Location: "Lieu",
  Supervisor: "Régisseur",
  Driver: "Chauffeur", // historique : les chauffeurs ne sont plus gérés
  Vehicle: "Véhicule", // historique : les véhicules ne sont plus gérés
  Passage: "Passage",
  TransportAssignment: "Passage", // anciens enregistrements du journal
  Payment: "Paiement",
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  SUPERVISOR: "Régisseur",
  CASHIER: "Caissier",
  MANAGER: "Responsable",
  ANALYST: "Analyste",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Espèces",
  BANK_TRANSFER: "Virement bancaire",
  CHECK: "Chèque",
  MOBILE_MONEY: "Mobile money",
  OTHER: "Autre",
};

export const TRANSPORT_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planifié",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
};

export const PERIOD_OPTIONS = [
  { value: "today", label: "Aujourd'hui" },
  { value: "7d", label: "7 derniers jours" },
  { value: "30d", label: "30 derniers jours" },
] as const;

export type AuditPeriod = (typeof PERIOD_OPTIONS)[number]["value"];

export const AUDIT_PAGE_SIZE = 25;

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

export function formatMGA(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  return `${number.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MGA`;
}

type Details = Record<string, unknown>;

function asDetails(details: unknown): Details {
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Details)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export type DescribeContext = {
  // id de lieu -> nom, pour afficher « Lieu : X » au lieu d'un identifiant.
  locations?: Record<string, string>;
};

// Transforme les détails bruts d'un log en lignes lisibles pour l'administrateur.
export function describeAudit(
  entityType: string,
  action: string,
  rawDetails: unknown,
  context: DescribeContext = {},
): string[] {
  const details = asDetails(rawDetails);
  const lines: string[] = [];

  if ((action === "UPDATE" || action === "DELETE") && details.before !== undefined) {
    const before = asDetails(details.before);
    const after = asDetails(details.after);
    const beforePassage = asDetails(before.passage);
    const afterPassage = asDetails(after.passage);
    const beforeProduct = asDetails(before.product);
    const afterProduct = asDetails(after.product);
    const beforePayment = asDetails(before.payment);
    const afterPayment = asDetails(after.payment);
    const oldName = str(beforeProduct.name);
    const newName = str(afterProduct.name);
    if (oldName || newName) lines.push(`Produit : ${oldName ?? "—"} → ${newName ?? "—"}`);
    const oldRoute = `${str(beforePassage.origin) ?? "—"} → ${str(beforePassage.destination) ?? "—"}`;
    const newRoute = `${str(afterPassage.origin) ?? "—"} → ${str(afterPassage.destination) ?? "—"}`;
    if (oldRoute !== newRoute) lines.push(`Trajet : ${oldRoute} → ${newRoute}`);
    const oldAmount = beforePayment.amountDue === undefined ? "—" : formatMGA(beforePayment.amountDue);
    const newAmount = afterPayment.amountDue === undefined ? "—" : formatMGA(afterPayment.amountDue);
    if (oldAmount !== newAmount) lines.push(`Montant dû : ${oldAmount} → ${newAmount}`);
    if (action === "DELETE") lines.push("Passage, produit et paiement conservés en base avec statut supprimé");
    if (details.deletedAt) lines.push(`Suppression : ${str(details.deletedAt) ?? "date inconnue"}`);
  } else if (entityType === "Payment" && action === "CREATE") {
    if (details.amountDue !== undefined) lines.push(`Montant dû : ${formatMGA(details.amountDue)}`);
    if (details.amountReceived !== undefined) lines.push(`Montant reçu : ${formatMGA(details.amountReceived)}`);
    if (details.changeReturned !== undefined) lines.push(`Monnaie rendue : ${formatMGA(details.changeReturned)}`);
    const method = str(details.paymentMethod);
    if (method) lines.push(`Mode : ${PAYMENT_METHOD_LABELS[method] ?? method}`);
    const reference = str(details.reference);
    if (reference) lines.push(`Référence : ${reference}`);
  } else if (action === "CHANGE_TRANSPORT_STATUS") {
    const from = str(details.previousStatus);
    const to = str(details.newStatus);
    if (from && to) {
      lines.push(`Statut : ${TRANSPORT_STATUS_LABELS[from] ?? from} → ${TRANSPORT_STATUS_LABELS[to] ?? to}`);
    }
  } else if (
    (entityType === "Passage" || entityType === "TransportAssignment") &&
    action === "CREATE" &&
    (details.origin !== undefined || details.productName !== undefined)
  ) {
    const product = str(details.productName);
    const tonnage = details.tonnage !== undefined ? ` (${Number(details.tonnage).toLocaleString("fr-FR")} t)` : "";
    if (product) lines.push(`Produit : ${product}${tonnage}`);
    const origin = str(details.origin) ?? "—";
    const destination = str(details.destination) ?? "—";
    lines.push(`Trajet : ${origin} → ${destination}`);
  } else if (action === "SET_TRANSPORT_AMOUNT" || (entityType === "TransportAssignment" && action === "CREATE")) {
    if (details.amountDue !== undefined) lines.push(`Montant officiel : ${formatMGA(details.amountDue)}`);
  } else if (action === "CHANGE_LOCATION") {
    const email = str(details.email);
    if (email) lines.push(`Compte : ${email}`);
    const previous = str(details.previousLocationId);
    const next = str(details.newLocationName) ?? (str(details.newLocationId) ? context.locations?.[details.newLocationId as string] : null);
    if (previous) lines.push(`Ancien lieu : ${context.locations?.[previous] ?? "—"}`);
    if (next) lines.push(`Nouveau lieu : ${next}`);
  } else if (action === "CHANGE_DRIVER") {
    const from = str(details.previousDriverName) ?? "—";
    const to = str(details.newDriverName) ?? "—";
    lines.push(`Chauffeur : ${from} → ${to}`);
  } else if (action === "RESET_PASSWORD") {
    const email = str(details.email);
    if (email) lines.push(`Compte : ${email}`);
    lines.push("Sessions existantes invalidées");
  } else {
    const email = str(details.email);
    if (email) lines.push(`Compte : ${email}`);
  }

  const locationId = str(details.locationId);
  if (locationId && context.locations?.[locationId]) {
    lines.push(`Lieu : ${context.locations[locationId]}`);
  }

  return lines;
}

// Début de la période choisie (null = pas de limite).
export function periodStart(period: string, now: Date = new Date()): Date | null {
  if (period === "today") {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }
  if (period === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

// Construit la clause `where` Prisma du journal à partir des filtres validés.
export function buildAuditWhere(
  filters: { q: string; entityType: string; action: string; period: string },
  now: Date = new Date(),
) {
  const since = periodStart(filters.period, now);
  const words = filters.q.split(/\s+/).filter(Boolean).slice(0, 5);

  return {
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(since ? { createdAt: { gte: since } } : {}),
    ...(words.length > 0
      ? {
          AND: words.map((word) => ({
            OR: [
              { entityId: { contains: word } },
              { user: { firstName: { contains: word, mode: "insensitive" as const } } },
              { user: { lastName: { contains: word, mode: "insensitive" as const } } },
              { user: { email: { contains: word, mode: "insensitive" as const } } },
            ],
          })),
        }
      : {}),
  };
}
