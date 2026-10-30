import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  ACTION_LABELS,
  AUDIT_PAGE_SIZE,
  ENTITY_LABELS,
  PERIOD_OPTIONS,
  ROLE_LABELS,
  actionLabel,
  buildAuditWhere,
  describeAudit,
  entityLabel,
} from "@/lib/audit";
import ListFilters from "../list-filters";
import { readChoice, readParam, type SearchParams } from "../search-params";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Indian/Antananarivo",
});

export default function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <Suspense fallback={<p>Chargement...</p>}>
        <AuditContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function AuditContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = await searchParams;
  const q = readParam(params, "q");
  const entityType = readChoice(params, "type", Object.keys(ENTITY_LABELS));
  const action = readChoice(params, "action", Object.keys(ACTION_LABELS));
  const period = readChoice(params, "periode", PERIOD_OPTIONS.map((item) => item.value));
  const requestedPage = Number.parseInt(readParam(params, "page", 6), 10);
  const where = buildAuditWhere({ q, entityType, action, period });

  const total = await prisma.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    pageCount,
  );

  const [logs, locations] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        details: true,
        createdAt: true,
        user: {
          select: { firstName: true, lastName: true, email: true, role: true },
        },
      },
    }),
    prisma.location.findMany({ select: { id: true, name: true } }),
  ]);

  const locationNames = Object.fromEntries(
    locations.map((location) => [location.id, location.name]),
  );

  // Anciens logs de paiement (créés avant l'ajout du montant dans les détails) :
  // on relit le paiement lui-même, qui n'est jamais modifié après création.
  const legacyPaymentIds = logs
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

  const legacyPayments =
    legacyPaymentIds.length > 0
      ? await prisma.payment.findMany({
          where: { id: { in: legacyPaymentIds } },
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
  const legacyById = new Map(legacyPayments.map((payment) => [payment.id, payment]));

  function hrefForPage(target: number) {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (entityType) query.set("type", entityType);
    if (action) query.set("action", action);
    if (period) query.set("periode", period);
    if (target > 1) query.set("page", String(target));
    const text = query.toString();
    return text ? `/dashboard/audit?${text}` : "/dashboard/audit";
  }

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour au tableau de bord
      </Link>

      <header className="my-6">
        <h1 className="text-3xl font-bold text-slate-900">Journal d&apos;audit</h1>
        <p className="mt-2 text-slate-600">
          Qui a fait quoi, sur quel enregistrement et à quel moment. Ce journal est en lecture seule.
        </p>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-xl font-semibold">Opérations ({total})</h2>

        <ListFilters
          action="/dashboard/audit"
          q={q}
          placeholder="Nom, email ou identifiant"
          filters={[
            {
              name: "type",
              label: "Type",
              value: entityType,
              options: Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label })),
            },
            {
              name: "action",
              label: "Action",
              value: action,
              options: Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
            },
            {
              name: "periode",
              label: "Période",
              value: period,
              options: PERIOD_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
            },
          ]}
        />

        {logs.length === 0 ? (
          <p className="text-slate-600">Aucune opération ne correspond à ces critères.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-slate-600">
                <tr>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Auteur</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Enregistrement</th>
                  <th className="px-3 py-3">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => {
                  const legacy = log.entityId ? legacyById.get(log.entityId) : undefined;
                  const base = (log.details && typeof log.details === "object" && !Array.isArray(log.details)
                    ? log.details
                    : {}) as Record<string, unknown>;
                  const details = legacy
                    ? {
                        ...base,
                        amountDue: String(legacy.amountDue),
                        amountReceived: String(legacy.amountReceived),
                        changeReturned: String(legacy.changeReturned),
                        paymentMethod: legacy.paymentMethod,
                        reference: legacy.reference,
                      }
                    : base;
                  const lines = describeAudit(log.entityType, log.action, details, {
                    locations: locationNames,
                  });

                  return (
                    <tr key={log.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-4">
                        {dateFormatter.format(log.createdAt)}
                      </td>
                      <td className="px-3 py-4">
                        <p className="font-medium">
                          {log.user.firstName} {log.user.lastName}
                        </p>
                        <p className="text-xs text-slate-700">
                          {ROLE_LABELS[log.user.role] ?? log.user.role} — {log.user.email}
                        </p>
                      </td>
                      <td className="px-3 py-4">{actionLabel(log.action)}</td>
                      <td className="px-3 py-4">
                        <p>{entityLabel(log.entityType)}</p>
                        {log.entityId && (
                          <p className="font-mono text-xs text-slate-700" title={log.entityId}>
                            …{log.entityId.slice(-8)}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-4">
                        {lines.length === 0 ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {lines.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
            {page > 1 ? (
              <Link href={hrefForPage(page - 1)} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100">
                &larr; Plus récent
              </Link>
            ) : <span />}
            <span className="text-slate-600">Page {page} sur {pageCount}</span>
            {page < pageCount ? (
              <Link href={hrefForPage(page + 1)} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100">
                Plus ancien &rarr;
              </Link>
            ) : <span />}
          </nav>
        )}
      </section>
    </div>
  );
}
