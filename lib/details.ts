import { prisma } from "@/lib/prisma";
import { ALL_PAYMENT_METHOD_LABELS, formatMGA } from "@/lib/audit";
import type { Cell, Column, DetailsResult, DetailsRow } from "@/lib/details-types";

export const DETAIL_LIMIT = 200;

export const DETAIL_KINDS = [
  "locations",
  "supervisors",
  "passages",
  "tonnage",
  "paid",
] as const;

// Ces deux listes n'ont pas de sens pour un régisseur (un seul lieu, pas d'autres comptes).
const ADMIN_ONLY = new Set<string>(["locations", "supervisors"]);

export function isDetailKind(kind: string): boolean {
  return (DETAIL_KINDS as readonly string[]).includes(kind);
}

export function isAdminOnlyKind(kind: string): boolean {
  return ADMIN_ONLY.has(kind);
}

export type DetailScope = {
  admin: boolean;
  // Régisseur : son lieu (imposé). Administrateur : filtre facultatif choisi dans le panneau.
  locationId: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeZone: "Indian/Antananarivo",
});

const has = (word: string) => ({ contains: word, mode: "insensitive" as const });

function words(q: string) {
  return q.split(/\s+/).filter(Boolean).slice(0, 5);
}

// Chaque mot de la recherche doit se retrouver dans au moins un des champs.
function andWords(list: string[], fields: (word: string) => object[]) {
  return list.length > 0 ? { AND: list.map((word) => ({ OR: fields(word) })) } : {};
}

const text = (t: string, extra: Partial<Cell> = {}): Cell => ({ t, ...extra });
const num = (value: unknown, t: string): Cell => ({ t, s: Number(value ?? 0) });
const date = (value: Date): Cell => ({ t: dateFormatter.format(value), s: value.getTime() });
const fullName = (p?: { firstName: string; lastName: string } | null) =>
  p ? `${p.firstName} ${p.lastName}` : "—";
const activeBadge = (isActive: boolean): Cell =>
  isActive ? text("Actif", { badge: "ok" }) : text("Inactif", { badge: "muted" });

const col = (key: string, label: string, align?: "right"): Column => ({ key, label, align });
const locationColumn = (admin: boolean): Column[] => (admin ? [col("location", "Lieu")] : []);
const withLocation = (admin: boolean, name?: string | null): Record<string, Cell> =>
  admin ? { location: text(name ?? "—") } : {};

const tonnageText = (value: unknown) => `${Number(value ?? 0).toLocaleString("fr-FR")} t`;

