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
    select: { id: true },
  });
  if (!profile) redirect("/dashboard/maritime");

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/maritime" className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour aux déclarations
      </Link>
      <header className="my-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Nouvelle déclaration maritime</h1>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <DeclarationForm />
      </section>
    </div>
  );
}
