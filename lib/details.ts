import { prisma } from "@/lib/prisma";
import {
  PAYMENT_METHOD_LABELS,
  TRANSPORT_STATUS_LABELS,
  formatMGA,
} from "@/lib/audit";
import type { Badge, Cell, Column, DetailsResult, DetailsRow } from "@/lib/details-types";

export const DETAIL_LIMIT = 200;

const STATUS_KEYS = Object.keys(TRANSPORT_STATUS_LABELS);

export const SIMPLE_KINDS = [
  "locations",
  "supervisors",
  "drivers",
  "vehicles",
  "transports",
  "products",
  "tonnage",
  "payments",
  "received",
  "change",
  "outstanding",
] as const;

// Ces deux listes n'ont pas de sens pour un régisseur (un seul lieu, pas d'autres comptes).
const ADMIN_ONLY = new Set<string>(["locations", "supervisors"]);

export function isDetailKind(kind: string): boolean {
  return (
    (SIMPLE_KINDS as readonly string[]).includes(kind) ||
    (kind.startsWith("status-") && STATUS_KEYS.includes(kind.slice(7)))
  );
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

const STATUS_BADGES: Record<string, Badge> = {
  PLANNED: "info",
  IN_PROGRESS: "warn",
  COMPLETED: "ok",
  CANCELLED: "bad",
};
const statusCell = (status: string): Cell =>
  text(TRANSPORT_STATUS_LABELS[status] ?? status, { badge: STATUS_BADGES[status] ?? "muted" });

const col = (key: string, label: string, align?: "right"): Column => ({ key, label, align });
const locationColumn = (admin: boolean): Column[] => (admin ? [col("location", "Lieu")] : []);
const withLocation = (admin: boolean, name?: string | null): Record<string, Cell> =>
  admin ? { location: text(name ?? "—") } : {};

export async function getDetails(
  kind: string,
  scope: DetailScope,
  rawQuery: string,
): Promise<DetailsResult> {
  const { admin } = scope;
  const list = words(rawQuery);
  const loc = scope.locationId ? { locationId: scope.locationId } : {};
  // Filtre « transport du lieu » pour les tables liées (produits, paiements).
  const viaAssignment = (extra: object = {}) =>
    scope.locationId || Object.keys(extra).length > 0
      ? { assignment: { is: { ...loc, ...extra } } }
      : {};

  const locations = admin
    ? await prisma.location.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
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
    // Les pages « complètes » des chauffeurs, véhicules, transports et paiements
    // sont réservées aux régisseurs.
    href: admin && !["locations", "supervisors"].includes(kind) ? null : href,
    locations,
  });

  switch (kind) {
    case "locations": {
      const where = {
        ...(scope.locationId ? { id: scope.locationId } : {}),
        ...andWords(list, (w) => [{ name: has(w) }]),
      };
      const [count, total, rows] = await Promise.all([
        prisma.location.count({ where }),
        prisma.location.count({ where: scope.locationId ? { id: scope.locationId } : {} }),
        prisma.location.findMany({
          where,
          orderBy: { name: "asc" },
          take: DETAIL_LIMIT,
          select: {
            id: true,
            name: true,
            _count: { select: { supervisors: true, drivers: true, vehicles: true, assignments: true } },
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
          col("drivers", "Chauffeurs", "right"),
          col("vehicles", "Véhicules", "right"),
          col("transports", "Transports", "right"),
        ],
        rows.map((r) => ({
          id: r.id,
          cells: {
            name: text(r.name),
            supervisors: num(r._count.supervisors, String(r._count.supervisors)),
            drivers: num(r._count.drivers, String(r._count.drivers)),
            vehicles: num(r._count.vehicles, String(r._count.vehicles)),
            transports: num(r._count.assignments, String(r._count.assignments)),
          },
        })),
        "/dashboard/locations",
      );
    }

    case "supervisors": {
      const base = loc;
      const where = {
        ...base,
        ...andWords(list, (w) => [
          { user: { firstName: has(w) } },
          { user: { lastName: has(w) } },
          { user: { email: has(w) } },
          { nationalId: has(w) },
        ]),
      };
      const [count, total, rows] = await Promise.all([
        prisma.supervisor.count({ where }),
        prisma.supervisor.count({ where: base }),
        prisma.supervisor.findMany({
          where,
          orderBy: { user: { lastName: "asc" } },
          take: DETAIL_LIMIT,
          select: {
            id: true,
            nationalId: true,
            assignedLocation: { select: { name: true } },
            user: { select: { firstName: true, lastName: true, email: true, isActive: true } },
          },
        }),
      ]);
      return finish(
        "Régisseurs",
        String(total),
        count,
        [col("name", "Nom"), col("email", "Email"), col("nationalId", "CIN"), ...locationColumn(admin), col("status", "Compte")],
        rows.map((r) => ({
          id: r.id,
          cells: {
            name: text(fullName(r.user)),
            email: text(r.user.email),
            nationalId: text(r.nationalId),
            ...withLocation(admin, r.assignedLocation?.name),
            status: activeBadge(r.user.isActive),
          },
        })),
        "/dashboard/supervisors",
      );
    }

    case "drivers": {
      const where = {
        ...loc,
        ...andWords(list, (w) => [
          { firstName: has(w) },
          { lastName: has(w) },
          { nationalId: has(w) },
          { licenseNumber: has(w) },
          { phoneNumber: has(w) },
        ]),
      };
      const [count, total, rows] = await Promise.all([
        prisma.driver.count({ where }),
        prisma.driver.count({ where: loc }),
        prisma.driver.findMany({
          where,
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: DETAIL_LIMIT,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nationalId: true,
            licenseNumber: true,
            phoneNumber: true,
            isActive: true,
            assignedLocation: { select: { name: true } },
          },
        }),
      ]);
      return finish(
        "Chauffeurs",
        String(total),
        count,
        [
          col("name", "Nom"),
          col("nationalId", "CIN"),
          col("license", "Permis"),
          col("phone", "Téléphone"),
          ...locationColumn(admin),
          col("status", "Statut"),
        ],
        rows.map((r) => ({
          id: r.id,
          cells: {
            name: text(fullName(r)),
            nationalId: text(r.nationalId),
            license: text(r.licenseNumber),
            phone: text(r.phoneNumber ?? "—"),
            ...withLocation(admin, r.assignedLocation?.name),
            status: activeBadge(r.isActive),
          },
        })),
        "/dashboard/drivers",
      );
    }

    case "vehicles": {
      const where = {
        ...loc,
        ...andWords(list, (w) => [
          { licensePlate: has(w) },
          { vehicleType: has(w) },
          { driver: { firstName: has(w) } },
          { driver: { lastName: has(w) } },
        ]),
      };
      const [count, total, rows] = await Promise.all([
        prisma.vehicle.count({ where }),
        prisma.vehicle.count({ where: loc }),
        prisma.vehicle.findMany({
          where,
          orderBy: { licensePlate: "asc" },
          take: DETAIL_LIMIT,
          select: {
            id: true,
            licensePlate: true,
            vehicleType: true,
            isActive: true,
            driver: { select: { firstName: true, lastName: true } },
            assignedLocation: { select: { name: true } },
          },
        }),
      ]);
      return finish(
        "Véhicules",
        String(total),
        count,
        [
          col("plate", "Immatriculation"),
          col("type", "Type"),
          col("driver", "Chauffeur"),
          ...locationColumn(admin),
          col("status", "Statut"),
        ],
        rows.map((r) => ({
          id: r.id,
          cells: {
            plate: text(r.licensePlate),
            type: text(r.vehicleType),
            driver: text(fullName(r.driver)),
            ...withLocation(admin, r.assignedLocation?.name),
            status: activeBadge(r.isActive),
          },
        })),
        "/dashboard/vehicles",
      );
    }

    case "products":
    case "tonnage": {
      // Le tonnage cumulé ne compte pas les transports annulés.
      const base = kind === "tonnage" ? viaAssignment({ status: { not: "CANCELLED" } }) : viaAssignment();
      const where = {
        AND: [
          base,
          andWords(list, (w) => [{ name: has(w) }, { type: has(w) }]),
        ],
      };
      const [count, sum, total, rows] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.aggregate({ where: base, _sum: { tonnage: true } }),
        prisma.product.count({ where: base }),
        prisma.product.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: DETAIL_LIMIT,
          select: {
            id: true,
            name: true,
            type: true,
            tonnage: true,
            assignment: {
              select: {
                assignedAt: true,
                status: true,
                vehicle: { select: { licensePlate: true } },
                assignedLocation: { select: { name: true } },
              },
            },
          },
        }),
      ]);
      const tonnageText = (v: unknown) => `${Number(v ?? 0).toLocaleString("fr-FR")} t`;
      return finish(
        kind === "tonnage" ? "Tonnage cumulé" : "Produits",
        kind === "tonnage" ? tonnageText(sum._sum.tonnage) : String(total),
        count,
        [
          col("name", "Produit"),
          col("type", "Type"),
          col("tonnage", "Tonnage", "right"),
          col("transport", "Transport lié"),
          ...locationColumn(admin),
          col("status", "Statut"),
        ],
        rows.map((r) => ({
          id: r.id,
          cells: {
            name: text(r.name),
            type: text(r.type),
            tonnage: num(r.tonnage, tonnageText(r.tonnage)),
            transport: r.assignment
              ? { t: `${dateFormatter.format(r.assignment.assignedAt)} · ${r.assignment.vehicle.licensePlate}`, s: r.assignment.assignedAt.getTime() }
              : text("—"),
            ...withLocation(admin, r.assignment?.assignedLocation?.name),
            status: r.assignment ? statusCell(r.assignment.status) : text("—"),
          },
        })),
        "/dashboard/transports",
      );
    }

    case "payments":
    case "received":
    case "change": {
      const base = {
        ...viaAssignment(),
        ...(kind === "change" ? { changeReturned: { gt: 0 } } : {}),
      };
      const where = {
        AND: [
          base,
          andWords(list, (w) => [
            { reference: has(w) },
            { assignment: { product: { name: has(w) } } },
            { assignment: { vehicle: { licensePlate: has(w) } } },
            { recordedBy: { firstName: has(w) } },
            { recordedBy: { lastName: has(w) } },
          ]),
        ],
      };
      const [count, agg, rows] = await Promise.all([
        prisma.payment.count({ where }),
        prisma.payment.aggregate({
          where: base,
          _count: { _all: true },
          _sum: { amountReceived: true, changeReturned: true },
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
            amountReceived: true,
            changeReturned: true,
            recordedBy: { select: { firstName: true, lastName: true } },
            assignment: {
              select: {
                product: { select: { name: true } },
                vehicle: { select: { licensePlate: true } },
                assignedLocation: { select: { name: true } },
              },
            },
          },
        }),
      ]);
      const total =
        kind === "received"
          ? formatMGA(agg._sum.amountReceived ?? 0)
          : kind === "change"
            ? formatMGA(agg._sum.changeReturned ?? 0)
            : String(agg._count._all);
      return finish(
        kind === "received" ? "Montant reçu" : kind === "change" ? "Monnaie rendue" : "Paiements",
        total,
        count,
        [
          col("date", "Date"),
          col("transport", "Transport"),
          col("method", "Mode"),
          col("due", "Dû", "right"),
          col("received", "Reçu", "right"),
          col("change", "Monnaie", "right"),
          col("by", "Enregistré par"),
          ...locationColumn(admin),
        ],
        rows.map((r) => ({
          id: r.id,
          cells: {
            date: date(r.createdAt),
            transport: text(`${r.assignment.product.name} · ${r.assignment.vehicle.licensePlate}`),
            method: text(
              `${PAYMENT_METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}${r.reference ? ` (${r.reference})` : ""}`,
            ),
            due: num(r.amountDue, formatMGA(r.amountDue)),
            received: num(r.amountReceived, formatMGA(r.amountReceived)),
            change: num(r.changeReturned, formatMGA(r.changeReturned)),
            by: text(fullName(r.recordedBy)),
            ...withLocation(admin, r.assignment.assignedLocation?.name),
          },
        })),
        "/dashboard/payments",
      );
    }

    default: {
      // transports, outstanding, status-XXX
      const statusFilter = kind.startsWith("status-") ? kind.slice(7) : null;
      const base = {
        ...loc,
        ...(statusFilter ? { status: statusFilter as "PLANNED" } : {}),
        ...(kind === "outstanding"
          ? { status: { not: "CANCELLED" as const }, payment: { is: null }, amountDue: { not: null } }
          : {}),
      };
      const where = {
        AND: [
          base,
          andWords(list, (w) => [
            { product: { name: has(w) } },
            { vehicle: { licensePlate: has(w) } },
            { driver: { firstName: has(w) } },
            { driver: { lastName: has(w) } },
            { vehicle: { driver: { lastName: has(w) } } },
          ]),
        ],
      };
      const [count, total, sum, rows] = await Promise.all([
        prisma.transportAssignment.count({ where }),
        prisma.transportAssignment.count({ where: base }),
        prisma.transportAssignment.aggregate({ where: base, _sum: { amountDue: true } }),
        prisma.transportAssignment.findMany({
          where,
          orderBy: { assignedAt: "desc" },
          take: DETAIL_LIMIT,
          select: {
            id: true,
            assignedAt: true,
            status: true,
            amountDue: true,
            product: { select: { name: true, tonnage: true } },
            vehicle: { select: { licensePlate: true, driver: { select: { firstName: true, lastName: true } } } },
            driver: { select: { firstName: true, lastName: true } },
            assignedLocation: { select: { name: true } },
            payment: { select: { id: true } },
          },
        }),
      ]);
      const title = statusFilter
        ? `Transports : ${TRANSPORT_STATUS_LABELS[statusFilter]}`
        : kind === "outstanding"
          ? "Reste à encaisser"
          : "Transports";
      return finish(
        title,
        kind === "outstanding" ? formatMGA(sum._sum.amountDue ?? 0) : String(total),
        count,
        [
          col("date", "Date"),
          col("product", "Produit"),
          col("tonnage", "Tonnage", "right"),
          col("vehicle", "Véhicule"),
          col("driver", "Chauffeur"),
          col("amount", "Montant", "right"),
          col("status", "Statut"),
          col("payment", "Paiement"),
          ...locationColumn(admin),
        ],
        rows.map((r) => ({
          id: r.id,
          cells: {
            date: date(r.assignedAt),
            product: text(r.product.name),
            tonnage: num(r.product.tonnage, `${Number(r.product.tonnage).toLocaleString("fr-FR")} t`),
            vehicle: text(r.vehicle.licensePlate),
            // Chauffeur au moment du transport, sinon celui du véhicule (anciens transports).
            driver: text(fullName(r.driver ?? r.vehicle.driver)),
            amount: r.amountDue === null ? text("Non fixé") : num(r.amountDue, formatMGA(r.amountDue)),
            status: statusCell(r.status),
            payment: r.payment ? text("Payé", { badge: "ok" }) : text("Non payé", { badge: "warn" }),
            ...withLocation(admin, r.assignedLocation?.name),
          },
        })),
        "/dashboard/transports",
      );
    }
  }
}
