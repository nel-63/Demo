import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PAYMENT_METHOD_LABELS, formatMGA } from "@/lib/audit";
import ListFilters from "../list-filters";
import { readChoice, readParam, type SearchParams } from "../search-params";
import PassageForm from "./passage-form";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeZone: "Indian/Antananarivo",
});

export default function PassagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <Suspense fallback={<p>Chargement...</p>}>
        <PassagesContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function PassagesContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "SUPERVISOR") redirect("/dashboard");

  const profile = await prisma.supervisor.findUnique({
    where: { userId: user.id },
    select: { locationId: true, assignedLocation: { select: { name: true } } },
  });

  if (!profile?.locationId) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Aucun lieu affecté</h1>
        <p className="mt-3 text-slate-700">Contactez l&apos;administrateur pour associer votre compte à un lieu.</p>
      </section>
    );
  }

  const params = await searchParams;
  const q = readParam(params, "q");
  const method = readChoice(params, "mode", Object.keys(PAYMENT_METHOD_LABELS));
  const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
  const has = (word: string) => ({ contains: word, mode: "insensitive" as const });

  const where = {
    locationId: profile.locationId,
    ...(method ? { payment: { is: { paymentMethod: method as "CASH" } } } : {}),
    ...(words.length > 0
      ? {
          AND: words.map((word) => ({
            OR: [
              { product: { name: has(word) } },
              { product: { type: has(word) } },
              { origin: has(word) },
              { destination: has(word) },
              { vehicleInfo: has(word) },
              { driverName: has(word) },
              { supervisor: { user: { lastName: has(word) } } },
              { supervisor: { user: { firstName: has(word) } } },
            ],
          })),
        }
      : {}),
  };

  const [total, passages] = await Promise.all([
    prisma.passage.count({ where }),
    prisma.passage.findMany({
      where,
      orderBy: { assignedAt: "desc" },
      take: 100,
      select: {
        id: true,
        assignedAt: true,
        origin: true,
        destination: true,
        vehicleInfo: true,
        driverName: true,
        notes: true,
        product: { select: { name: true, type: true, tonnage: true } },
        supervisor: { select: { user: { select: { firstName: true, lastName: true } } } },
        payment: { select: { paymentMethod: true, reference: true, amountDue: true, changeReturned: true } },
      },
    }),
  ]);

  const filtered = q !== "" || method !== "";

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour au tableau de bord
      </Link>

      <header className="my-6">
        <h1 className="text-3xl font-bold text-slate-900">Passages</h1>
        <p className="mt-2 text-slate-700">
          Lieu : {profile.assignedLocation?.name ?? "Non renseigné"}. Un passage n&apos;est enregistré
          qu&apos;avec son paiement : sans paiement, le produit ne passe pas.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[440px_1fr]">
        <section className="h-fit rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Nouveau passage</h2>
          <PassageForm />
        </section>

        <section className="min-w-0 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold text-slate-900">
            Historique des passages ({total})
          </h2>

          <ListFilters
            action="/dashboard/passages"
            q={q}
            placeholder="Produit, origine, destination, chauffeur..."
            filters={[
              {
                name: "mode",
                label: "Mode de paiement",
                value: method,
                options: Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label })),
              },
            ]}
          />

          {passages.length === 0 ? (
            <p className="text-slate-700">
              {filtered ? "Aucun passage ne correspond à ces critères." : "Aucun passage enregistré pour le moment."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-slate-700">
                  <tr>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Produit</th>
                    <th className="px-3 py-3 text-right">Tonnage</th>
                    <th className="px-3 py-3">Trajet</th>
                    <th className="px-3 py-3">Véhicule / chauffeur</th>
                    <th className="px-3 py-3 text-right">Montant payé</th>
                    <th className="px-3 py-3">Mode</th>
                    <th className="px-3 py-3">Enregistré par</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {passages.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-4">{dateFormatter.format(item.assignedAt)}</td>
                      <td className="px-3 py-4">
                        <p className="font-medium text-slate-900">{item.product.name}</p>
                        <p className="text-xs text-slate-700">{item.product.type}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-right">
                        {Number(item.product.tonnage).toLocaleString("fr-FR")} t
                      </td>
                      <td className="px-3 py-4">
                        {item.origin} <span aria-hidden="true">→</span>
                        <span className="sr-only"> vers </span> {item.destination}
                      </td>
                      <td className="px-3 py-4">
                        {item.vehicleInfo || item.driverName ? (
                          <>
                            {item.vehicleInfo && <p>{item.vehicleInfo}</p>}
                            {item.driverName && <p className="text-xs text-slate-700">{item.driverName}</p>}
                          </>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-right">
                        {item.payment ? formatMGA(item.payment.amountDue) : "—"}
                      </td>
                      <td className="px-3 py-4">
                        {item.payment ? (
                          <>
                            {PAYMENT_METHOD_LABELS[item.payment.paymentMethod] ?? item.payment.paymentMethod}
                            {item.payment.reference && (
                              <p className="text-xs text-slate-700">{item.payment.reference}</p>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-4">
                        {item.supervisor.user.firstName} {item.supervisor.user.lastName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > passages.length && (
            <p className="mt-4 text-sm text-slate-700">
              Les {passages.length} passages les plus récents sont affichés sur {total}. Affinez la recherche
              pour retrouver les autres.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