export async function getDetails(
  kind: string,
  scope: DetailScope,
  rawQuery: string,
): Promise<DetailsResult> {
  const { admin } = scope;
  const list = words(rawQuery);
  const loc = scope.locationId ? { locationId: scope.locationId } : {};
  // Filtre « passage du lieu » pour les paiements.
  const viaPassage = { passage: { is: { deletedAt: null, assignedLocation: { is: { deletedAt: null } }, ...(scope.locationId ? { locationId: scope.locationId } : {}) } } };

  const locations = admin
    ? await prisma.location.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : null;

  const finish = (
    title: string,
    total: string,
    count: number,
    columns: Column[],
    rows: DetailsRow[],
    href: string | null,
  ): DetailsResult => ({
    title,
    total,
    count,
    truncated: count > rows.length,
    columns,
    rows,
    // La page « Passages » est réservée aux régisseurs ; l'administrateur a les fiches
    // des lieux et des régisseurs.
    href: admin && !ADMIN_ONLY.has(kind) ? null : href,
    locations,
  });

  switch (kind) {
    case "locations": {
      const where = {
        deletedAt: null,
        ...(scope.locationId ? { id: scope.locationId } : {}),
        ...andWords(list, (w) => [{ name: has(w) }]),
      };
      const [count, total, rows] = await Promise.all([
        prisma.location.count({ where }),
        prisma.location.count({ where: { deletedAt: null, ...(scope.locationId ? { id: scope.locationId } : {}) } }),
        prisma.location.findMany({
          where,
          orderBy: { name: "asc" },
          take: DETAIL_LIMIT,
          select: {
            id: true,
            name: true,
            _count: { select: { supervisors: true, passages: { where: { deletedAt: null } } } },
          },
        }),
      ]);
      return finish(
        "Lieux",
        String(total),
        count,
        [
          col("name", "Lieu"),
          col("supervisors", "Régisseurs", "right"),
          col("passages", "Passages", "right"),
        ],
        rows.map((r) => ({
          id: r.id,
          cells: {
            name: text(r.name, { href: `/dashboard/locations/${r.id}` }),
            supervisors: num(r._count.supervisors, String(r._count.supervisors)),
            passages: num(r._count.passages, String(r._count.passages)),
          },
        })),
        "/dashboard/locations",
      );
    }

    case "supervisors": {
      const where = {
        ...loc,
        ...andWords(list, (w) => [
          { user: { firstName: has(w) } },
          { user: { lastName: has(w) } },
          { user: { email: has(w) } },
          { nationalId: has(w) },
        ]),
      };
      const [count, total, rows] = await Promise.all([
        prisma.supervisor.count({ where }),
        prisma.supervisor.count({ where: loc }),
        prisma.supervisor.findMany({
          where,
          orderBy: { user: { lastName: "asc" } },
          take: DETAIL_LIMIT,
          select: {
            id: true,
            nationalId: true,
            assignedLocation: { select: { name: true } },
            user: { select: { firstName: true, lastName: true, email: true, isActive: true } },
            _count: { select: { passages: { where: { deletedAt: null } } } },
          },
        }),
      ]);
      return finish(
        "Régisseurs",
        String(total),
        count,
        [
          col("name", "Nom"),
          col("email", "Email"),
          col("nationalId", "CIN"),
          ...locationColumn(admin),
          col("passages", "Passages", "right"),
          col("status", "Compte"),
        ],
        rows.map((r) => ({
          id: r.id,
          cells: {
            name: text(fullName(r.user), { href: `/dashboard/supervisors/${r.id}` }),
            email: text(r.user.email ?? "—"),
            nationalId: text(r.nationalId),
            ...withLocation(admin, r.assignedLocation?.name),
            passages: num(r._count.passages, String(r._count.passages)),
            status: activeBadge(r.user.isActive),
          },
        })),
        "/dashboard/supervisors",
      );
    }

    case "paid": {
      const base = {
        deletedAt: null,
        ...viaPassage,
      };
      const where = {
        AND: [
          base,
          andWords(list, (w) => [
            { reference: has(w) },
            { passage: { product: { name: has(w) } } },
            { passage: { origin: has(w) } },
            { passage: { destination: has(w) } },
            { recordedBy: { firstName: has(w) } },
            { recordedBy: { lastName: has(w) } },
          ]),
        ],
      };
      const [count, agg, rows] = await Promise.all([
        prisma.payment.count({ where }),
        prisma.payment.aggregate({
          where: base,
          _sum: { amountDue: true },
        }),
        prisma.payment.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: DETAIL_LIMIT,
          select: {
            id: true,
            createdAt: true,
            paymentMethod: true,
            reference: true,
            amountDue: true,
            recordedBy: { select: { firstName: true, lastName: true } },
            passage: {
              select: {
                origin: true,
                destination: true,
                product: { select: { name: true } },
                assignedLocation: { select: { name: true } },
              },
            },
          },
        }),
      ]);
      return finish(
        "Montant payé",
        formatMGA(agg._sum.amountDue ?? 0),
        count,
        [
          col("date", "Date"),
          col("product", "Produit"),
          col("route", "Trajet"),
          col("method", "Mode"),
          col("amount", "Montant payé", "right"),
          col("by", "Enregistré par"),
          ...locationColumn(admin),
        ],
        rows.map((r) => ({
          id: r.id,
          cells: {
            date: date(r.createdAt),
            product: text(r.passage.product.name),
            route: text(`${r.passage.origin} → ${r.passage.destination}`),
            method: text(
              `${ALL_PAYMENT_METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}${r.reference ? ` (${r.reference})` : ""}`,
            ),
            amount: num(r.amountDue, formatMGA(r.amountDue)),
            by: text(fullName(r.recordedBy)),
            ...withLocation(admin, r.passage.assignedLocation?.name),
          },
        })),
        "/dashboard/passages",
      );
    }

    default: {
      // passages, tonnage : la même liste de passages, avec un total différent.
      const where = {
        AND: [
          { deletedAt: null, assignedLocation: { is: { deletedAt: null } } },
          loc,
          andWords(list, (w) => [
            { product: { name: has(w) } },
            { product: { type: has(w) } },
            { origin: has(w) },
            { destination: has(w) },
            { vehicleRegistration: has(w) },
            { vehicleCharacteristics: has(w) },
            { driverName: has(w) },
            { driverLicenseNumber: has(w) },
            { supervisor: { user: { lastName: has(w) } } },
            { supervisor: { user: { firstName: has(w) } } },
          ]),
        ],
      };
      const [count, total, sum, rows] = await Promise.all([
        prisma.passage.count({ where }),
        prisma.passage.count({ where: { ...loc, deletedAt: null, assignedLocation: { is: { deletedAt: null } } } }),
        prisma.product.aggregate({
          where: { deletedAt: null, passage: { is: { deletedAt: null, assignedLocation: { is: { deletedAt: null } }, ...(scope.locationId ? { locationId: scope.locationId } : {}) } } },
          _sum: { tonnage: true },
        }),
        prisma.passage.findMany({
          where,
          orderBy: { assignedAt: "desc" },
          take: DETAIL_LIMIT,
          select: {
            id: true,
            assignedAt: true,
            origin: true,
            destination: true,
            product: { select: { name: true, type: true, tonnage: true } },
            supervisor: { select: { user: { select: { firstName: true, lastName: true } } } },
            assignedLocation: { select: { name: true } },
            payment: { select: { paymentMethod: true, amountDue: true } },
          },
        }),
      ]);
      return finish(
        kind === "tonnage" ? "Tonnage cumulé" : "Passages",
        kind === "tonnage" ? tonnageText(sum._sum.tonnage) : String(total),
        count,
        [
          col("date", "Date"),
          col("product", "Produit"),
          col("tonnage", "Tonnage", "right"),
          col("origin", "Origine"),
          ...locationColumn(admin),
          col("destination", "Destination"),
          col("amount", "Montant payé", "right"),
          col("method", "Mode"),
          col("by", "Enregistré par"),
        ],
        rows.map((r) => ({
          id: r.id,
          cells: {
            date: date(r.assignedAt),
            product: text(r.product.name),
            tonnage: num(r.product.tonnage, tonnageText(r.product.tonnage)),
            origin: text(r.origin),
            ...withLocation(admin, r.assignedLocation?.name),
            destination: text(r.destination),
            amount: r.payment ? num(r.payment.amountDue, formatMGA(r.payment.amountDue)) : text("—"),
            method: text(r.payment ? (ALL_PAYMENT_METHOD_LABELS[r.payment.paymentMethod] ?? r.payment.paymentMethod) : "—"),
            by: text(fullName(r.supervisor.user)),
          },
        })),
        "/dashboard/passages",
      );
    }
  }
}
