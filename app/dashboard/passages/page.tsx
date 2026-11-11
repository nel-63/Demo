import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ALL_PAYMENT_METHOD_LABELS, formatMGA } from "@/lib/audit";
import ListFilters from "../list-filters";
import Pager from "../pager";
import { readChoice, readParam, type SearchParams } from "../search-params";
import PassageForm from "./passage-form";
import PassageActions from "./passage-actions";
import AttachmentViewer from "./attachment-viewer";
import { addAttachmentFlags } from "@/lib/passage-rows";
import { PASSAGES_PAGE_SIZE, resolvePage } from "@/lib/pagination";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short", timeZone: "Indian/Antananarivo",
});
const longDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric", month: "long", year: "numeric", timeZone: "Indian/Antananarivo",
});

// Couleur associée à chaque mode de paiement : repère visuel immédiat dans la liste.
const METHOD_STYLE: Record<string, { badge: string; accent: string }> = {
  CASH: { badge: "bg-emerald-50 text-emerald-800 ring-emerald-200", accent: "border-l-emerald-500" },
  MOBILE_MONEY: { badge: "bg-violet-50 text-violet-800 ring-violet-200", accent: "border-l-violet-500" },
};
const LEGACY_STYLE = { badge: "bg-slate-100 text-slate-700 ring-slate-200", accent: "border-l-slate-400" };

