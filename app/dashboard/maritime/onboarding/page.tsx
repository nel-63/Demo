import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MaritimeOnboardingForm from "../onboarding-form";

export default function MaritimeOnboardingPage() {
  return (
    <Suspense fallback={<p className="text-slate-600">Chargement...</p>}>
      <Onboarding />
    </Suspense>
  );
}

async function Onboarding() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "USER_MAR") redirect("/dashboard");

  const profile = await prisma.maritimeUser.findUnique({
    where: { userId: user.id },
    select: { companyName: true, onboardingComplete: true },
  });
  if (!profile) redirect("/dashboard");
  if (profile.onboardingComplete) redirect("/dashboard/maritime");

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Première connexion</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Informations du bateau</h1>
        <p className="mt-2 text-slate-600">Complétez votre profil avant d&apos;enregistrer des produits.</p>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <MaritimeOnboardingForm companyName={profile.companyName} />
      </section>
    </div>
  );
}
