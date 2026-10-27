import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import VehicleEditForm from "./vehicle-edit-form";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
      driver: { select: { firstName: true, lastName: true } },
    },
  });

  if (!vehicle) notFound();

  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <section className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm">
        <Link href="/dashboard/vehicles" className="text-sm text-blue-700 hover:underline">
          &larr; Retour aux vehicules
        </Link>
        <h1 className="mb-6 mt-4 text-2xl font-bold text-slate-900">Modifier le vehicule</h1>
        <VehicleEditForm vehicle={vehicle} />
      </section>
    </main>
  );
}