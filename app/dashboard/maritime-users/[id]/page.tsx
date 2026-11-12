import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import AccountActions from "../../account-actions";
import MaritimeUserEditForm from "../maritime-user-edit-form";

export default function MaritimeUserPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-slate-600">Chargement...</p>}>
      <MaritimeUserContent params={params} />
    </Suspense>
  );
}

async function MaritimeUserContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const maritimeUser = await prisma.maritimeUser.findUnique({
    where: { id },
    select: {
      id: true,
      companyName: true,
      loginId: true,
      _count: { select: { declarations: true } },
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          isActive: true,
        },
      },
    },
  });
  if (!maritimeUser) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/maritime-users" className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour aux utilisateurs maritimes
      </Link>
      <header className="my-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
          {maritimeUser.companyName}
        </h1>
        <p className="mt-2 text-slate-600">{maritimeUser.user.email ?? maritimeUser.loginId} · {maritimeUser._count.declarations} déclaration(s)</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-xl font-semibold">Modifier les informations</h2>
        <MaritimeUserEditForm
          maritimeUserId={maritimeUser.id}
          initialValues={{
            companyName: maritimeUser.companyName,
            loginId: maritimeUser.loginId,
          }}
        />
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-xl font-semibold">Compte</h2>
        <AccountActions
          endpoint={`/api/maritime-users/${maritimeUser.id}`}
          name={maritimeUser.companyName}
          isActive={maritimeUser.user.isActive}
          deletion={{
            redirectTo: "/dashboard/maritime-users",
            blocked: maritimeUser._count.declarations > 0,
            blockedMessage: "Ce compte a des déclarations : il ne peut pas être supprimé. Désactivez-le à la place.",
          }}
        />
      </section>
    </div>
  );
}
