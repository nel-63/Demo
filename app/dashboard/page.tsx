import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import LocationStats from "./location-stats";
import LogoutButton from "./logout-button";
import { StatCard, StatusTile } from "./stat-card";

const statusLabels: Record<string, string> = {
  PLANNED: "Planifié",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
};

function money(value: unknown) {
  return `${Number(value ?? 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MGA`;
}

function ModuleLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="block rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-400 hover:shadow-sm">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </Link>
  );
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <Suspense fallback={<p>Chargement du tableau de bord...</p>}>
        <DashboardContent />
      </Suspense>
    </main>
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
    <section className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold">Accès non autorisé</h1>
      <p className="mt-3 text-slate-600">Contacte l&apos;administrateur pour obtenir les droits nécessaires.</p>
    </section>
  );
}

async function AdminDashboard({ firstName, lastName }: { firstName: string; lastName: string }) {
  const [
    supervisors,
    locations,
    drivers,
    vehicles,
    transports,
    products,
    payments,
    statuses,
    outstanding,
  ] = await Promise.all([
    prisma.supervisor.count(),
    prisma.location.count(),
    prisma.driver.count(),
    prisma.vehicle.count(),
    prisma.transportAssignment.count(),
    prisma.product.count(),
    prisma.payment.aggregate({
      _count: { _all: true },
      _sum: { amountDue: true, amountReceived: true, changeReturned: true },
    }),
    prisma.transportAssignment.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    // Reste à encaisser : transports non annulés et sans paiement.
    prisma.transportAssignment.aggregate({
      where: { status: { not: "CANCELLED" }, payment: { is: null } },
      _sum: { amountDue: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Administration</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Statistiques globales</h1>
          <p className="mt-2 text-slate-600">Bienvenue, {firstName} {lastName}.</p>
        </div>
        <Link href="/dashboard/supervisors" className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">
          Enregistrer un régisseur</Link>
        <Link href="/dashboard/locations" className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-100">
          Gérer les lieux
        </Link>
        <Link href="/dashboard/audit" className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-100">
          Journal d&apos;audit
        </Link>
      
        <LogoutButton />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Lieux" value={locations} description="Emplacements enregistrés" kind="locations" />
        <StatCard label="Régisseurs" value={supervisors} description="Dans toute l'entreprise" kind="supervisors" />
        <StatCard label="Chauffeurs" value={drivers} description="Tous les lieux" kind="drivers" />
        <StatCard label="Véhicules" value={vehicles} description="Tous les lieux" kind="vehicles" />
        <StatCard label="Transports" value={transports} description="Tous les transports enregistrés" kind="transports" />
        <StatCard label="Produits" value={products} description="Fiches produits enregistrées" kind="products" />
        <StatCard label="Paiements" value={payments._count._all} description="Opérations de paiement enregistrées" kind="payments" />
        <StatCard label="Reste à encaisser" value={money(outstanding._sum.amountDue)} description="Transports non annulés et non payés" kind="outstanding" />
        <StatCard label="Montant reçu" value={money(payments._sum.amountReceived)} description="Total enregistré" kind="received" />
        <StatCard label="Monnaie rendue" value={money(payments._sum.changeReturned)} description="Total enregistré" kind="change" />
      </div>

            <LocationStats />

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">État global des transports</h2>
        <div className="flex flex-wrap gap-3">
          {statuses.map((item) => (
            <StatusTile
              key={item.status}
              label={statusLabels[item.status] ?? item.status}
              count={item._count._all}
              kind={`status-${item.status}`}
            />
          ))}
        </div>
      </section>
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
    select: {
      locationId: true,
      assignedLocation: { select: { name: true } },
    },
  });

  if (!profile?.locationId) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Aucun lieu affecté</h1>
        <p className="mt-3 text-slate-600">Contacte l&apos;administrateur pour associer ton compte à un lieu.</p>
      </section>
    );
  }

  const locationId = profile.locationId;

  const [
    drivers,
    vehicles,
    transports,
    products,
    payments,
    statuses,
    recentTransports,
    tonnage,
    outstanding,
  ] = await Promise.all([
    prisma.driver.count({ where: { locationId } }),
    prisma.vehicle.count({ where: { locationId } }),
    prisma.transportAssignment.count({ where: { locationId } }),
    prisma.product.aggregate({
      where: { assignment: { is: { locationId } } },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { assignment: { is: { locationId } } },
      _count: { _all: true },
      _sum: { amountDue: true, amountReceived: true, changeReturned: true },
    }),
    prisma.transportAssignment.groupBy({
      by: ["status"],
      where: { locationId },
      _count: { _all: true },
    }),
    prisma.transportAssignment.findMany({
      where: { locationId },
      take: 8,
      orderBy: { assignedAt: "desc" },
      select: {
        id: true,
        assignedAt: true,
        status: true,
        product: { select: { name: true, tonnage: true } },
        vehicle: { select: { licensePlate: true } },
      },
    }),
    // Tonnage cumulé : les transports annulés ne comptent pas.
    prisma.product.aggregate({
      where: { assignment: { is: { locationId, status: { not: "CANCELLED" } } } },
      _sum: { tonnage: true },
    }),
    // Reste à encaisser : transports non annulés et sans paiement.
    prisma.transportAssignment.aggregate({
      where: { locationId, status: { not: "CANCELLED" }, payment: { is: null } },
      _sum: { amountDue: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Espace régisseur</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Statistiques du lieu</h1>
        <p className="mt-2 text-slate-600">
          Bienvenue, {firstName} {lastName}. Lieu partagé : {profile.assignedLocation?.name ?? "Non renseigné"}.
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Les statistiques et les listes comprennent les données partagées par tous les régisseurs affectés à ce lieu.
        </p>
      
        <div className="mt-4"><LogoutButton /></div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Chauffeurs du lieu" value={drivers} description="Tous les chauffeurs affectés à ce lieu" kind="drivers" />
        <StatCard label="Véhicules du lieu" value={vehicles} description="Tous les véhicules de ce lieu" kind="vehicles" />
        <StatCard label="Transports du lieu" value={transports} description="Tous les transports de ce lieu" kind="transports" />
        <StatCard label="Produits" value={products._count._all} description="Produits liés aux transports du lieu" kind="products" />
        <StatCard label="Tonnage cumulé" value={`${Number(tonnage._sum.tonnage ?? 0).toLocaleString("fr-FR")} t`} description="Transports non annulés de ce lieu" kind="tonnage" />
        <StatCard label="Paiements" value={payments._count._all} description="Paiements de tous les transports du lieu" kind="payments" />
        <StatCard label="Reste à encaisser" value={money(outstanding._sum.amountDue)} description="Transports non annulés et non payés du lieu" kind="outstanding" />
        <StatCard label="Montant reçu" value={money(payments._sum.amountReceived)} description="Total enregistré pour le lieu" kind="received" />
        <StatCard label="Monnaie rendue" value={money(payments._sum.changeReturned)} description="Total enregistré pour le lieu" kind="change" />
      </div>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">État des transports du lieu</h2>
        <div className="flex flex-wrap gap-3">
          {statuses.map((item) => (
            <StatusTile
              key={item.status}
              label={statusLabels[item.status] ?? item.status}
              count={item._count._all}
              kind={`status-${item.status}`}
            />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-4 text-xl font-semibold">Modules opérationnels</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ModuleLink href="/dashboard/drivers" title="Chauffeurs" description="Consulter et ajouter les chauffeurs du lieu." />
          <ModuleLink href="/dashboard/vehicles" title="Véhicules" description="Consulter et ajouter les véhicules du lieu." />
          <ModuleLink href="/dashboard/transports" title="Transports" description="Créer et consulter les transports du lieu." />
          <ModuleLink href="/dashboard/payments" title="Paiements" description="Enregistrer et consulter les paiements du lieu." />
        </div>
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Transports récents du lieu</h2>
        {recentTransports.length === 0 ? (
          <p className="text-slate-600">Aucun transport enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-slate-600">
                <tr>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Produit</th>
                  <th className="px-3 py-3">Tonnage</th>
                  <th className="px-3 py-3">Véhicule</th>
                  <th className="px-3 py-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentTransports.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-4">{item.assignedAt.toLocaleDateString("fr-FR")}</td>
                    <td className="px-3 py-4 font-medium">{item.product.name}</td>
                    <td className="px-3 py-4">{String(item.product.tonnage)} t</td>
                    <td className="px-3 py-4">{item.vehicle.licensePlate}</td>
                    <td className="px-3 py-4">{statusLabels[item.status] ?? item.status}</td>
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