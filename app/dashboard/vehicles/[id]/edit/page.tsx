import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import VehicleEditForm from "./vehicle-edit-form";

type PageProps = { params: Promise<{ id: string }> };

export default function EditVehiclePage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 p-6 md:p-10">
          <p className="text-slate-600">Chargement...</p>
        </main>
      }
    >
      <EditVehicleContent params={params} />
    </Suspense>
  );
}

async function EditVehicleContent({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "SUPERVISOR") redirect("/dashboard");

  const { id } = await params;
  const profile = await prisma.supervisor.findUnique({
    where: { userId: user.id },
    select: { locationId: true },
  });

  if (!profile?.locationId) redirect("/dashboard");

  const vehicle = await prisma.vehicle.findFirst({
    where: { id, locationId: profile.locationId },
    select: {
      id: true,
      vehicleType: true,
      licensePlate: true,
      driverId: true,
      driver: { select: { firstName: true, lastName: true, isActive: true } },
    },
  });

  if (!vehicle) notFound();

  const activeDrivers = await prisma.driver.findMany({
    where: { locationId: profile.locationId, isActive: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });

  // Le chauffeur actuel reste dans la liste même s'il a été désactivé depuis.
  const drivers = activeDrivers.some((driver) => driver.id === vehicle.driverId)
    ? activeDrivers
    : [
        {
          id: vehicle.driverId,
          firstName: vehicle.driver.firstName,
          lastName: `${vehicle.driver.lastName} (inactif)`,
        },
        ...activeDrivers,
      ];

  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <section className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm">
        <Link href="/dashboard/vehicles" className="text-sm text-blue-700 hover:underline">
          &larr; Retour aux véhicules
        </Link>
        <h1 className="mb-6 mt-4 text-2xl font-bold text-slate-900">Modifier le véhicule</h1>
        <VehicleEditForm
          vehicle={{
            id: vehicle.id,
            vehicleType: vehicle.vehicleType,
            licensePlate: vehicle.licensePlate,
            driverId: vehicle.driverId,
          }}
          drivers={drivers}
        />
      </section>
    </main>
  );
}