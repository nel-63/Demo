import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import PaymentForm from "./payment-form";

const labels: Record<string, string> = {
  CASH: "Espèces",
  BANK_TRANSFER: "Virement bancaire",
  CHECK: "Chèque",
  MOBILE_MONEY: "Mobile money",
  OTHER: "Autre",
};

function money(value: unknown) {
  return `${Number(value ?? 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MGA`;
}

export default function PaymentsPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <Suspense fallback={<p>Chargement...</p>}>
        <PaymentsContent />
      </Suspense>
    </main>
  );
}

async function PaymentsContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "SUPERVISOR") redirect("/dashboard");

  const profile = await prisma.supervisor.findUnique({
    where: { userId: user.id },
    select: { locationId: true, assignedLocation: { select: { name: true } } },
  });
  if (!profile?.locationId) redirect("/dashboard");

  const [transports, payments] = await Promise.all([
    prisma.transportAssignment.findMany({
      where: {
        locationId: profile.locationId,
        status: { not: "CANCELLED" },
        amountDue: { not: null },
        payment: { is: null },
      },
      orderBy: { assignedAt: "desc" },
      select: {
        id: true,
        assignedAt: true,
        amountDue: true,
        product: { select: { name: true, type: true } },
        vehicle: { select: { licensePlate: true } },
        supervisor: {
          select: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    }),
    prisma.payment.findMany({
      where: { assignment: { is: { locationId: profile.locationId } } },
      take: 100,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        paymentMethod: true,
        reference: true,
        amountDue: true,
        amountReceived: true,
        changeReturned: true,
        createdAt: true,
        assignment: {
          select: {
            product: { select: { name: true } },
            vehicle: { select: { licensePlate: true } },
          },
        },
        recordedBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour au tableau de bord
      </Link>

      <header className="my-6">
        <h1 className="text-3xl font-bold text-slate-900">Paiements du lieu</h1>
        <p className="mt-2 text-slate-600">
          Lieu partagé : {profile.assignedLocation?.name ?? "Non renseigné"}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[380px_1fr]">
        <section className="h-fit rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">Paiement intégral</h2>
          <PaymentForm
            transports={transports.map((item) => ({
              ...item,
              assignedAt: item.assignedAt.toISOString(),
              amountDue: String(item.amountDue),
            }))}
          />
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">
            Historique partagé ({payments.length} paiements récents)
          </h2>

          {payments.length === 0 ? (
            <p className="text-slate-500">Aucun paiement enregistré pour ce lieu.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Date / produit</th>
                    <th className="px-3 py-3">Mode / référence</th>
                    <th className="px-3 py-3">Montant du</th>
                    <th className="px-3 py-3">Reçu</th>
                    <th className="px-3 py-3">Rendu</th>
                    <th className="px-3 py-3">Enregistré par</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-3 py-4">
                        <p>{payment.createdAt.toLocaleDateString("fr-FR")}</p>
                        <p className="font-medium">{payment.assignment.product.name}</p>
                        <p className="text-xs text-slate-500">{payment.assignment.vehicle.licensePlate}</p>
                      </td>
                      <td className="px-3 py-4">
                        <p>{labels[payment.paymentMethod] ?? payment.paymentMethod}</p>
                        <p className="text-xs text-slate-500">{payment.reference || "—"}</p>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">{money(payment.amountDue)}</td>
                      <td className="px-3 py-4 whitespace-nowrap">{money(payment.amountReceived)}</td>
                      <td className="px-3 py-4 whitespace-nowrap">{money(payment.changeReturned)}</td>
                      <td className="px-3 py-4">{payment.recordedBy.firstName} {payment.recordedBy.lastName}</td>
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