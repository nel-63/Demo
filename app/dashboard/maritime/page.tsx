import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default function MaritimePassageEntryPage() {
  return (
    <Suspense fallback={<p className="text-slate-600">Chargement de votre passage...</p>}>
      <MaritimePassageEntry />
    </Suspense>
  );
}

// L'utilisateur maritime n'a qu'un seul passage ouvert : pas de liste, de statistiques ni d'historique.
async function MaritimePassageEntry() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "USER_MAR") redirect("/dashboard");

  const profile = await prisma.maritimeUser.findUnique({
    where: { userId: user.id },
    select: { id: true, onboardingComplete: true },
  });
  if (!profile) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Profil maritime indisponible</h1>
        <p className="mt-3 text-slate-700">Contactez l&apos;administrateur pour associer un profil maritime à votre compte.</p>
      </section>
    );
  }
  if (!profile.onboardingComplete) redirect("/dashboard/maritime/onboarding");

  const openPassage = await prisma.maritimeDeclaration.findFirst({
    where: { maritimeUserId: profile.id, departureDate: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  redirect(openPassage ? `/dashboard/maritime/${openPassage.id}` : "/dashboard/maritime/new");
}
