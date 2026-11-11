import { prisma } from "@/lib/prisma";

// Common list selection deliberately excludes the BYTEA columns. Image presence is
// loaded separately as booleans so passage tables never fetch attachment binaries.
export const PASSAGE_ROW_SELECT = {
  id: true,
  assignedAt: true,
  origin: true,
  destination: true,
  vehicleRegistration: true,
  vehicleCharacteristics: true,
  driverName: true,
  driverLicenseNumber: true,
  nomOp: true,
  nomSoc: true,
  coli: true,
  nbColi: true,
  nQuittance: true,
  dateQuittance: true,
  product: { select: { name: true, type: true, tonnage: true } },
  supervisor: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
  assignedLocation: { select: { id: true, name: true } },
  payment: { select: { paymentMethod: true, reference: true, amountDue: true } },
} as const;

export const FICHE_PAGE_SIZE = 20;

export async function addAttachmentFlags<T extends { id: string }>(rows: T[]) {
  if (rows.length === 0) return rows.map((row) => ({ ...row, hasPjt: false, hasQuittance: false }));
  const ids = rows.map((row) => row.id);
  const flags = await prisma.$queryRaw<Array<{ id: string; hasPjt: boolean; hasQuittance: boolean }>>`
    SELECT
      "id",
      ("pjt" IS NOT NULL) AS "hasPjt",
      ("quittance" IS NOT NULL) AS "hasQuittance"
    FROM "TransportAssignment"
    WHERE "id" = ANY(${ids}::text[])
  `;
  const byId = new Map(flags.map((item) => [item.id, item]));
  return rows.map((row) => ({
    ...row,
    hasPjt: byId.get(row.id)?.hasPjt ?? false,
    hasQuittance: byId.get(row.id)?.hasQuittance ?? false,
  }));
}
