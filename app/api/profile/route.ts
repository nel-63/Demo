import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  hasMaritimeUserCoordinates,
  parseOptionalMaritimeUserCoordinates,
} from "@/lib/maritime-user-coordinates";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "USER_MAR") {
    return NextResponse.json({ message: "Accès réservé aux utilisateurs maritimes." }, { status: 403 });
  }

  const profile = await prisma.maritimeUser.findUnique({
    where: { userId: user.id },
    select: { id: true, latitude: true, longitude: true, user: { select: { firstName: true, lastName: true, email: true } } },
  });

  if (!profile) {
    return NextResponse.json({ message: "Aucun profil maritime n'est associé à ce compte." }, { status: 404 });
  }

  return NextResponse.json({
    profile: {
      id: profile.id,
      firstName: profile.user.firstName,
      lastName: profile.user.lastName,
      email: profile.user.email,
      latitude: profile.latitude ? profile.latitude.toString() : null,
      longitude: profile.longitude ? profile.longitude.toString() : null,
    },
  });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "USER_MAR") {
    return NextResponse.json({ message: "Accès réservé aux utilisateurs maritimes." }, { status: 403 });
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const hasCoordinatesInput = hasMaritimeUserCoordinates(data);
    const coordinates = parseOptionalMaritimeUserCoordinates(data.latitude, data.longitude);

    if (hasCoordinatesInput && coordinates === undefined) {
      return NextResponse.json({ message: "Les coordonnées doivent être valides." }, { status: 400 });
    }

    const profile = await prisma.maritimeUser.findUnique({
      where: { userId: user.id },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!profile) {
      return NextResponse.json({ message: "Aucun profil maritime n'est associé à ce compte." }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.maritimeUser.update({
        where: { id: profile.id },
        data: hasCoordinatesInput
          ? { latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null }
          : {},
        select: { id: true, latitude: true, longitude: true },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          entityType: "MaritimeUserProfile",
          entityId: item.id,
          details: {
            before: {
              latitude: profile.latitude ? profile.latitude.toString() : null,
              longitude: profile.longitude ? profile.longitude.toString() : null,
            },
            after: {
              latitude: item.latitude ? item.latitude.toString() : null,
              longitude: item.longitude ? item.longitude.toString() : null,
            },
          },
        },
      });
      return item;
    });

    return NextResponse.json({
      ok: true,
      profile: {
        id: updated.id,
        latitude: updated.latitude ? updated.latitude.toString() : null,
        longitude: updated.longitude ? updated.longitude.toString() : null,
      },
    });
  } catch (error) {
    console.error("Maritime profile update failed:", error);
    return NextResponse.json({ message: "Impossible de mettre à jour votre profil." }, { status: 500 });
  }
}
