import { Suspense } from "react";
import Link from "next/link";
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
    select: { id: true, companyName: true },
  });
  if (!profile) redirect("/dashboard/maritime");

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/maritime" className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour aux déclarations
      </Link>
      <header className="my-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Nouveau passage maritime</h1>
      </header>
      <nav aria-label="Navigation des passages" className="mb-6 flex gap-2 border-b border-slate-200">
        <Link href="/dashboard/maritime" className="px-4 py-3 text-sm font-medium text-slate-600 hover:text-blue-700">Mes passages</Link>
        <Link href="/dashboard/maritime/new" aria-current="page" className="border-b-2 border-blue-700 px-4 py-3 text-sm font-semibold text-blue-700">Nouveau passage</Link>
      </nav>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <DeclarationForm initial={{ companyName: profile.companyName, boatName: "", boatRegistration: "", boatCapacity: "", captainName: "", captainPhone: "", captainEmail: "", originDepartureDate: "", arrivalDate: "", departureDate: "", products: [] }} />
      </section>
    </div>
  );
}
