import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatMGA } from "@/lib/audit";
import LocationStats from "./location-stats";
import { StatCard } from "./stat-card";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeZone: "Indian/Antananarivo",
});

const tonnageText = (value: unknown) => `${Number(value ?? 0).toLocaleString("fr-FR")} t`;

export default function DashboardPage() {
  return (
    <div>
      <Suspense fallback={<p>Chargement du tableau de bord...</p>}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (user.role === "ADMIN") {
    return <AdminDashboard firstName={user.firstName} lastName={user.lastName} />;
  }
  if (user.role === "SUPERVISOR") {
    return <SupervisorDashboard userId={user.id} firstName={user.firstName} lastName={user.lastName} />;
  }

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold">Accès non autorisé</h1>
      <p className="mt-3 text-slate-700">Contactez l&apos;administrateur pour obtenir les droits nécessaires.</p>
    </section>
  );
}

async function AdminDashboard({ firstName, lastName }: { firstName: string; lastName: string }) {
  const [supervisors, locations, passages, tonnage, payments] = await Promise.all([
    prisma.supervisor.count(),
    prisma.location.count(),
    prisma.passage.count(),
    prisma.product.aggregate({ _sum: { tonnage: true } }),
    prisma.payment.aggregate({ _sum: { amountReceived: true, changeReturned: true } }),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Administration</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Statistiques globales</h1>
          <p className="mt-2 text-slate-700">Bienvenue, {firstName} {lastName}.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Lieux" value={locations} description="Lieux de passage enregistrés" kind="locations" />
        <StatCard label="Régisseurs" value={supervisors} description="Chacun travaille sur un lieu" kind="supervisors" />
        <StatCard label="Passages" value={passages} description="Produits passés, tous lieux confondus" kind="passages" />
        <StatCard label="Tonnage cumulé" value={tonnageText(tonnage._sum.tonnage)} description="Total des produits passés" kind="tonnage" />
        <StatCard label="Montant reçu" value={formatMGA(payments._sum.amountReceived)} description="Total encaissé" kind="received" />
        <StatCard label="Monnaie rendue" value={formatMGA(payments._sum.changeReturned)} description="Total rendu en espèces" kind="change" />
      </div>

      <LocationStats />
    </div>
  );
}

async function SupervisorDashboard({
  userId,
  firstName,
  lastName,
}: {
  userId: string;
  firstName: string;
  lastName: string;
}) {
  const profile = await prisma.supervisor.findUnique({
    where: { userId },
    select: { locationId: true, assignedLocation: { select: { name: true } } },
  });

  if (!profile?.locationId) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Aucun lieu affecté</h1>
        <p className="mt-3 text-slate-700">Contactez l&apos;administrateur pour associer votre compte à un lieu.</p>
      </section>
    );
  }

  const locationId = profile.locationId;

  const [passages, tonnage, payments, recent] = await Promise.all([
    prisma.passage.count({ where: { locationId } }),
    prisma.product.aggregate({
      where: { passage: { is: { locationId } } },
      _sum: { tonnage: true },
    }),
    prisma.payment.aggregate({
      where: { passage: { is: { locationId } } },
      _sum: { amountReceived: true, changeReturned: true },
    }),
    prisma.passage.findMany({
      where: { locationId },
      take: 8,
      orderBy: { assignedAt: "desc" },
      select: {
        id: true,
        assignedAt: true,
        origin: true,
        destination: true,
        product: { select: { name: true, tonnage: true } },
        payment: { select: { amountDue: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Espace régisseur</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Statistiques du lieu</h1>
          <p className="mt-2 text-slate-700">
            Bienvenue, {firstName} {lastName}. Lieu : {profile.assignedLocation?.name ?? "Non renseigné"}.
          </p>
          <p className="mt-1 text-sm text-slate-700">
            Les chiffres comprennent les passages enregistrés par tous les régisseurs de ce lieu.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard/passages" className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-800">
            Enregistrer un passage
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Passages du lieu" value={passages} description="Produits passés par ce lieu" kind="passages" />
        <StatCard label="Tonnage cumulé" value={tonnageText(tonnage._sum.tonnage)} description="Total des produits passés" kind="tonnage" />
        <StatCard label="Montant reçu" value={formatMGA(payments._sum.amountReceived)} description="Total encaissé pour le lieu" kind="received" />
        <StatCard label="Monnaie rendue" value={formatMGA(payments._sum.changeReturned)} description="Total rendu en espèces" kind="change" />
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">Passages récents</h2>
          <Link href="/dashboard/passages" className="text-sm font-medium text-blue-700 hover:underline">
            Voir tout l&apos;historique
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="text-slate-700">Aucun passage enregistré pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-slate-700">
                <tr>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Produit</th>
                  <th className="px-3 py-3 text-right">Tonnage</th>
                  <th className="px-3 py-3">Trajet</th>
                  <th className="px-3 py-3 text-right">Montant payé</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-4">{dateFormatter.format(item.assignedAt)}</td>
                    <td className="px-3 py-4 font-medium">{item.product.name}</td>
                    <td className="px-3 py-4 text-right">{tonnageText(item.product.tonnage)}</td>
                    <td className="px-3 py-4">
                      {item.origin} <span aria-hidden="true">→</span>
                      <span className="sr-only"> vers </span> {item.destination}
                    </td>
                    <td className="px-3 py-4 text-right">{item.payment ? formatMGA(item.payment.amountDue) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
