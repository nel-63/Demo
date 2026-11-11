import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { MARITIME_USERS_PAGE_SIZE, resolvePage } from "@/lib/pagination";
import MaritimeUserForm from "./maritime-user-form";
import Pager from "../pager";
import { readParam, type SearchParams } from "../search-params";

export default function MaritimeUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<p className="text-slate-600">Chargement...</p>}>
      <MaritimeUsersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MaritimeUsersContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = await searchParams;
  const q = readParam(params, "q");
  const numericSearch = /^-?\d+(?:\.\d{1,6})?$/.test(q) ? Number(q) : null;
  const where = q
    ? {
        OR: [
          { user: { firstName: { contains: q, mode: "insensitive" as const } } },
          { user: { lastName: { contains: q, mode: "insensitive" as const } } },
          { user: { email: { contains: q, mode: "insensitive" as const } } },
          { user: { phoneNumber: { contains: q, mode: "insensitive" as const } } },
          ...(q.toLocaleLowerCase("fr-FR") === "actif"
            ? [{ user: { isActive: true } }]
            : q.toLocaleLowerCase("fr-FR") === "inactif"
              ? [{ user: { isActive: false } }]
              : []),
          ...(numericSearch !== null && numericSearch >= -90 && numericSearch <= 90
            ? [{ latitude: { equals: q } }]
            : []),
          ...(numericSearch !== null && numericSearch >= -180 && numericSearch <= 180
            ? [{ longitude: { equals: q } }]
            : []),
        ],
      }
    : undefined;
  const total = await prisma.maritimeUser.count({ where });
  const { page, totalPages } = resolvePage(readParam(params, "page", 12), total, MARITIME_USERS_PAGE_SIZE);
  const maritimeUsers = await prisma.maritimeUser.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * MARITIME_USERS_PAGE_SIZE,
    take: MARITIME_USERS_PAGE_SIZE,
    select: {
      id: true,
      latitude: true,
      longitude: true,
      _count: { select: { declarations: true } },
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          isActive: true,
        },
      },
    },
  });
  const basePath = q ? `/dashboard/maritime-users?q=${encodeURIComponent(q)}` : "/dashboard/maritime-users";

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour au tableau de bord
      </Link>
      <header className="my-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Utilisateurs maritimes</h1>
        <p className="mt-2 text-slate-600">Créez et gérez les comptes autorisés à enregistrer des déclarations maritimes.</p>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[400px_minmax(0,1fr)]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">Nouvel utilisateur maritime</h2>
          <MaritimeUserForm />
        </section>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Comptes enregistrés ({total})</h2>
          </div>
          <form method="GET" action="/dashboard/maritime-users" className="mb-5 flex gap-2">
            <input
              name="q"
              type="search"
              defaultValue={q}
              maxLength={100}
              placeholder="Nom, email, téléphone ou coordonnées…"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Rechercher</button>
          </form>

          {maritimeUsers.length === 0 ? (
            <p className="text-slate-600">Aucun utilisateur maritime enregistré.</p>
          ) : (
            <div className="table-scrollbar w-full min-w-0 overflow-x-auto">
              <table className="w-full min-w-max text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-3">Utilisateur</th>
                    <th className="whitespace-nowrap px-3 py-3">Identifiant / email</th>
                    <th className="whitespace-nowrap px-3 py-3">Coordonnées</th>
                    <th className="whitespace-nowrap px-3 py-3">Déclarations</th>
                    <th className="whitespace-nowrap px-3 py-3">Statut</th>
                    <th className="whitespace-nowrap px-3 py-3">Gestion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {maritimeUsers.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="px-3 py-4 font-medium">
                        <Link href={`/dashboard/maritime-users/${item.id}`} className="text-blue-700 hover:underline">
                          {item.user.firstName} {item.user.lastName}
                        </Link>
                        {item.user.phoneNumber && <span className="block pt-1 text-xs font-normal text-slate-600">{item.user.phoneNumber}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4">{item.user.email}</td>
                      <td className="whitespace-nowrap px-3 py-4">{item.latitude && item.longitude ? `${item.latitude.toString()}, ${item.longitude.toString()}` : "—"}</td>
                      <td className="px-3 py-4">{item._count.declarations}</td>
                      <td className="px-3 py-4">
                        <span className={item.user.isActive
                          ? "rounded-full bg-green-50 px-2 py-1 text-xs text-green-700"
                          : "rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"}>
                          {item.user.isActive ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <Link href={`/dashboard/maritime-users/${item.id}`} className="font-semibold text-blue-700 hover:underline">
                          Modifier
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            basePath={basePath}
            page={page}
            pageCount={totalPages}
            total={total}
            totalLabel="utilisateurs maritimes"
            ariaLabel="Pagination des utilisateurs maritimes"
          />
        </section>
      </div>
    </div>
  );
}
