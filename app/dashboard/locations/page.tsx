import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import LocationForm from "./location-form";

export default function LocationsPage() {
  return (
    <Suspense
      fallback={
        <div>
          <p className="text-slate-600">Chargement...</p>
        </div>
      }
    >
      <LocationsContent />
    </Suspense>
  );
}

async function LocationsContent() {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: {
        select: {
          supervisors: true,
          passages: true,
        },
      },
    },
  });

  return (
    <div>
      <div className="mx-auto max-w-7xl">
        <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
          &larr; Retour au tableau de bord
        </Link>

        <header className="my-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Gestion des lieux</h1>
          <p className="mt-2 text-slate-600">
            Chaque lieu constitue un espace de données partagé entre les régisseurs qui y sont affectés.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr]">
          <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold">Nouveau lieu</h2>
            <LocationForm />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold">
              Lieux enregistrés ({locations.length})
            </h2>

            {locations.length === 0 ? (
              <p className="text-slate-600">
                Crée d&apos;abord un lieu avant d&apos;enregistrer un régisseur.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3 py-3">Lieu</th>
                      <th className="px-3 py-3">Régisseurs</th>
                      <th className="px-3 py-3">Passages</th>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Link
              href="/dashboard/supervisors"
              className="mt-6 inline-flex rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-100"
            >
              Affecter un régisseur à un lieu
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}