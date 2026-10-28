import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import LocationStats from "./location-stats";
import LogoutButton from "./logout-button";

const statusLabels: Record<string, string> = {
  PLANNED: "Planifie",
  IN_PROGRESS: "En cours",
  COMPLETED: "Termine",
  CANCELLED: "Annule",
};

function money(value: unknown) {
  return `${Number(value ?? 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MGA`;
}

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string | number;
  description: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 break-words text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{description}</p>
    </section>
  );
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
      <h1 className="text-2xl font-bold">Acces non autorise</h1>
      <p className="mt-3 text-slate-600">Contacte l&apos;administrateur pour obtenir les droits necessaires.</p>
    </section>
  );
}

async function AdminDashboard({ firstName, lastName }: { firstName: string; lastName: string }) {
  const [
    supervisors,
    drivers,
    vehicles,
    transports,
    products,
    payments,
    statuses,
  ] = await Promise.all([
    prisma.supervisor.count(),
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
          Enregistrer un regisseur</Link>
        <Link href="/dashboard/locations" className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-100">
          Gerer les lieux
        </Link>
      
        <LogoutButton />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Regisseurs" value={supervisors} description="Dans toute l'entreprise" />
        <StatCard label="Chauffeurs" value={drivers} description="Tous les lieux" />
        <StatCard label="Vehicules" value={vehicles} description="Tous les lieux" />
        <StatCard label="Transports" value={transports} description="Tous les transports enregistres" />
        <StatCard label="Produits" value={products} description="Fiches produits enregistrees" />
        <StatCard label="Paiements" value={payments._count._all} description="Operations de paiement enregistrees" />
        <StatCard label="Montant a regler" value={money(payments._sum.amountDue)} description="Total enregistre" />
        <StatCard label="Montant recu" value={money(payments._sum.amountReceived)} description="Total enregistre" />
        <StatCard label="Monnaie rendue" value={money(payments._sum.changeReturned)} description="Total enregistre" />
      </div>

            <LocationStats />

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Etat global des transports</h2>
        <div className="flex flex-wrap gap-3">
          {statuses.map((item) => (
            <div key={item.status} className="rounded-lg bg-slate-100 px-4 py-3">
              <p className="text-sm text-slate-600">{statusLabels[item.status] ?? item.status}</p>
              <p className="mt-1 text-xl font-bold">{item._count._all}</p>
            </div>
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
        <h1 className="text-2xl font-bold">Aucun lieu affecte</h1>
        <p className="mt-3 text-slate-600">Contacte l&apos;administrateur pour associer ton compte a un lieu.</p>
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
  ] = await Promise.all([
    prisma.driver.count({ where: { locationId } }),
    prisma.vehicle.count({ where: { locationId } }),
    prisma.transportAssignment.count({ where: { locationId } }),
    prisma.product.aggregate({
      where: { assignment: { is: { locationId } } },
      _count: { _all: true },
      _sum: { tonnage: true },
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
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Espace regisseur</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Statistiques du lieu</h1>
        <p className="mt-2 text-slate-600">
          Bienvenue, {firstName} {lastName}. Lieu partage : {profile.assignedLocation?.name ?? "Non renseigne"}.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Les statistiques et les listes comprennent les donnees partagees par tous les regisseurs affectes a ce lieu.
        </p>
      
        <div className="mt-4"><LogoutButton /></div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Chauffeurs du lieu" value={drivers} description="Tous les chauffeurs affectes a ce lieu" />
        <StatCard label="Vehicules du lieu" value={vehicles} description="Tous les vehicules de ce lieu" />
        <StatCard label="Transports du lieu" value={transports} description="Tous les transports de ce lieu" />
        <StatCard label="Produits" value={products._count._all} description="Produits lies aux transports du lieu" />
        <StatCard label="Tonnage cumule" value={`${Number(products._sum.tonnage ?? 0).toLocaleString("fr-FR")} t`} description="Pour les transports de ce lieu" />
        <StatCard label="Paiements" value={payments._count._all} description="Paiements de tous les transports du lieu" />
        <StatCard label="Montant a regler" value={money(payments._sum.amountDue)} description="Total enregistre pour le lieu" />
        <StatCard label="Montant recu" value={money(payments._sum.amountReceived)} description="Total enregistre pour le lieu" />
        <StatCard label="Monnaie rendue" value={money(payments._sum.changeReturned)} description="Total enregistre pour le lieu" />
      </div>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Etat des transports du lieu</h2>
        <div className="flex flex-wrap gap-3">
          {statuses.map((item) => (
            <div key={item.status} className="rounded-lg bg-slate-100 px-4 py-3">
              <p className="text-sm text-slate-600">{statusLabels[item.status] ?? item.status}</p>
              <p className="mt-1 text-xl font-bold">{item._count._all}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-4 text-xl font-semibold">Modules operationnels</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ModuleLink href="/dashboard/drivers" title="Chauffeurs" description="Consulter et ajouter les chauffeurs du lieu." />
          <ModuleLink href="/dashboard/vehicles" title="Vehicules" description="Consulter et ajouter les vehicules du lieu." />
          <ModuleLink href="/dashboard/transports" title="Transports" description="Creer et consulter les transports du lieu." />
          <ModuleLink href="/dashboard/payments" title="Paiements" description="Enregistrer et consulter les paiements du lieu." />
        </div>
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Transports recents du lieu</h2>
        {recentTransports.length === 0 ? (
          <p className="text-slate-500">Aucun transport enregistre.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-slate-500">
                <tr>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Produit</th>
                  <th className="px-3 py-3">Tonnage</th>
                  <th className="px-3 py-3">Vehicule</th>
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