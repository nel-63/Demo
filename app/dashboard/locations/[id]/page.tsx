import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatMGA } from "@/lib/audit";
import { fetchAuditRows } from "@/lib/audit-rows";
import { FICHE_PAGE_SIZE, PASSAGE_ROW_SELECT } from "@/lib/passage-rows";
import AuditTable from "../../audit-table";
import PassagesTable from "../../passages-table";
import Pager from "../../pager";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export default function LocationSheetPage(props: Props) {
  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <Suspense fallback={<p>Chargement...</p>}>
        <LocationSheet {...props} />
      </Suspense>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="mt-2 break-words text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

async function LocationSheet({ params, searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const query = await searchParams;
  const requestedPage = Number.parseInt(String(Array.isArray(query.page) ? query.page[0] : query.page ?? "1"), 10);

  const location = await prisma.location.findUnique({
    where: { id },
    select: { id: true, name: true, createdAt: true },
  });

  if (!location) notFound();

  const [total, tonnage, payments, supervisors] = await Promise.all([
    prisma.passage.count({ where: { locationId: id } }),
    prisma.product.aggregate({ where: { passage: { is: { locationId: id } } }, _sum: { tonnage: true } }),
    prisma.payment.aggregate({
      where: { passage: { is: { locationId: id } } },
      _sum: { amountReceived: true },
    }),
    prisma.supervisor.findMany({
      where: { locationId: id },
      orderBy: { user: { lastName: "asc" } },
      select: {
        id: true,
        user: { select: { firstName: true, lastName: true, email: true, isActive: true } },
        _count: { select: { passages: true } },
      },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / FICHE_PAGE_SIZE));
  const page = Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), pageCount);

  const [passages, activity] = await Promise.all([
    prisma.passage.findMany({
      where: { locationId: id },
      orderBy: { assignedAt: "desc" },
      skip: (page - 1) * FICHE_PAGE_SIZE,
      take: FICHE_PAGE_SIZE,
      select: PASSAGE_ROW_SELECT,
    }),
    // Tout ce qui a été fait dans ce lieu : passages, paiements, comptes créés ou déplacés...
    fetchAuditRows({
      where: {
        OR: [
          { details: { path: ["locationId"], equals: id } },
          { entityType: "Location", entityId: id },
        ],
      },
      take: 25,
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/dashboard/locations" className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour aux lieux
      </Link>

      <header className="my-6">
        <h1 className="text-3xl font-bold text-slate-900">{location.name}</h1>
        <p className="mt-2 text-slate-700">
          Ce qui a été fait dans ce lieu : les produits qui y sont passés, par qui, d&apos;où et vers où.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Régisseurs" value={supervisors.length} />
        <Stat label="Passages" value={total} />
        <Stat label="Tonnage cumulé" value={`${Number(tonnage._sum.tonnage ?? 0).toLocaleString("fr-FR")} t`} />
        <Stat label="Montant reçu" value={formatMGA(payments._sum.amountReceived ?? 0)} />
      </div>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-xl font-semibold text-slate-900">Régisseurs du lieu</h2>
        {supervisors.length === 0 ? (
          <p className="text-slate-700">Aucun régisseur n&apos;est affecté à ce lieu.</p>
        ) : (
          <ul className="divide-y">
            {supervisors.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link href={`/dashboard/supervisors/${item.id}`} className="font-medium text-blue-700 hover:underline">
                    {item.user.firstName} {item.user.lastName}
                  </Link>
                  <p className="text-sm text-slate-700">
                    {item.user.email} — compte {item.user.isActive ? "actif" : "désactivé"}
                  </p>
                </div>
                <p className="text-sm text-slate-700">{item._count.passages} passage{item._count.passages > 1 ? "s" : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-xl font-semibold text-slate-900">Passages dans ce lieu</h2>
        {passages.length === 0 ? (
          <p className="text-slate-700">Aucun produit n&apos;est encore passé par ce lieu.</p>
        ) : (
          <>
            <PassagesTable rows={passages} showLocation={false} />
            <Pager basePath={`/dashboard/locations/${id}`} page={page} pageCount={pageCount} />
          </>
        )}
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-xl font-semibold text-slate-900">Activité récente du lieu</h2>
        {activity.rows.length === 0 ? (
          <p className="text-slate-700">Aucune opération enregistrée.</p>
        ) : (
          <AuditTable rows={activity.rows} locationNames={activity.locationNames} />
        )}
      </section>
    </div>
  );
}
