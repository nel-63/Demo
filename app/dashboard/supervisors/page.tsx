import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import SupervisorForm from "./supervisor-form";
import LocationAssignmentForm from "./location-assignment-form";
import SupervisorAccountActions from "./supervisor-account-actions";
import { readParam, type SearchParams } from "../search-params";

export default function SupervisorsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense
      fallback={
        <div>
          <p className="text-slate-600">Chargement...</p>
        </div>
      }
    >
      <SupervisorsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SupervisorsContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = await searchParams;
  const q = readParam(params, "q");
  const [locations, supervisors] = await Promise.all([
    prisma.location.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.supervisor.findMany({
      where: q ? {
        OR: [
          { nationalId: { contains: q, mode: "insensitive" } },
          { address: { contains: q, mode: "insensitive" } },
          { user: { firstName: { contains: q, mode: "insensitive" } } },
          { user: { lastName: { contains: q, mode: "insensitive" } } },
          { user: { email: { contains: q, mode: "insensitive" } } },
          { assignedLocation: { name: { contains: q, mode: "insensitive" } } },
        ],
      } : undefined,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nationalId: true,
        address: true,
        locationId: true,
        assignedLocation: { select: { name: true, deletedAt: true } },
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
    }),
  ]);

  return (
    <div>
      <div className="mx-auto max-w-7xl">
        <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
          &larr; Retour au tableau de bord
        </Link>

        <header className="my-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Gestion des régisseurs</h1>
          <p className="mt-2 text-slate-600">
            Les régisseurs affectés au même lieu partagent les données opérationnelles de ce lieu.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[400px_1fr]">
          <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold">Nouveau régisseur</h2>
            <SupervisorForm locations={locations} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">
                Régisseurs enregistrés ({supervisors.length})
              </h2>
              <Link href="/dashboard/locations" className="text-sm font-semibold text-blue-700 hover:underline">
                Gérer les lieux
              </Link>
            </div>

            <form method="GET" action="/dashboard/supervisors" className="mb-5 flex gap-2">
              <input name="q" type="search" defaultValue={q} maxLength={100} placeholder="Nom, email, CIN ou lieu…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Rechercher</button>
            </form>
            {supervisors.length === 0 ? (
              <p className="text-slate-600">Aucun régisseur enregistré.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3 py-3">Régisseur</th>
                      <th className="px-3 py-3">Email</th>
                      <th className="px-3 py-3">CIN</th>
                      <th className="px-3 py-3">Lieu actuel</th>
                      <th className="px-3 py-3">Changer l&apos;affectation</th>
                      <th className="px-3 py-3">Compte</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {supervisors.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="px-3 py-4 font-medium">
                          <Link href={`/dashboard/supervisors/${item.id}`} className="text-blue-700 hover:underline">
                            {item.user.firstName} {item.user.lastName}
                          </Link>
                        </td>
                        <td className="px-3 py-4">{item.user.email}</td>
                        <td className="px-3 py-4">{item.nationalId}</td>
                        <td className="px-3 py-4">
                          {item.assignedLocation?.deletedAt ? "Aucun lieu actif" : item.assignedLocation?.name ?? "Non affecté"}
                          {item.assignedLocation?.deletedAt && (
                            <span className="ml-1 text-xs text-red-700">(archivé)</span>
                          )}
                        </td>
                        <td className="px-3 py-4">
                          <LocationAssignmentForm
                            supervisorId={item.id}
                            supervisorName={`${item.user.firstName} ${item.user.lastName}`}
                            currentLocationId={item.locationId}
                            currentLocationName={item.assignedLocation?.deletedAt ? null : item.assignedLocation?.name ?? null}
                            locations={locations}
                          />
                        </td>
                        <td className="px-3 py-4">
                          <SupervisorAccountActions
                            supervisorId={item.id}
                            supervisorName={`${item.user.firstName} ${item.user.lastName}`}
                            isActive={item.user.isActive}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}