// Bloc d'informations : seuls les champs renseignés sont affichés.
function InfoGroup({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  const filled = rows.filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== false);
  return (
    <section>
      <h4 className="mb-2 border-b border-slate-200 pb-1.5 text-sm font-semibold text-slate-900">{title}</h4>
      {filled.length === 0 ? (
        <p className="text-sm text-slate-500">Non renseigné</p>
      ) : (
        <dl className="space-y-1.5">
          {filled.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[7.5rem_1fr] gap-2 text-sm">
              <dt className="text-slate-600">{label}</dt>
              <dd className="min-w-0 break-words font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export default function PassagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <Suspense fallback={<p>Chargement...</p>}><PassagesContent searchParams={searchParams} /></Suspense>;
}

async function PassagesContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = user.role === "ADMIN";
  const isSupervisor = user.role === "SUPERVISOR";
  if (!isAdmin && user.role !== "SUPERVISOR") redirect("/dashboard");

  let locationId: string | null = null;
  let locationName: string | null = null;
  let locationArchived = false;
  if (!isAdmin) {
    const profile = await prisma.supervisor.findUnique({
      where: { userId: user.id },
      select: { locationId: true, assignedLocation: { select: { name: true, deletedAt: true } } },
    });
    if (!profile?.locationId) {
      return <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold">Aucun lieu affecté</h1><p className="mt-3 text-slate-700">Contactez l&apos;administrateur pour associer votre compte à un lieu.</p></section>;
    }
    locationId = profile.locationId;
    locationName = profile.assignedLocation?.deletedAt ? null : profile.assignedLocation?.name ?? null;
    locationArchived = Boolean(profile.assignedLocation?.deletedAt);
  }

  const params = await searchParams;
  const q = readParam(params, "q");
  const method = readChoice(params, "mode", Object.keys(ALL_PAYMENT_METHOD_LABELS));
  const deleted = isAdmin && readParam(params, "deleted", 1) === "1";
  const paginationParams = new URLSearchParams();
  if (q) paginationParams.set("q", q);
  if (method) paginationParams.set("mode", method);
  if (deleted) paginationParams.set("deleted", "1");
  const paginationQuery = paginationParams.toString();
  const paginationBasePath = paginationQuery
    ? `/dashboard/passages?${paginationQuery}`
    : "/dashboard/passages";
  const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
  const has = (word: string) => ({ contains: word, mode: "insensitive" as const });

  const where = {
    assignedLocation: { is: { deletedAt: null } },
    deletedAt: deleted ? { not: null } : null,
    ...(locationId ? { locationId } : {}),
    ...(method ? { payment: { is: { paymentMethod: method as "CASH" } } } : {}),
    ...(words.length ? {
      AND: words.map((word) => ({
        OR: [
          { product: { name: has(word) } }, { product: { type: has(word) } },
          { origin: has(word) }, { destination: has(word) },
          { vehicleRegistration: has(word) },
          { vehicleCharacteristics: has(word) }, { driverName: has(word) },
          { driverLicenseNumber: has(word) },
          { supervisor: { user: { lastName: has(word) } } },
          { supervisor: { user: { firstName: has(word) } } },
        ],
      })),
    } : {}),
  };

  const total = await prisma.passage.count({ where });
  const { page, totalPages } = resolvePage(params.page, total);
  const passageRows = await prisma.passage.findMany({
    where,
    skip: (page - 1) * PASSAGES_PAGE_SIZE,
    take: PASSAGES_PAGE_SIZE,
    orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
    select: {
      id: true, assignedAt: true, origin: true, destination: true,
      vehicleRegistration: true, vehicleCharacteristics: true,
      driverName: true, driverLicenseNumber: true, deletedAt: true,
      nomOp: true, nomSoc: true, coli: true, nbColi: true, nQuittance: true, dateQuittance: true,
      product: { select: { name: true, type: true, tonnage: true } },
      supervisor: { select: { user: { select: { firstName: true, lastName: true } } } },
      payment: { select: { paymentMethod: true, reference: true, amountDue: true } },
    },
  });
  const passages = await addAttachmentFlags(passageRows);

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
            {locationArchived ? (
              <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
                Votre ancien lieu a été supprimé. Contactez l&apos;administrateur pour être affecté à un lieu actif.
              </p>
            ) : (
              <PassageForm />
            )}
          </section>
        )}
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-6">
          <h2 className="mb-5 text-xl font-semibold text-slate-900">
            {deleted ? "Enregistrements conservés" : "Historique des passages"}{" "}
            <span className="ml-1 rounded-full bg-white px-2.5 py-0.5 align-middle text-sm font-semibold text-slate-700 ring-1 ring-slate-200">{total}</span>
          </h2>
          <ListFilters action="/dashboard/passages" q={q} placeholder="Produit, trajet, immatriculation, chauffeur…" filters={[
            { name: "mode", label: "Mode de paiement", value: method, options: Object.entries(ALL_PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label })) },
            ...(deleted ? [{ name: "deleted", label: "Affichage", value: "1", options: [{ value: "1", label: "Supprimés" }] }] : []),
          ]} />
          <Pager
            basePath={paginationBasePath}
            page={page}
            pageCount={totalPages}
            total={total}
            ariaLabel="Pagination des passages"
            previousLabel="Page précédente"
            nextLabel="Page suivante"
          />
          {passages.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-700">{filtered ? "Aucun passage ne correspond à ces critères. Modifiez la recherche ou retirez un filtre." : "Aucun passage enregistré."}</p>
          ) : (
            <ul role="list" className="space-y-4">
              {passages.map((item) => {
                const style = item.payment ? (METHOD_STYLE[item.payment.paymentMethod] ?? LEGACY_STYLE) : LEGACY_STYLE;
                const methodLabel = item.payment ? (ALL_PAYMENT_METHOD_LABELS[item.payment.paymentMethod] ?? item.payment.paymentMethod) : null;
                const vehicle = item.vehicleCharacteristics;
                const canAct = (isAdmin || isSupervisor) && !deleted && Boolean(item.payment);
                return (
                  <li key={item.id}>
                    <article className={`overflow-hidden rounded-xl border border-l-4 bg-white shadow-sm ${deleted ? "border-slate-200 border-l-red-400" : `border-slate-200 ${style.accent}`}`}>
                      {/* En-tête : produit, tonnage et montant */}
                      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-600">
                            <time dateTime={item.assignedAt.toISOString()}>{longDateFormatter.format(item.assignedAt)}</time>
                          </p>
                          <h3 className="mt-0.5 break-words text-lg font-semibold text-slate-900">{item.product.name}</h3>
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                            <span>{item.product.type}</span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                              {Number(item.product.tonnage).toLocaleString("fr-FR")} t
                            </span>
                          </p>
                        </div>
                        <div className="text-right">
                          {item.payment ? (
                            <>
                              <p className="text-xl font-bold tabular-nums text-slate-900">{formatMGA(item.payment.amountDue)}</p>
                              <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${style.badge}`}>{methodLabel}</span>
                              {item.payment.reference && <p className="mt-1 break-all text-xs text-slate-600">Réf. {item.payment.reference}</p>}
                            </>
                          ) : (
                            <p className="text-sm text-slate-500">Aucun paiement</p>
                          )}
                        </div>
                      </div>

                      {/* Trajet */}
                      <div className="mx-5 mt-4 flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">
                        <span className="min-w-0 break-words">{item.origin}</span>
                        <span aria-hidden="true" className="flex min-w-8 flex-1 items-center">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-blue-700 bg-white" />
                          <span className="h-px flex-1 bg-blue-300" />
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-700" />
                        </span>
                        <span className="sr-only">vers</span>
                        <span className="min-w-0 break-words text-right">{item.destination}</span>
                      </div>

                      {/* Détails regroupés */}
                      <div className="grid gap-x-8 gap-y-5 px-5 py-5 md:grid-cols-3">
                        <InfoGroup title="Véhicule et chauffeur" rows={[
                          ["Immatriculation", item.vehicleRegistration],
                          ["Véhicule", vehicle],
                          ["Chauffeur", item.driverName],
                          ["Permis", item.driverLicenseNumber],
                        ]} />
                        <InfoGroup title="Transport" rows={[
                          ["Opérateur", item.nomOp],
                          ["Société", item.nomSoc],
                          ["Colisage", item.coli],
                          ["Nombre de colis", item.nbColi !== null && item.nbColi !== undefined ? String(item.nbColi) : null],
                          ["N° quittance", item.nQuittance],
                          ["Date de quittance", item.dateQuittance ? dateFormatter.format(item.dateQuittance) : null],
                        ]} />
                        <InfoGroup title="Paiement" rows={[
                          ["Montant payé", item.payment ? formatMGA(item.payment.amountDue) : null],
                        ]} />
                      </div>

                      {/* Pied de fiche : pièces jointes, régisseur, suppression */}
                      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-sm font-medium text-slate-700">Pièces jointes</span>
                          <AttachmentViewer passageId={item.id} hasPjt={item.hasPjt} hasQuittance={item.hasQuittance} />
                        </div>
                        <p className="text-sm text-slate-700">
                          Enregistré par <span className="font-semibold text-slate-900">{item.supervisor.user.firstName} {item.supervisor.user.lastName}</span>
                        </p>
                        {isAdmin && deleted && (
                          <p className="w-full text-sm font-semibold text-red-700">Supprimé le {item.deletedAt ? dateFormatter.format(item.deletedAt) : "—"}</p>
                        )}
                      </div>

                      {/* Actions : modification, suppression et historique */}
                      {canAct && item.payment && (
                        <div className="border-t border-slate-100 px-5 py-4">
                          <div className="max-w-xl">
                            <PassageActions canManage={isSupervisor} initial={{
                              id: item.id, assignedAt: item.assignedAt.toISOString().slice(0, 10), origin: item.origin, destination: item.destination,
                              vehicleRegistration: item.vehicleRegistration,
                              vehicleCharacteristics: item.vehicleCharacteristics, driverName: item.driverName,
                              driverLicenseNumber: item.driverLicenseNumber,
                              nomOp: item.nomOp, nomSoc: item.nomSoc, coli: item.coli, nbColi: item.nbColi, nQuittance: item.nQuittance,
                              dateQuittance: item.dateQuittance?.toISOString().slice(0, 10) ?? null,
                              product: { name: item.product.name, type: item.product.type, tonnage: String(item.product.tonnage) },
                              payment: { paymentMethod: item.payment.paymentMethod as keyof typeof ALL_PAYMENT_METHOD_LABELS, reference: item.payment.reference, amountDue: String(item.payment.amountDue) },
                            }}/>
                          </div>
                        </div>
                      )}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
          <Pager
            basePath={paginationBasePath}
            page={page}
            pageCount={totalPages}
            total={total}
            ariaLabel="Pagination des passages"
            previousLabel="Page précédente"
            nextLabel="Page suivante"
          />
        </section>
      </div>
    </div>
  );
}