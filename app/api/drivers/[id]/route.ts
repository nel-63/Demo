import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

async function getLocation(userId: string) {
  return prisma.supervisor.findUnique({
    where: { userId },
    select: { id: true, locationId: true },
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  }
  if (user.role !== "SUPERVISOR") {
    return NextResponse.json({ message: "Accès réservé aux régisseurs." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const profile = await getLocation(user.id);
    if (!profile?.locationId) {
      return NextResponse.json({ message: "Lieu non affecté." }, { status: 403 });
    }

    const body: unknown = await request.json().catch(() => null);
    const data = body && typeof body === "object"
      ? body as Record<string, unknown>
      : {};
    const text = (key: string) =>
      typeof data[key] === "string" ? (data[key] as string).trim() : "";

    const firstName = text("firstName");
    const lastName = text("lastName");
    const nationalId = text("nationalId");
    const phoneNumber = text("phoneNumber");
    const licenseNumber = text("licenseNumber");

    if (!firstName || !lastName || !nationalId || !licenseNumber) {
      return NextResponse.json(
        { message: "Prénom, nom, CIN et permis obligatoires." },
        { status: 400 }
      );
    }

    if (
      firstName.length > 100 || lastName.length > 100 ||
      nationalId.length > 50 || licenseNumber.length > 50 ||
      phoneNumber.length > 30
    ) {
      return NextResponse.json({ message: "Un champ est trop long." }, { status: 400 });
    }

    const driver = await prisma.$transaction(async (tx) => {
      const existing = await tx.driver.findFirst({
        where: { id, locationId: profile.locationId },
        select: { id: true },
      });
      if (!existing) return null;

      const updated = await tx.driver.update({
        where: { id: existing.id },
        data: {
          firstName, lastName, nationalId, licenseNumber,
          phoneNumber: phoneNumber || null,
        },
        select: {
          id: true, firstName: true, lastName: true,
          nationalId: true, licenseNumber: true, phoneNumber: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          entityType: "Driver",
          entityId: updated.id,
          details: { locationId: profile.locationId },
        },
      });

      return updated;
    });

    if (!driver) {
      return NextResponse.json({ message: "Chauffeur introuvable dans ce lieu." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, driver });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code : undefined;

    if (code === "P2002") {
      return NextResponse.json({ message: "Cette CIN ou ce permis est déjà utilisé." }, { status: 409 });
    }

    console.error("Driver update failed:", error);
    return NextResponse.json({ message: "Modification du chauffeur impossible." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  }
  if (user.role !== "SUPERVISOR") {
    return NextResponse.json({ message: "Accès réservé aux régisseurs." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== "object" ||
        typeof (body as Record<string, unknown>).isActive !== "boolean") {
      return NextResponse.json({ message: "Statut invalide." }, { status: 400 });
    }

    const profile = await getLocation(user.id);
    if (!profile?.locationId) {
      return NextResponse.json({ message: "Lieu non affecté." }, { status: 403 });
    }

    const isActive = (body as { isActive: boolean }).isActive;

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.driver.findFirst({
        where: { id, locationId: profile.locationId },
        select: { id: true },
      });
      if (!existing) return null;

      const driver = await tx.driver.update({
        where: { id: existing.id },
        data: { isActive },
        select: { id: true, isActive: true },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: isActive ? "ACTIVATE" : "DEACTIVATE",
          entityType: "Driver",
          entityId: driver.id,
          details: { locationId: profile.locationId, isActive },
        },
      });

      return driver;
    });

    if (!updated) {
      return NextResponse.json({ message: "Chauffeur introuvable dans ce lieu." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, driver: updated });
  } catch (error) {
    console.error("Driver status update failed:", error);
    return NextResponse.json({ message: "Modification du statut impossible." }, { status: 500 });
  }
}