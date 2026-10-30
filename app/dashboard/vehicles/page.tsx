import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import VehicleForm from "./vehicle-form";
import StatusToggleButton from "../status-toggle-button";
import ListFilters from "../list-filters";
import { readChoice, readParam, searchWords, type SearchParams } from "../search-params";

export default function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <Suspense fallback={<p>Chargement...</p>}>
        <VehiclesContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function VehiclesContent({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "SUPERVISOR") redirect("/dashboard");

  const profile = await prisma.supervisor.findUnique({
    where: { userId: user.id },
    select: { locationId: true, assignedLocation: { select: { name: true } } },
  });

  if (!profile?.locationId) redirect("/dashboard");

  const params = await searchParams;
  const q = readParam(params, "q");
  const status = readChoice(params, "statut", ["actif", "inactif"] as const);
  const filtered = q !== "" || status !== "";

  const [vehicles, drivers] = await Promise.all([
    prisma.vehicle.findMany({
      where: {
        locationId: profile.locationId,
        ...(status ? { isActive: status === "actif" } : {}),
        AND: searchWords(q).map((word) => ({
          OR: [
            { licensePlate: { contains: word, mode: "insensitive" as const } },
            { vehicleType: { contains: word, mode: "insensitive" as const } },
            { driver: { firstName: { contains: word, mode: "insensitive" as const } } },
            { driver: { lastName: { contains: word, mode: "insensitive" as const } } },
            { driver: { phoneNumber: { contains: word, mode: "insensitive" as const } } },
          ],
        })),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        vehicleType: true,
        licensePlate: true,
        isActive: true,
        driver: { select: { firstName: true, lastName: true, phoneNumber: true } },
      },
    }),
    prisma.driver.findMany({
      where: { locationId: profile.locationId, isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/dashboard" className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour au tableau de bord
      </Link>
      <header className="my-6">
        <h1 className="text-3xl font-bold text-slate-900">Véhicules du lieu</h1>
        <p className="mt-2 text-slate-600">
          Lieu partagé : {profile.assignedLocation?.name ?? "Non renseigné"}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[380px_1fr]">
        <section className="h-fit rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">Ajouter un véhicule</h2>
          <VehicleForm drivers={drivers} />
        </section>
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">Véhicules du lieu ({vehicles.length})</h2>
          <ListFilters
            action="/dashboard/vehicles"
            q={q}
            placeholder="Immatriculation, type ou chauffeur"
            filters={[
              {
                name: "statut",
                label: "Statut",
                value: status,
                options: [
            { value: "actif", label: "Actif" },
            { value: "inactif", label: "Inactif" },
          ],
              },
            ]}
          />
          {vehicles.length === 0 ? (
            <p className="text-slate-600">
              {filtered ? "Aucun véhicule ne correspond à ces critères." : "Aucun véhicule enregistré pour ce lieu."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-slate-600">
                  <tr>
                    <th className="px-3 py-3">Immatriculation</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Chauffeur</th>
                    <th className="px-3 py-3">Téléphone</th>
                    <th className="px-3 py-3">Statut</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {vehicles.map((vehicle) => (
                    <tr key={vehicle.id}>
                      <td className="px-3 py-4 font-semibold">{vehicle.licensePlate}</td>
                      <td className="px-3 py-4">{vehicle.vehicleType}</td>
                      <td className="px-3 py-4">{vehicle.driver.firstName} {vehicle.driver.lastName}</td>
                      <td className="px-3 py-4">{vehicle.driver.phoneNumber || "—"}</td>
                      <td className="px-3 py-4">
                        <span className={vehicle.isActive
                          ? "rounded-full bg-green-50 px-2 py-1 text-green-700"
                          : "rounded-full bg-slate-100 px-2 py-1 text-slate-600"}>
                          {vehicle.isActive ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <Link href={`/dashboard/vehicles/${vehicle.id}/edit`} className="mb-2 inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Modifier</Link>
                        <StatusToggleButton
                          endpoint={`/api/vehicles/${vehicle.id}`}
                          isActive={vehicle.isActive}
                          itemLabel={vehicle.licensePlate}
                        />
                      </td>
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