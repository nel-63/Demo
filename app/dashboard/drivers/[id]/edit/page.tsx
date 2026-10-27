import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import DriverEditForm from "./driver-edit-form";

export default async function EditDriverPage({
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

  const driver = await prisma.driver.findFirst({
    where: { id, locationId: profile.locationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nationalId: true,
      phoneNumber: true,
      licenseNumber: true,
    },
  });

  if (!driver) notFound();

  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <section className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm">
        <Link href="/dashboard/drivers" className="text-sm text-blue-700 hover:underline">
          &larr; Retour aux chauffeurs
        </Link>
        <h1 className="mb-6 mt-4 text-2xl font-bold text-slate-900">Modifier le chauffeur</h1>
        <DriverEditForm driver={driver} />
      </section>
    </main>
  );
}