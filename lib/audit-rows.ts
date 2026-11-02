import { prisma } from "@/lib/prisma";

export const AUDIT_SELECT = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  details: true,
  createdAt: true,
  user: { select: { firstName: true, lastName: true, email: true, role: true } },
} as const;

// Charge des lignes du journal et complète les anciens logs de paiement
// (créés avant que le montant soit écrit dans les détails) en relisant le paiement lui-même,
// qui n'est jamais modifié après création.
export async function fetchAuditRows(args: { where: object; skip?: number; take: number }) {
  const [logs, locations] = await Promise.all([
    prisma.auditLog.findMany({
      where: args.where,
      orderBy: { createdAt: "desc" },
      skip: args.skip ?? 0,
      take: args.take,
      select: AUDIT_SELECT,
    }),
    prisma.location.findMany({ select: { id: true, name: true } }),
  ]);

  const legacyIds = logs
    .filter((log) => {
      const details = log.details as Record<string, unknown> | null;
      return (
        log.entityType === "Payment" &&
        log.action === "CREATE" &&
        log.entityId &&
        details?.amountReceived === undefined
      );
    })
    .map((log) => log.entityId as string);

  const payments =
    legacyIds.length > 0
      ? await prisma.payment.findMany({
          where: { id: { in: legacyIds } },
          select: {
            id: true,
            amountDue: true,
            amountReceived: true,
            changeReturned: true,
            paymentMethod: true,
            reference: true,
          },
        })
      : [];
  const byId = new Map(payments.map((payment) => [payment.id, payment]));

  const rows = logs.map((log) => {
    const base = (
      log.details && typeof log.details === "object" && !Array.isArray(log.details) ? log.details : {}
    ) as Record<string, unknown>;
    const legacy = log.entityId ? byId.get(log.entityId) : undefined;

    return {
      ...log,
      details: legacy
        ? {
            ...base,
            amountDue: String(legacy.amountDue),
            amountReceived: String(legacy.amountReceived),
            changeReturned: String(legacy.changeReturned),
            paymentMethod: legacy.paymentMethod,
            reference: legacy.reference,
          }
        : base,
    };
  });

  return { rows, locationNames: Object.fromEntries(locations.map((l) => [l.id, l.name])) };
}
