import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { hasMaritimeUserCoordinates, parseMaritimeUserCoordinates } from "@/lib/maritime-user-coordinates";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (admin.role !== "ADMIN") {
    return NextResponse.json({ message: "Seul un administrateur peut modifier un utilisateur maritime." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "Requête invalide." }, { status: 400 });
    }
    const data = body as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(data, "isActive")) {
      if (typeof data.isActive !== "boolean" || Object.keys(data).length !== 1) {
        return NextResponse.json({ message: "Indiquez uniquement un statut valide." }, { status: 400 });
      }
      return await changeAccountStatus(id, data.isActive, admin.id);
    }

    const text = (key: string) => typeof data[key] === "string" ? (data[key] as string).trim() : "";
    const firstName = text("firstName");
    const lastName = text("lastName");
    const email = text("email").toLowerCase();
    const phoneNumber = text("phoneNumber");
    const coordinates = parseMaritimeUserCoordinates(data.latitude, data.longitude);
    const hasCoordinatesInput = hasMaritimeUserCoordinates(data);
    if (!firstName || !lastName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (hasCoordinatesInput && !coordinates)) {
      return NextResponse.json(
        { message: hasCoordinatesInput ? "Prénom, nom, email et coordonnées valides sont obligatoires." : "Prénom, nom et email valides sont obligatoires." },
        { status: 400 },
      );
    }

    const maritimeUser = await prisma.$transaction(async (tx) => {
      const current = await tx.maritimeUser.findUnique({
        where: { id },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
            },
          },
        },
      });
      if (!current) return null;

      const before = {
        firstName: current.user.firstName,
        lastName: current.user.lastName,
        email: current.user.email,
        phoneNumber: current.user.phoneNumber,
        latitude: current.latitude ? current.latitude.toString() : null,
        longitude: current.longitude ? current.longitude.toString() : null,
      };
      await tx.user.update({
        where: { id: current.user.id },
        data: { firstName, lastName, email, phoneNumber: phoneNumber || null },
      });
      const updated = await tx.maritimeUser.update({
        where: { id },
        data: coordinates ? { latitude: coordinates.latitude, longitude: coordinates.longitude } : {},
        select: {
          id: true,
          latitude: true,
          longitude: true,
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
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: "UPDATE",
          entityType: "MaritimeUser",
          entityId: id,
          details: {
            before,
            after: {
              firstName,
              lastName,
              email,
              phoneNumber: phoneNumber || null,
              ...(coordinates ? { latitude: coordinates.latitude, longitude: coordinates.longitude } : {}),
            },
          },
        },
      });
      return updated;
    });

    if (!maritimeUser) {
      return NextResponse.json({ message: "Utilisateur maritime introuvable." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      maritimeUser: {
        ...maritimeUser,
        latitude: maritimeUser.latitude ? maritimeUser.latitude.toString() : null,
        longitude: maritimeUser.longitude ? maritimeUser.longitude.toString() : null,
      },
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined;
    if (code === "P2002") {
      return NextResponse.json({ message: "Cet email ou cette CIN existe déjà." }, { status: 409 });
    }
    console.error("Maritime user update failed:", error);
    return NextResponse.json({ message: "Impossible de modifier l'utilisateur maritime." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (admin.role !== "ADMIN") {
    return NextResponse.json({ message: "Seul un administrateur peut supprimer un utilisateur maritime." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.maritimeUser.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          latitude: true,
          longitude: true,
          _count: { select: { declarations: true } },
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      });
      if (!current) return { kind: "not_found" as const };
      if (current._count.declarations > 0) return { kind: "has_declarations" as const };

      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: "DELETE",
          entityType: "MaritimeUser",
          entityId: current.id,
          details: {
            email: current.user.email,
            firstName: current.user.firstName,
            lastName: current.user.lastName,
            latitude: current.latitude.toString(),
            longitude: current.longitude.toString(),
          },
        },
      });
      await tx.maritimeUser.delete({ where: { id } });
      await tx.user.delete({ where: { id: current.userId } });
      return { kind: "deleted" as const };
    });

    if (result.kind === "not_found") {
      return NextResponse.json({ message: "Utilisateur maritime introuvable." }, { status: 404 });
    }
    if (result.kind === "has_declarations") {
      return NextResponse.json({
        message: "Cet utilisateur a déjà des déclarations et ne peut pas être supprimé. Désactivez son compte à la place.",
      }, { status: 409 });
    }
    return NextResponse.json({ ok: true, message: "Utilisateur maritime supprimé." });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined;
    if (code === "P2003") {
      return NextResponse.json({
        message: "Cet utilisateur possède des déclarations ou un historique associé et ne peut pas être supprimé. Désactivez son compte à la place.",
      }, { status: 409 });
    }
    console.error("Maritime user deletion failed:", error);
    return NextResponse.json({ message: "Impossible de supprimer l'utilisateur maritime." }, { status: 500 });
  }
}

async function changeAccountStatus(maritimeUserId: string, isActive: boolean, adminId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const profile = await tx.maritimeUser.findUnique({
      where: { id: maritimeUserId },
      select: { id: true, userId: true, user: { select: { email: true, isActive: true } } },
    });
    if (!profile) return { error: "NOT_FOUND" as const };
    if (profile.user.isActive === isActive) return { error: "UNCHANGED" as const };

    await tx.user.update({
      where: { id: profile.userId },
      data: { isActive, ...(isActive ? {} : { sessionVersion: { increment: 1 } }) },
    });
    await tx.auditLog.create({
      data: {
        userId: adminId,
        action: isActive ? "ACTIVATE" : "DEACTIVATE",
        entityType: "MaritimeUser",
        entityId: profile.id,
        details: { email: profile.user.email, isActive },
      },
    });
    return { ok: true as const };
  });

  if ("error" in result) {
    if (result.error === "NOT_FOUND") {
      return NextResponse.json({ message: "Utilisateur maritime introuvable." }, { status: 404 });
    }
    return NextResponse.json(
      { message: isActive ? "Ce compte est déjà actif." : "Ce compte est déjà désactivé." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: isActive ? "Compte réactivé." : "Compte désactivé. Ses sessions sont fermées.",
  });
}
