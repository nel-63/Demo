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
  buildAuditWhere,
} from "@/lib/audit";
import { fetchAuditRows } from "@/lib/audit-rows";
import AuditTable from "../audit-table";
import ListFilters from "../list-filters";
import { readChoice, readParam, type SearchParams } from "../search-params";

export default function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <div>
      <Suspense fallback={<p>Chargement...</p>}>
        <AuditContent searchParams={searchParams} />
      </Suspense>
    </div>
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

  const { rows, locationNames } = await fetchAuditRows({
    where,
    skip: (page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
  });

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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Journal d&apos;audit</h1>
        <p className="mt-2 text-slate-600">
          Qui a fait quoi, sur quel enregistrement et à quel moment. Ce journal est en lecture seule.
        </p>
      </header>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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

        {rows.length === 0 ? (
          <p className="text-slate-600">Aucune opération ne correspond à ces critères.</p>
        ) : (
          <AuditTable rows={rows} locationNames={locationNames} />
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
