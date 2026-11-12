import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateMaritimeTotals, formatMaritimeAmount } from "@/lib/maritime-declarations";
import { MARITIME_DECLARATIONS_PAGE_SIZE, resolvePage } from "@/lib/pagination";
import Pager from "../pager";
import { readParam, type SearchParams } from "../search-params";

export default function MaritimeStatisticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<p className="text-slate-600">Chargement des statistiques maritimes...</p>}>
      <MaritimeStatistics searchParams={searchParams} />
    </Suspense>
  );
}

async function MaritimeStatistics({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = await searchParams;
  const q = readParam(params, "q").trim().slice(0, 100);
  const where = q
    ? {
        OR: [
          { companyName: { contains: q, mode: "insensitive" as const } },
          { boatName: { contains: q, mode: "insensitive" as const } },
          { boatRegistration: { contains: q, mode: "insensitive" as const } },
          { captainName: { contains: q, mode: "insensitive" as const } },
          { captainPhone: { contains: q, mode: "insensitive" as const } },
          { captainEmail: { contains: q, mode: "insensitive" as const } },
          { maritimeUser: { user: { email: { contains: q, mode: "insensitive" as const } } } },
          { maritimeUser: { contactPhone: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : undefined;
  const total = await prisma.maritimeDeclaration.count({ where });
  const { page, totalPages } = resolvePage(
    readParam(params, "page"),
    total,
    MARITIME_DECLARATIONS_PAGE_SIZE,
  );
  const declarations = await prisma.maritimeDeclaration.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * MARITIME_DECLARATIONS_PAGE_SIZE,
    take: MARITIME_DECLARATIONS_PAGE_SIZE,
    select: {
      id: true,
      companyName: true,
      boatName: true,
      boatRegistration: true,
      boatCapacity: true,
      captainName: true,
      captainPhone: true,
      captainEmail: true,
      originDepartureDate: true,
      arrivalDate: true,
      departureDate: true,
      products: {
        orderBy: { createdAt: "asc" },
        select: { id: true, productType: true, quantity: true, unitPrice: true },
      },
      maritimeUser: {
        select: {
          contactPhone: true,
          user: { select: { email: true, phoneNumber: true } },
        },
      },
    },
  });
  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeZone: "Indian/Antananarivo",
  });
  const basePath = q
    ? `/dashboard/maritime-statistics?q=${encodeURIComponent(q)}`
    : "/dashboard/maritime-statistics";

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Administration</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Statistiques maritimes</h1>
        <p className="mt-2 text-slate-600">Informations et produits de tous les bateaux, y compris les sessions clôturées.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <form method="GET" action="/dashboard/maritime-statistics" className="mb-5 flex gap-2">
          <input
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder="Société, bateau, commandant ou contact"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Rechercher</button>
        </form>

        <Pager
          basePath={basePath}
          page={page}
          pageCount={totalPages}
          total={total}
          totalLabel="bateaux"
          ariaLabel="Pagination des statistiques maritimes"
        />

        {declarations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-600">
            Aucune information maritime enregistrée.
          </p>
        ) : (
          <div className="space-y-4">
            {declarations.map((declaration) => {
              const totals = calculateMaritimeTotals(declaration.products.map((product) => ({
                quantity: product.quantity.toString(),
                unitPrice: product.unitPrice.toString(),
              })));

              return (
                <article key={declaration.id} className="overflow-hidden rounded-xl border border-slate-200">
                  <header className="flex flex-wrap items-start justify-between gap-3 bg-slate-50 p-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{declaration.boatName}</h2>
                      <p className="text-sm text-slate-700">{declaration.companyName} · {declaration.boatRegistration}</p>
                    </div>
                    <span className={declaration.departureDate
                      ? "rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                      : "rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800"}>
                      {declaration.departureDate ? "Session clôturée" : "Session active"}
                    </span>
                  </header>

                  <div className="grid gap-5 p-4 md:grid-cols-3">
                    <dl className="space-y-2 text-sm">
                      <div><dt className="text-slate-600">Contact du compte</dt><dd className="font-medium text-slate-900">{declaration.maritimeUser.user.email ?? "—"} · {declaration.maritimeUser.contactPhone ?? declaration.maritimeUser.user.phoneNumber ?? "—"}</dd></div>
                      <div><dt className="text-slate-600">Capacité</dt><dd className="font-medium text-slate-900">{declaration.boatCapacity.toString()} t</dd></div>
                    </dl>
                    <dl className="space-y-2 text-sm">
                      <div><dt className="text-slate-600">Commandant</dt><dd className="font-medium text-slate-900">{declaration.captainName}</dd></div>
                      <div><dt className="text-slate-600">Téléphone / email</dt><dd className="font-medium text-slate-900">{declaration.captainPhone ?? "—"} · {declaration.captainEmail ?? "—"}</dd></div>
                    </dl>
                    <dl className="space-y-2 text-sm">
                      <div><dt className="text-slate-600">Départ du port d&apos;origine</dt><dd className="font-medium text-slate-900">{dateFormatter.format(declaration.originDepartureDate)}</dd></div>
                      <div><dt className="text-slate-600">Entrée / sortie</dt><dd className="font-medium text-slate-900">{dateFormatter.format(declaration.arrivalDate)} / {declaration.departureDate ? dateFormatter.format(declaration.departureDate) : "En cours"}</dd></div>
                    </dl>
                  </div>

                  <div className="border-t border-slate-200 p-4">
                    <h3 className="mb-3 font-semibold text-slate-900">Produits et détails</h3>
                    {declaration.products.length === 0 ? (
                      <p className="text-sm text-slate-600">Aucun produit enregistré.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-left text-sm">
                          <thead className="border-b border-slate-200 text-slate-600">
                            <tr>
                              <th className="px-2 py-2">Produit</th>
                              <th className="px-2 py-2 text-right">Quantité (kg)</th>
                              <th className="px-2 py-2 text-right">Prix unitaire</th>
                              <th className="px-2 py-2 text-right">Montant</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {declaration.products.map((product, index) => (
                              <tr key={product.id}>
                                <td className="px-2 py-2">{product.productType}</td>
                                <td className="px-2 py-2 text-right tabular-nums">{formatMaritimeAmount(product.quantity.toString())}</td>
                                <td className="px-2 py-2 text-right tabular-nums">{formatMaritimeAmount(product.unitPrice.toString())} Ar/kg</td>
                                <td className="px-2 py-2 text-right tabular-nums">{formatMaritimeAmount(totals.lineTotals[index] ?? "0")} Ar</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="border-t border-slate-200 font-semibold">
                            <tr><td colSpan={3} className="px-2 py-2 text-right">Total</td><td className="px-2 py-2 text-right tabular-nums">{formatMaritimeAmount(totals.total)} Ar</td></tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <Pager
          basePath={basePath}
          page={page}
          pageCount={totalPages}
          total={total}
          totalLabel="bateaux"
          ariaLabel="Pagination des statistiques maritimes"
        />
      </section>
    </div>
  );
}
