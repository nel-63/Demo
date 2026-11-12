import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { calculateMaritimeTotals, formatMaritimeAmount } from "@/lib/maritime-declarations";
import {
  MARITIME_DECLARATIONS_PAGE_SIZE,
  resolvePage,
} from "@/lib/pagination";
import Pager from "../pager";
import type { SearchParams } from "../search-params";

type Props = { searchParams: Promise<SearchParams> };

export default function MaritimeDeclarationsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<p className="text-slate-600">Chargement des déclarations...</p>}>
      <MaritimeDeclarations searchParams={searchParams} />
    </Suspense>
  );
}

async function MaritimeDeclarations({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "USER_MAR") redirect("/dashboard");

  const profile = await prisma.maritimeUser.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!profile) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Profil maritime indisponible</h1>
        <p className="mt-3 text-slate-700">Contactez l&apos;administrateur pour associer un profil maritime à votre compte.</p>
      </section>
    );
  }

  const params = await searchParams;
  const rawQ = params.q;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ ?? "").trim().slice(0, 100);
  const rawSort = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const sort: "companyName" | "boatName" | "arrivalDate" | "createdAt" =
    rawSort === "companyName" || rawSort === "boatName" ||
    rawSort === "arrivalDate" || rawSort === "createdAt"
      ? rawSort
      : "createdAt";
  const rawDirection = Array.isArray(params.direction) ? params.direction[0] : params.direction;
  const direction: Prisma.SortOrder = rawDirection === "asc" ? "asc" : "desc";
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
  const where = {
    maritimeUserId: profile.id,
    ...(words.length
      ? {
          AND: words.map((word) => ({
            OR: [
              { companyName: { contains: word, mode: "insensitive" as const } },
              { boatName: { contains: word, mode: "insensitive" as const } },
              { boatRegistration: { contains: word, mode: "insensitive" as const } },
              { captainName: { contains: word, mode: "insensitive" as const } },
            ],
          })),
        }
      : {}),
  };
  const orderBy: Prisma.MaritimeDeclarationOrderByWithRelationInput =
    sort === "companyName" ? { companyName: direction }
      : sort === "boatName" ? { boatName: direction }
        : sort === "arrivalDate" ? { arrivalDate: direction }
          : { createdAt: direction };
  const total = await prisma.maritimeDeclaration.count({ where });
  const { page, totalPages } = resolvePage(rawPage, total, MARITIME_DECLARATIONS_PAGE_SIZE);
  const declarations = await prisma.maritimeDeclaration.findMany({
    where,
    orderBy,
    skip: (page - 1) * MARITIME_DECLARATIONS_PAGE_SIZE,
    take: MARITIME_DECLARATIONS_PAGE_SIZE,
    select: {
      id: true,
      companyName: true,
      boatName: true,
      boatRegistration: true,
      captainName: true,
      originDepartureDate: true,
      arrivalDate: true,
      departureDate: true,
      products: { select: { quantity: true, unitPrice: true } },
    },
  });

  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (sort !== "createdAt") query.set("sort", sort);
  if (rawDirection === "asc" || rawDirection === "desc") query.set("direction", direction);
  const basePath = query.size
    ? `/dashboard/maritime?${query.toString()}`
    : "/dashboard/maritime";
  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeZone: "Indian/Antananarivo",
  });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Espace maritime</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Déclarations maritimes</h1>
          <p className="mt-2 text-slate-600">Gérez vos déclarations de bateaux et de produits.</p>
        </div>
        <Link href="/dashboard/maritime/new"
          className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white shadow-sm hover:bg-blue-800">
          Nouvelle déclaration
        </Link>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <form method="GET" action="/dashboard/maritime" className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <input name="q" type="search" defaultValue={q} maxLength={100}
            placeholder="Société, bateau, immatriculation, commandant"
            className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select name="sort" defaultValue={sort} aria-label="Trier par"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="createdAt">Date de création</option>
            <option value="companyName">Société</option>
            <option value="boatName">Bateau</option>
            <option value="arrivalDate">Date d&apos;arrivée</option>
          </select>
          <select name="direction" defaultValue={direction} aria-label="Ordre de tri"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="desc">Décroissant</option>
            <option value="asc">Croissant</option>
          </select>
          <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Rechercher
          </button>
        </form>

        <Pager basePath={basePath} page={page} pageCount={totalPages} total={total}
          totalLabel="déclarations" ariaLabel="Pagination des déclarations" />

        {declarations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-600">
            {q ? "Aucune déclaration ne correspond à cette recherche." : "Aucune déclaration enregistrée."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-3">Société / bateau</th>
                  <th className="px-3 py-3">Immatriculation</th>
                  <th className="px-3 py-3">Commandant</th>
                  <th className="px-3 py-3">Dates</th>
                  <th className="px-3 py-3 text-right">Produits</th>
                  <th className="px-3 py-3 text-right">Montant total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {declarations.map((declaration) => {
                  const amount = calculateMaritimeTotals(declaration.products.map((product) => ({
                    quantity: product.quantity.toString(),
                    unitPrice: product.unitPrice.toString(),
                  }))).total;
                  return (
                    <tr key={declaration.id} className="hover:bg-slate-50">
                      <td className="px-3 py-4">
                        <Link href={`/dashboard/maritime/${declaration.id}`} className="font-semibold text-blue-700 hover:underline">
                          {declaration.companyName}
                        </Link>
                        <span className="block text-slate-600">{declaration.boatName}</span>
                      </td>
                      <td className="px-3 py-4">{declaration.boatRegistration}</td>
                      <td className="px-3 py-4">{declaration.captainName}</td>
                      <td className="px-3 py-4">
                        <span className="block">Départ : {dateFormatter.format(declaration.originDepartureDate)}</span>
                        <span className="block">Arrivée : {dateFormatter.format(declaration.arrivalDate)}</span>
                        <span className="block">Sortie : {declaration.departureDate ? dateFormatter.format(declaration.departureDate) : "En cours"}</span>
                      </td>
                      <td className="px-3 py-4 text-right tabular-nums">{declaration.products.length}</td>
                      <td className="px-3 py-4 text-right font-semibold tabular-nums">
                        {formatMaritimeAmount(amount)} Ar
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pager basePath={basePath} page={page} pageCount={totalPages} total={total}
          totalLabel="déclarations" ariaLabel="Pagination des déclarations" />
      </section>
    </div>
  );
}
