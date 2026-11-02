import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatMGA } from "@/lib/audit";
import { fetchAuditRows } from "@/lib/audit-rows";
import { FICHE_PAGE_SIZE, PASSAGE_ROW_SELECT } from "@/lib/passage-rows";
import AuditTable from "../../audit-table";
import PassagesTable from "../../passages-table";
import Pager from "../../pager";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export default function SupervisorSheetPage(props: Props) {
  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <Suspense fallback={<p>Chargement...</p>}>
        <SupervisorSheet {...props} />
      </Suspense>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="mt-2 break-words text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

async function SupervisorSheet({ params, searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const query = await searchParams;
  const requestedPage = Number.parseInt(String(Array.isArray(query.page) ? query.page[0] : query.page ?? "1"), 10);

  const supervisor = await prisma.supervisor.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      nationalId: true,
      address: true,
      assignedLocation: { select: { id: true, name: true } },
      user: { select: { firstName: true, lastName: true, email: true, phoneNumber: true, isActive: true } },
    },
  });

  if (!supervisor) notFound();

  const [total, tonnage, payments] = await Promise.all([
    prisma.passage.count({ where: { supervisorId: id } }),
    prisma.product.aggregate({ where: { passage: { is: { supervisorId: id } } }, _sum: { tonnage: true } }),
    prisma.payment.aggregate({
      where: { passage: { is: { supervisorId: id } } },
      _sum: { amountReceived: true },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / FICHE_PAGE_SIZE));
  const page = Math.min(Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1), pageCount);

  const [passages, activity, accountEvents] = await Promise.all([
    prisma.passage.findMany({
      where: { supervisorId: id },
      orderBy: { assignedAt: "desc" },
      skip: (page - 1) * FICHE_PAGE_SIZE,
      take: FICHE_PAGE_SIZE,
      select: PASSAGE_ROW_SELECT,
    }),
    // Tout ce que ce régisseur a fait dans l'application.
    fetchAuditRows({ where: { userId: supervisor.userId }, take: 20 }),
    // Ce que l'administrateur a fait sur son compte (lieu, désactivation, mot de passe).
    fetchAuditRows({ where: { entityType: "Supervisor", entityId: id }, take: 20 }),
  ]);

  const name = `${supervisor.user.firstName} ${supervisor.user.lastName}`;

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/dashboard/supervisors" className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour aux régisseurs
      </Link>

      <header className="my-6">
        <h1 className="text-3xl font-bold text-slate-900">{name}</h1>
        <p className="mt-2 text-slate-700">
          {supervisor.user.email}
          {supervisor.user.phoneNumber ? ` — ${supervisor.user.phoneNumber}` : ""} — CIN {supervisor.nationalId}
        </p>
        <p className="mt-1 text-slate-700">
          Lieu :{" "}
          {supervisor.assignedLocation ? (
            <Link href={`/dashboard/locations/${supervisor.assignedLocation.id}`} className="font-medium text-blue-700 hover:underline">
              {supervisor.assignedLocation.name}
            </Link>
          ) : (
            "non affecté"
          )}
          {" — "}
          Compte {supervisor.user.isActive ? "actif" : "désactivé"}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Passages enregistrés" value={total} />
        <Stat label="Tonnage cumulé" value={`${Number(tonnage._sum.tonnage ?? 0).toLocaleString("fr-FR")} t`} />
        <Stat label="Montant reçu" value={formatMGA(payments._sum.amountReceived ?? 0)} />
      </div>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-xl font-semibold text-slate-900">Passages enregistrés par {name}</h2>
        {passages.length === 0 ? (
          <p className="text-slate-700">Ce régisseur n&apos;a encore enregistré aucun passage.</p>
        ) : (
          <>
            <PassagesTable rows={passages} showSupervisor={false} />
            <Pager basePath={`/dashboard/supervisors/${id}`} page={page} pageCount={pageCount} />
          </>
        )}
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-xl font-semibold text-slate-900">Activité récente de {name}</h2>
        {activity.rows.length === 0 ? (
          <p className="text-slate-700">Aucune opération enregistrée.</p>
        ) : (
          <AuditTable rows={activity.rows} locationNames={activity.locationNames} showAuthor={false} />
        )}
      </section>

      {accountEvents.rows.length > 0 && (
        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold text-slate-900">Opérations sur ce compte</h2>
          <AuditTable rows={accountEvents.rows} locationNames={accountEvents.locationNames} />
        </section>
      )}
    </div>
  );
}
