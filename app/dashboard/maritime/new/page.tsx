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
    select: { id: true, companyName: true, latitude: true, longitude: true, contactPhone: true, user: { select: { email: true, phoneNumber: true } } },
  });
  if (!profile) return <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8"><h1 className="text-2xl font-bold">Profil de société introuvable</h1><p className="mt-3 text-slate-700">Contactez l'administrateur pour vérifier votre compte société.</p></section>;
  return <div className="mx-auto max-w-4xl">
    <header className="mb-6"><h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Nouveau passage maritime</h1><p className="mt-2 text-slate-600">Renseignez toutes les informations du bateau et de son chargement, puis validez le formulaire.</p></header>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <DeclarationForm initial={{
        companyName: profile.companyName, contactEmail: profile.user.email ?? "",
        contactPhone: profile.user.phoneNumber ?? profile.contactPhone ?? "", boatName: "",
        boatRegistration: "", boatCapacity: "", captainName: "", captainPhone: "", captainEmail: "",
        originDepartureDate: "", arrivalDate: "", departureDate: "",
        latitude: profile.latitude?.toString() ?? "", longitude: profile.longitude?.toString() ?? "", products: [],
      }} />
    </section>
  </div>;
}
