import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PAYMENT_METHOD_LABELS, formatMGA } from "@/lib/audit";
import ListFilters from "../list-filters";
import { readChoice, readParam, type SearchParams } from "../search-params";
import PassageForm from "./passage-form";
import PassageActions from "./passage-actions";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short", timeZone: "Indian/Antananarivo",
});

export default function PassagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <Suspense fallback={<p>Chargement...</p>}><PassagesContent searchParams={searchParams} /></Suspense>;
}

async function PassagesContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = user.role === "ADMIN";
  if (!isAdmin && user.role !== "SUPERVISOR") redirect("/dashboard");

  let locationId: string | null = null;
  let locationName: string | null = null;
  if (!isAdmin) {
    const profile = await prisma.supervisor.findUnique({
      where: { userId: user.id },
      select: { locationId: true, assignedLocation: { select: { name: true } } },
    });
    if (!profile?.locationId) {
      return <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold">Aucun lieu affecté</h1><p className="mt-3 text-slate-700">Contactez l'administrateur pour associer votre compte à un lieu.</p></section>;
    }
    locationId = profile.locationId;
    locationName = profile.assignedLocation?.name ?? null;
  }

  const params = await searchParams;
  const q = readParam(params, "q");
  const method = readChoice(params, "mode", Object.keys(PAYMENT_METHOD_LABELS));
  const deleted = isAdmin && readParam(params, "deleted", 1) === "1";
  const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
  const has = (word: string) => ({ contains: word, mode: "insensitive" as const });

  const where = {
    deletedAt: deleted ? { not: null } : null,
    ...(locationId ? { locationId } : {}),
    ...(method ? { payment: { is: { paymentMethod: method as "CASH" } } } : {}),
    ...(words.length ? {
      AND: words.map((word) => ({
        OR: [
          { product: { name: has(word) } }, { product: { type: has(word) } },
          { origin: has(word) }, { destination: has(word) },
          { vehicleInfo: has(word) }, { vehicleRegistration: has(word) },
          { vehicleCharacteristics: has(word) }, { driverName: has(word) },
          { driverLicenseNumber: has(word) },
          { supervisor: { user: { lastName: has(word) } } },
          { supervisor: { user: { firstName: has(word) } } },
        ],
      })),
    } : {}),
  };

  const [total, passages] = await Promise.all([
    prisma.passage.count({ where }),
    prisma.passage.findMany({
      where, orderBy: { assignedAt: "desc" }, take: 100,
      select: {
        id: true, assignedAt: true, origin: true, destination: true,
        vehicleInfo: true, vehicleRegistration: true, vehicleCharacteristics: true,
        driverName: true, driverLicenseNumber: true, notes: true, deletedAt: true,
        product: { select: { name: true, type: true, tonnage: true } },
        supervisor: { select: { user: { select: { firstName: true, lastName: true } } } },
        payment: { select: { paymentMethod: true, reference: true, amountDue: true, amountReceived: true, changeReturned: true } },
      },
    }),
  ]);

  const filtered = q !== "" || method !== "";
  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">&larr; Retour au tableau de bord</Link>
      <header className="my-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{deleted ? "Passages supprimés" : "Passages"}</h1>
        {locationName && <p className="mt-2 text-slate-700">Lieu : {locationName}</p>}
      </header>

      {isAdmin && (
        <div className="mb-5">
          <Link href={deleted ? "/dashboard/passages" : "/dashboard/passages?deleted=1"} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {deleted ? "Voir les passages actifs" : "Voir les passages supprimés"}
          </Link>
        </div>
      )}

      <div className={isAdmin ? "" : "grid gap-6 xl:grid-cols-[440px_1fr]"}>
        {!isAdmin && (
          <section className="mb-6 h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:mb-0">
            <h2 className="mb-4 text-xl font-semibold text-slate-900">Nouveau passage</h2>
            <PassageForm />
          </section>
        )}
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">{deleted ? "Enregistrements conservés" : "Historique des passages"} ({total})</h2>
          <ListFilters action="/dashboard/passages" q={q} placeholder="Produit, trajet, immatriculation, chauffeur…" filters={[
            { name: "mode", label: "Mode de paiement", value: method, options: Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label })) },
            ...(deleted ? [{ name: "deleted", label: "Affichage", value: "1", options: [{ value: "1", label: "Supprimés" }] }] : []),
          ]} />
          {passages.length === 0 ? (
            <p className="text-slate-700">{filtered ? "Aucun passage ne correspond à ces critères." : "Aucun passage enregistré."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-slate-700"><tr>
                  <th className="px-3 py-3">Date</th><th className="px-3 py-3">Produit</th>
                  <th className="px-3 py-3 text-right">Tonnage</th><th className="px-3 py-3">Trajet</th>
                  <th className="px-3 py-3">Véhicule / chauffeur</th><th className="px-3 py-3 text-right">Montant payé</th>
                  <th className="px-3 py-3">Mode</th><th className="px-3 py-3">Régisseur</th>
                  {isAdmin && !deleted && <th className="px-3 py-3">Actions</th>}
                </tr></thead>
                <tbody className="divide-y">
                  {passages.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-4">{dateFormatter.format(item.assignedAt)}</td>
                      <td className="px-3 py-4"><p className="font-medium text-slate-900">{item.product.name}</p><p className="text-xs text-slate-700">{item.product.type}</p></td>
                      <td className="whitespace-nowrap px-3 py-4 text-right">{Number(item.product.tonnage).toLocaleString("fr-FR")} t</td>
                      <td className="px-3 py-4">{item.origin} → {item.destination}</td>
                      <td className="px-3 py-4">
                        {item.vehicleRegistration && <p className="font-medium">Immatriculation : {item.vehicleRegistration}</p>}
                        {(item.vehicleCharacteristics || item.vehicleInfo) && <p>{item.vehicleCharacteristics || item.vehicleInfo}</p>}
                        {item.driverName && <p className="text-xs text-slate-700">Chauffeur : {item.driverName}</p>}
                        {item.driverLicenseNumber && <p className="text-xs text-slate-700">Permis : {item.driverLicenseNumber}</p>}
                        {!item.vehicleInfo && !item.vehicleRegistration && !item.vehicleCharacteristics && !item.driverName && !item.driverLicenseNumber && "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-right">{item.payment ? formatMGA(item.payment.amountDue) : "—"}</td>
                      <td className="px-3 py-4">{item.payment ? <>{PAYMENT_METHOD_LABELS[item.payment.paymentMethod] ?? item.payment.paymentMethod}{item.payment.reference && <p className="text-xs text-slate-700">{item.payment.reference}</p>}</> : "—"}</td>
                      <td className="px-3 py-4">{item.supervisor.user.firstName} {item.supervisor.user.lastName}</td>
                      {isAdmin && !deleted && item.payment && <td className="min-w-[230px] px-3 py-4">
                        <PassageActions initial={{
                          id: item.id, origin: item.origin, destination: item.destination,
                          vehicleInfo: item.vehicleInfo, vehicleRegistration: item.vehicleRegistration,
                          vehicleCharacteristics: item.vehicleCharacteristics, driverName: item.driverName,
                          driverLicenseNumber: item.driverLicenseNumber, notes: item.notes,
                          product: { name: item.product.name, type: item.product.type, tonnage: String(item.product.tonnage) },
                          payment: { paymentMethod: item.payment.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS, reference: item.payment.reference, amountDue: String(item.payment.amountDue), amountReceived: String(item.payment.amountReceived) },
                        }}/>
                      </td>}
                      {isAdmin && deleted && <td className="px-3 py-4 text-xs font-semibold text-red-700">Supprimé le {item.deletedAt ? dateFormatter.format(item.deletedAt) : "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > passages.length && <p className="mt-4 text-sm text-slate-700">Les {passages.length} passages les plus récents sont affichés sur {total}. Affinez la recherche pour retrouver les autres.</p>}
        </section>
      </div>
    </div>
  );
}
