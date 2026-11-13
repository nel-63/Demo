import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DeclarationForm from "../declaration-form";

export default function NewMaritimeDeclarationPage() {
  return <Suspense fallback={<p className="text-slate-600">Chargement...</p>}><NewMaritimeDeclaration /></Suspense>;
}

async function NewMaritimeDeclaration() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "USER_MAR") redirect("/dashboard");
  const profile = await prisma.maritimeUser.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      companyName: true,
      latitude: true,
      longitude: true,
      contactPhone: true,
      onboardingComplete: true,
      user: { select: { email: true } },
      declarations: {
        where: { departureDate: null },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!profile) redirect("/dashboard/maritime");
  if (!profile.onboardingComplete) redirect("/dashboard/maritime/onboarding");
  if (profile.declarations[0]) {
    redirect(`/dashboard/maritime/${profile.declarations[0].id}/edit`);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Nouveau passage maritime</h1>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <DeclarationForm initial={{
          companyName: profile.companyName,
          contactEmail: profile.user.email ?? "",
          contactPhone: profile.contactPhone ?? "",
          boatName: "",
          boatRegistration: "",
          boatCapacity: "",
          captainName: "",
          captainPhone: "",
          captainEmail: "",
          originDepartureDate: "",
          arrivalDate: "",
          departureDate: "",
          latitude: profile.latitude?.toString() ?? "",
          longitude: profile.longitude?.toString() ?? "",
          products: [],
        }} />
      </section>
    </div>
  );
}
