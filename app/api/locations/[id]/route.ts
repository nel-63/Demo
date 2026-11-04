import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

async function getAdmin(): Promise<NextResponse | NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ message: "Accès réservé à l'administrateur." }, { status: 403 });
  }
  return user;
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await getAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await context.params;
    const result = await prisma.$transaction(async (tx) => {
      const location = await tx.location.findUnique({
        where: { id },
        select: { id: true, name: true, deletedAt: true },
      });
      if (!location) return "NOT_FOUND" as const;
      if (location.deletedAt) return "ALREADY_DELETED" as const;

      const deletedAt = new Date();
      await tx.location.update({
        where: { id },
        data: { deletedAt, deletedById: auth.id },
      });
      await tx.auditLog.create({
        data: {
          userId: auth.id,
          action: "DELETE",
          entityType: "Location",
          entityId: id,
          details: { name: location.name, deletedAt: deletedAt.toISOString(), historyPreserved: true },
        },
      });
      return "DELETED" as const;
    });

    if (result === "NOT_FOUND") {
      return NextResponse.json({ message: "Lieu introuvable." }, { status: 404 });
    }
    if (result === "ALREADY_DELETED") {
      return NextResponse.json({ message: "Ce lieu est déjà dans la corbeille." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, message: "Lieu placé dans la corbeille. Toutes ses données sont conservées." });
  } catch (error) {
    console.error("Location soft deletion failed:", error);
    return NextResponse.json({ message: "Impossible de supprimer le lieu." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: Context) {
  const auth = await getAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || (body as Record<string, unknown>).action !== "RESTORE") {
      return NextResponse.json({ message: "Action invalide." }, { status: 400 });
    }

    const { id } = await context.params;
    const result = await prisma.$transaction(async (tx) => {
      const location = await tx.location.findUnique({
        where: { id },
        select: { id: true, name: true, deletedAt: true },
      });
      if (!location) return "NOT_FOUND" as const;
      if (!location.deletedAt) return "NOT_DELETED" as const;

      await tx.location.update({
        where: { id },
        data: { deletedAt: null, deletedById: null },
      });
      await tx.auditLog.create({
        data: {
          userId: auth.id,
          action: "RESTORE",
          entityType: "Location",
          entityId: id,
          details: { name: location.name, historyPreserved: true },
        },
      });
      return "RESTORED" as const;
    });

    if (result === "NOT_FOUND") {
      return NextResponse.json({ message: "Lieu introuvable." }, { status: 404 });
    }
    if (result === "NOT_DELETED") {
      return NextResponse.json({ message: "Ce lieu est déjà actif." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, message: "Lieu réactivé." });
  } catch (error) {
    console.error("Location restoration failed:", error);
    return NextResponse.json({ message: "Impossible de réactiver le lieu." }, { status: 500 });
  }
}
