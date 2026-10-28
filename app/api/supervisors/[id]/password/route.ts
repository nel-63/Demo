import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { validatePassword } from "@/lib/password-policy";

// Réinitialisation du mot de passe d'un régisseur par l'administrateur.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getCurrentUser();

  if (!admin) {
    return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  }

  if (admin.role !== "ADMIN") {
    return NextResponse.json(
      { message: "Seul un administrateur peut réinitialiser un mot de passe." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    const data = body && typeof body === "object"
      ? body as Record<string, unknown>
      : {};

    const passwordError = validatePassword(data.password);
    if (passwordError) {
      return NextResponse.json({ message: passwordError }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(data.password as string, 12);

    const result = await prisma.$transaction(async (tx) => {
      const supervisor = await tx.supervisor.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          user: { select: { email: true } },
        },
      });

      if (!supervisor) return null;

      // sessionVersion + 1 : toutes les sessions ouvertes avec l'ancien mot de passe sont fermées.
      await tx.user.update({
        where: { id: supervisor.userId },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });

      // Lève un éventuel blocage dû à des tentatives de connexion échouées.
      await tx.loginFailure.deleteMany({
        where: { email: supervisor.user.email },
      });

      // Le mot de passe n'est jamais écrit dans le journal.
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: "RESET_PASSWORD",
          entityType: "Supervisor",
          entityId: supervisor.id,
          details: { email: supervisor.user.email },
        },
      });

      return supervisor;
    });

    if (!result) {
      return NextResponse.json({ message: "Régisseur introuvable." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      message: "Mot de passe réinitialisé. Les sessions existantes sont fermées.",
    });
  } catch (error) {
    console.error("Supervisor password reset failed:", error);
    return NextResponse.json(
      { message: "Impossible de réinitialiser le mot de passe." },
      { status: 500 }
    );
  }
}
