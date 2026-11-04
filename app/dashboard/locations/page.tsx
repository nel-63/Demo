
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import LocationForm from "./location-form";
import LocationActions from "./location-actions";
import { readParam, type SearchParams } from "../search-params";

export default function LocationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<p className="text-slate-600">Chargement...</p>}>
      <LocationsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LocationsContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = await searchParams;
  const q = readParam(params, "q");
  const nameFilter = q ? { name: { contains: q, mode: "insensitive" as const } } : {};

  const [locations, deletedLocations] = await Promise.all([
    prisma.location.findMany({
      where: { deletedAt: null, ...nameFilter },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: {
          select: {
            supervisors: true,
            passages: { where: { deletedAt: null } },
          },
        },
      },
    }),
    prisma.location.findMany({
      where: { deletedAt: { not: null }, ...nameFilter },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        _count: {
          select: {
            supervisors: true,
            passages: { where: { deletedAt: null } },
          },
        },
      },
    }),
  ]);

  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeZone: "Indian/Antananarivo",
  });

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour au tableau de bord
      </Link>

      <header className="my-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Gestion des lieux</h1>
        <p className="mt-2 text-slate-600">
          Les lieux supprimés sont conservés dans la corbeille avec leurs données et peuvent être restaurés.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">Nouveau lieu</h2>
          <LocationForm />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">Lieux enregistrés ({locations.length})</h2>
          <form method="GET" action="/dashboard/locations" className="mb-5 flex gap-2">
            <input name="q" type="search" defaultValue={q} maxLength={100} placeholder="Rechercher un lieu..." className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Rechercher</button>
          </form>

          {locations.length === 0 ? (
            <p className="text-slate-600">Aucun lieu actif ne correspond à cette recherche.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-3 py-3">Lieu</th>
                    <th className="px-3 py-3">Régisseurs</th>
                    <th className="px-3 py-3">Passages</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {locations.map((location) => (
                    <tr key={location.id}>
                      <td className="px-3 py-4 font-medium">
                        <Link href={`/dashboard/locations/${location.id}`} className="text-blue-700 hover:underline">
                          {location.name}
                        </Link>
                      </td>
                      <td className="px-3 py-4">{location._count.supervisors}</td>
                      <td className="px-3 py-4">{location._count.passages}</td>
                      <td className="px-3 py-4">
                        <LocationActions id={location.id} name={location.name} deleted={false} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Corbeille ({deletedLocations.length})</h2>
            <p className="mt-1 text-sm text-slate-600">Ces lieux sont masqués du reste de l'application. Leurs données sont conservées.</p>
          </div>
        </div>

        {deletedLocations.length === 0 ? (
          <p className="text-slate-600">La corbeille est vide.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-3">Lieu supprimé</th>
                  <th className="px-3 py-3">Régisseurs associés</th>
                  <th className="px-3 py-3">Passages conservés</th>
                  <th className="px-3 py-3">Supprimé le</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deletedLocations.map((location) => (
                  <tr key={location.id}>
                    <td className="px-3 py-4 font-medium">
                      <Link href={`/dashboard/locations/${location.id}?trash=1`} className="text-blue-700 hover:underline">
                        {location.name}
                      </Link>
                    </td>
                    <td className="px-3 py-4">{location._count.supervisors}</td>
                    <td className="px-3 py-4">{location._count.passages}</td>
                    <td className="px-3 py-4">{location.deletedAt ? dateFormatter.format(location.deletedAt) : "—"}</td>
                    <td className="px-3 py-4">
                      <LocationActions id={location.id} name={location.name} deleted />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Link
        href="/dashboard/supervisors"
        className="mt-6 inline-flex rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-100"
      >
        Affecter un régisseur à un lieu
      </Link>
    </div>
  );
}
