import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import DriverForm from "./driver-form";
import StatusToggleButton from "../status-toggle-button";

export default function DriversPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <Suspense fallback={<p>Chargement...</p>}>
        <DriversContent />
      </Suspense>
    </main>
  );
}

async function DriversContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "SUPERVISOR") redirect("/dashboard");

  const profile = await prisma.supervisor.findUnique({
    where: { userId: user.id },
    select: { locationId: true, assignedLocation: { select: { name: true } } },
  });

  if (!profile?.locationId) redirect("/dashboard");

  const drivers = await prisma.driver.findMany({
    where: { locationId: profile.locationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nationalId: true,
      phoneNumber: true,
      licenseNumber: true,
      isActive: true,
    },
  });

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour au tableau de bord
      </Link>
      <header className="my-6">
        <h1 className="text-3xl font-bold text-slate-900">Chauffeurs du lieu</h1>
        <p className="mt-2 text-slate-600">
          Lieu partage : {profile.assignedLocation?.name ?? "Non renseigne"}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[380px_1fr]">
        <section className="h-fit rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">Ajouter un chauffeur</h2>
          <DriverForm />
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">Chauffeurs du lieu ({drivers.length})</h2>
          {drivers.length === 0 ? (
            <p className="text-slate-500">Aucun chauffeur enregistre pour ce lieu.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Nom</th>
                    <th className="px-3 py-3">CIN</th>
                    <th className="px-3 py-3">Telephone</th>
                    <th className="px-3 py-3">Permis</th>
                    <th className="px-3 py-3">Statut</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {drivers.map((driver) => (
                    <tr key={driver.id}>
                      <td className="px-3 py-4 font-medium">{driver.firstName} {driver.lastName}</td>
                      <td className="px-3 py-4">{driver.nationalId}</td>
                      <td className="px-3 py-4">{driver.phoneNumber || "—"}</td>
                      <td className="px-3 py-4">{driver.licenseNumber}</td>
                      <td className="px-3 py-4">
                        <span className={driver.isActive
                          ? "rounded-full bg-green-50 px-2 py-1 text-green-700"
                          : "rounded-full bg-slate-100 px-2 py-1 text-slate-600"}>
                          {driver.isActive ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <Link href={`/dashboard/drivers/${driver.id}/edit`} className="mb-2 inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Modifier</Link>
                        <StatusToggleButton
                          endpoint={`/api/drivers/${driver.id}`}
                          isActive={driver.isActive}
                          itemLabel={`${driver.firstName} ${driver.lastName}`}
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
  );
}