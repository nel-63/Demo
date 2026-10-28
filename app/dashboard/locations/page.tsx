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
        <main className="min-h-screen bg-slate-100 p-6 md:p-10">
          <p className="text-slate-600">Chargement...</p>
        </main>
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
          drivers: true,
          vehicles: true,
          assignments: true,
        },
      },
    },
  });

  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
          &larr; Retour au tableau de bord
        </Link>

        <header className="my-6">
          <h1 className="text-3xl font-bold text-slate-900">Gestion des lieux</h1>
          <p className="mt-2 text-slate-600">
            Chaque lieu constitue un espace de données partagé entre les régisseurs qui y sont affectés.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr]">
          <section className="h-fit rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold">Nouveau lieu</h2>
            <LocationForm />
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold">
              Lieux enregistrés ({locations.length})
            </h2>

            {locations.length === 0 ? (
              <p className="text-slate-500">
                Crée d&apos;abord un lieu avant d&apos;enregistrer un régisseur.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Lieu</th>
                      <th className="px-3 py-3">Régisseurs</th>
                      <th className="px-3 py-3">Chauffeurs</th>
                      <th className="px-3 py-3">Véhicules</th>
                      <th className="px-3 py-3">Transports</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {locations.map((location) => (
                      <tr key={location.id}>
                        <td className="px-3 py-4 font-medium text-slate-900">
                          {location.name}
                        </td>
                        <td className="px-3 py-4">{location._count.supervisors}</td>
                        <td className="px-3 py-4">{location._count.drivers}</td>
                        <td className="px-3 py-4">{location._count.vehicles}</td>
                        <td className="px-3 py-4">{location._count.assignments}</td>
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
    </main>
  );
}