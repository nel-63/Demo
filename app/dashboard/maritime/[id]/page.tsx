import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateMaritimeTotals, formatMaritimeAmount } from "@/lib/maritime-declarations";
import DeclarationDeleteButton from "../declaration-delete-button";

type Props = { params: Promise<{ id: string }> };

export default function MaritimeDeclarationDetailPage({ params }: Props) {
  return <Suspense fallback={<p className="text-slate-600">Chargement...</p>}><DeclarationDetails params={params} /></Suspense>;
}

async function DeclarationDetails({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "USER_MAR") redirect("/dashboard");

  const profile = await prisma.maritimeUser.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!profile) notFound();

  const { id } = await params;
  const declaration = await prisma.maritimeDeclaration.findFirst({
    where: { id, maritimeUserId: profile.id, departureDate: null },
    include: { products: { orderBy: { createdAt: "asc" } } },
  });
  if (!declaration) notFound();

  const totals = calculateMaritimeTotals(declaration.products.map((product) => ({
    quantity: product.quantity.toString(),
    unitPrice: product.unitPrice.toString(),
  })));
  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "Indian/Antananarivo",
  });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="my-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Déclaration maritime</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{declaration.companyName}</h1>
          <p className="mt-2 text-slate-700">{declaration.boatName} · {declaration.boatRegistration}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/maritime/${id}/edit`}
            className="rounded-xl bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800">
            Modifier
          </Link>
          <DeclarationDeleteButton id={id} />
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Société et bateau</h2>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-slate-600">Société</dt><dd className="font-medium text-slate-900">{declaration.companyName}</dd></div>
            <div><dt className="text-slate-600">Bateau</dt><dd className="font-medium text-slate-900">{declaration.boatName}</dd></div>
            <div><dt className="text-slate-600">Immatriculation</dt><dd className="font-medium text-slate-900">{declaration.boatRegistration}</dd></div>
            <div><dt className="text-slate-600">Capacité</dt><dd className="font-medium text-slate-900">{declaration.boatCapacity.toString()} t</dd></div>
          </dl>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Commandant</h2>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-slate-600">Nom</dt><dd className="font-medium text-slate-900">{declaration.captainName}</dd></div>
            <div><dt className="text-slate-600">Téléphone</dt><dd className="font-medium text-slate-900">{declaration.captainPhone ?? "Non renseigné"}</dd></div>
            <div><dt className="text-slate-600">Email</dt><dd className="font-medium text-slate-900">{declaration.captainEmail ?? "Non renseigné"}</dd></div>
          </dl>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Dates</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-slate-600">Départ du port d&apos;origine</dt><dd className="font-medium text-slate-900">{dateFormatter.format(declaration.originDepartureDate)}</dd></div>
          <div><dt className="text-slate-600">Arrivée ici</dt><dd className="font-medium text-slate-900">{dateFormatter.format(declaration.arrivalDate)}</dd></div>
          <div><dt className="text-slate-600">Départ d&apos;ici</dt><dd className="font-medium text-slate-900">{declaration.departureDate ? dateFormatter.format(declaration.departureDate) : "En cours — date non renseignée"}</dd></div>
        </dl>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Produits</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr><th className="px-3 py-3">Type</th><th className="px-3 py-3 text-right">Quantité (kg)</th><th className="px-3 py-3 text-right">Prix (Ar/kg)</th><th className="px-3 py-3 text-right">Total (Ar)</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {declaration.products.map((product, index) => (
                <tr key={product.id}>
                  <td className="px-3 py-3 font-medium text-slate-900">{product.productType}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatMaritimeAmount(product.quantity.toString())}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatMaritimeAmount(product.unitPrice.toString())}</td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums">{formatMaritimeAmount(totals.lineTotals[index] ?? "0")}</td>
                </tr>
              ))}
              {declaration.products.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-600">Aucun produit enregistré pour le moment.</td></tr>}
            </tbody>
            <tfoot className="border-t-2 border-slate-200">
              <tr><th colSpan={3} className="px-3 py-4 text-right text-base">Total général</th><td className="px-3 py-4 text-right text-base font-bold tabular-nums">{formatMaritimeAmount(totals.total)} Ar</td></tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
