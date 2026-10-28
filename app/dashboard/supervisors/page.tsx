import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import SupervisorForm from "./supervisor-form";
import LocationAssignmentForm from "./location-assignment-form";
import SupervisorAccountActions from "./supervisor-account-actions";

export default function SupervisorsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 p-6 md:p-10">
          <p className="text-slate-600">Chargement...</p>
        </main>
      }
    >
      <SupervisorsContent />
    </Suspense>
  );
}

async function SupervisorsContent() {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [locations, supervisors] = await Promise.all([
    prisma.location.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.supervisor.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nationalId: true,
        address: true,
        locationId: true,
        assignedLocation: { select: { name: true } },
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
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
          &larr; Retour au tableau de bord
        </Link>

        <header className="my-6">
          <h1 className="text-3xl font-bold text-slate-900">Gestion des régisseurs</h1>
          <p className="mt-2 text-slate-600">
            Les régisseurs affectés au même lieu partagent les données opérationnelles de ce lieu.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[400px_1fr]">
          <section className="h-fit rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold">Nouveau régisseur</h2>
            <SupervisorForm locations={locations} />
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">
                Régisseurs enregistrés ({supervisors.length})
              </h2>
              <Link href="/dashboard/locations" className="text-sm font-semibold text-blue-700 hover:underline">
                Gérer les lieux
              </Link>
            </div>

            {supervisors.length === 0 ? (
              <p className="text-slate-500">Aucun régisseur enregistré.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-slate-500">
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
                        <td className="px-3 py-4 font-medium text-slate-900">
                          {item.user.firstName} {item.user.lastName}
                        </td>
                        <td className="px-3 py-4">{item.user.email}</td>
                        <td className="px-3 py-4">{item.nationalId}</td>
                        <td className="px-3 py-4">
                          {item.assignedLocation?.name ?? "Non affecté"}
                        </td>
                        <td className="px-3 py-4">
                          <LocationAssignmentForm
                            supervisorId={item.id}
                            supervisorName={`${item.user.firstName} ${item.user.lastName}`}
                            currentLocationId={item.locationId}
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
    </main>
  );
}