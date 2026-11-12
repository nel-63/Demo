import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DeclarationForm from "../../declaration-form";

type Props = { params: Promise<{ id: string }> };

export default function EditMaritimeDeclarationPage({ params }: Props) {
  return <Suspense fallback={<p className="text-slate-600">Chargement...</p>}><EditMaritimeDeclaration params={params} /></Suspense>;
}

async function EditMaritimeDeclaration({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "USER_MAR") redirect("/dashboard");

  const profile = await prisma.maritimeUser.findUnique({
    where: { userId: user.id },
    select: { id: true, latitude: true, longitude: true },
  });
  if (!profile) notFound();

  const { id } = await params;
  const declaration = await prisma.maritimeDeclaration.findFirst({
    where: { id, maritimeUserId: profile.id },
    include: { products: { orderBy: { createdAt: "asc" } } },
  });
  if (!declaration) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/dashboard/maritime/${id}`} className="text-sm font-medium text-blue-700 hover:underline">
        &larr; Retour à la déclaration
      </Link>
      <header className="my-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Modifier la déclaration</h1>
        <p className="mt-2 text-slate-600">{declaration.companyName} · {declaration.boatName}</p>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <DeclarationForm
          declarationId={id}
          initial={{
            companyName: declaration.companyName,
            boatName: declaration.boatName,
            boatRegistration: declaration.boatRegistration,
            boatCapacity: declaration.boatCapacity.toString(),
            captainName: declaration.captainName,
            captainPhone: declaration.captainPhone ?? "",
            captainEmail: declaration.captainEmail ?? "",
            originDepartureDate: declaration.originDepartureDate.toISOString().slice(0, 10),
            arrivalDate: declaration.arrivalDate.toISOString().slice(0, 10),
            departureDate: declaration.departureDate?.toISOString().slice(0, 10) ?? "",
            latitude: profile.latitude?.toString() ?? "",
            longitude: profile.longitude?.toString() ?? "",
            products: declaration.products.map((product) => ({
              id: product.id,
              productType: product.productType,
              quantity: product.quantity.toString(),
              unitPrice: product.unitPrice.toString(),
            })),
          }}
        />
      </section>
    </div>
  );
}
