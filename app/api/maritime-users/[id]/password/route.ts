import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { validatePassword } from "@/lib/password-policy";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (admin.role !== "ADMIN") {
    return NextResponse.json({ message: "Seul un administrateur peut réinitialiser un mot de passe." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const password = typeof data.password === "string" ? data.password : "";
    const passwordError = validatePassword(password);
    if (passwordError) return NextResponse.json({ message: passwordError }, { status: 400 });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await prisma.$transaction(async (tx) => {
      const profile = await tx.maritimeUser.findUnique({
        where: { id },
        select: { id: true, userId: true, user: { select: { email: true } } },
      });
      if (!profile) return null;

      await tx.user.update({
        where: { id: profile.userId },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
      await tx.loginFailure.deleteMany({ where: { email: profile.user.email } });
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: "RESET_PASSWORD",
          entityType: "MaritimeUser",
          entityId: profile.id,
          details: { email: profile.user.email },
        },
      });
      return profile;
    });

    if (!result) {
      return NextResponse.json({ message: "Utilisateur maritime introuvable." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      message: "Mot de passe réinitialisé. Les sessions existantes sont fermées.",
    });
  } catch (error) {
    console.error("Maritime user password reset failed:", error);
    return NextResponse.json({ message: "Impossible de réinitialiser le mot de passe." }, { status: 500 });
  }
}
