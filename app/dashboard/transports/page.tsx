import TransportStatusControl from "./transport-status-control";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import TransportForm from "./transport-form";
import TransportAmountForm from "./transport-amount-form";

export default function TransportsPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <Suspense fallback={<p>Chargement...</p>}>
        <TransportsContent />
      </Suspense>
    </main>
  );
}

async function TransportsContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "SUPERVISOR") redirect("/dashboard");

  const profile = await prisma.supervisor.findUnique({
    where: { userId: user.id },
    select: { locationId: true, assignedLocation: { select: { name: true } } },
  });
  if (!profile?.locationId) redirect("/dashboard");

  const [transports, vehicles] = await Promise.all([
    prisma.transportAssignment.findMany({
      where: { locationId: profile.locationId },
      orderBy: { assignedAt: "desc" },
      select: {
        id: true,
        assignedAt: true,
        status: true,
        amountDue: true,
        payment: { select: { id: true } },
        product: { select: { name: true, type: true, tonnage: true } },
        vehicle: {
          select: {
            licensePlate: true,
            vehicleType: true,
            driver: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.vehicle.findMany({
      where: {
        locationId: profile.locationId,
        isActive: true,
        driver: { isActive: true, locationId: profile.locationId },
      },
      orderBy: { licensePlate: "asc" },
      select: {
        id: true,
        vehicleType: true,
        licensePlate: true,
        driver: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour au tableau de bord
      </Link>

      <header className="my-6">
        <h1 className="text-3xl font-bold text-slate-900">Transports du lieu</h1>
        <p className="mt-2 text-slate-600">
          Lieu partage : {profile.assignedLocation?.name ?? "Non renseigne"}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[380px_1fr]">
        <section className="h-fit rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">Nouveau transport</h2>
          <TransportForm vehicles={vehicles} />
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">
            Transports du lieu ({transports.length})
          </h2>

          {transports.length === 0 ? (
            <p className="text-slate-500">Aucun transport pour ce lieu.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Date / produit</th>
                    <th className="px-3 py-3">Tonnage</th>
                    <th className="px-3 py-3">Vehicule</th>
                    <th className="px-3 py-3">Montant du</th>
                    <th className="px-3 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transports.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="px-3 py-4">
                        <p className="font-medium">{item.assignedAt.toLocaleDateString("fr-FR")}</p>
                        <p>{item.product.name}</p>
                        <p className="text-xs text-slate-500">{item.product.type}</p>
                      </td>
                      <td className="px-3 py-4">{String(item.product.tonnage)} t</td>
                      <td className="px-3 py-4">
                        <p className="font-medium">{item.vehicle.licensePlate}</p>
                        <p>{item.vehicle.vehicleType}</p>
                        <p className="text-xs text-slate-500">
                          {item.vehicle.driver.firstName} {item.vehicle.driver.lastName}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        {item.amountDue !== null ? (
                          <div>
                            <p className="font-semibold">{String(item.amountDue)} MGA</p>
                            {item.payment && <p className="text-xs text-green-700">Paye</p>}
                          </div>
                        ) : item.payment ? (
                          <span className="text-xs text-amber-700">Paiement existant : a verifier</span>
                        ) : item.status === "CANCELLED" ? (
                          <span className="text-xs text-slate-500">Transport annule</span>
                        ) : (
                          <TransportAmountForm id={item.id} />
                        )}
                      </td>
                      <td className="px-3 py-4"><TransportStatusControl id={item.id} status={item.status} isPaid={Boolean(item.payment)} /></td>
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
