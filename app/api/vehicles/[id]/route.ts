import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  }
  if (user.role !== "SUPERVISOR") {
    return NextResponse.json({ message: "Acces reserve aux regisseurs." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const profile = await prisma.supervisor.findUnique({
      where: { userId: user.id },
      select: { locationId: true },
    });

    if (!profile?.locationId) {
      return NextResponse.json({ message: "Lieu non affecte." }, { status: 403 });
    }

    const body: unknown = await request.json().catch(() => null);
    const data = body && typeof body === "object"
      ? body as Record<string, unknown>
      : {};

    const vehicleType = typeof data.vehicleType === "string" ? data.vehicleType.trim() : "";
    const licensePlate = typeof data.licensePlate === "string"
      ? data.licensePlate.trim().replace(/\s+/g, " ").toUpperCase()
      : "";

    if (!vehicleType || !licensePlate || vehicleType.length > 100 || licensePlate.length > 30) {
      return NextResponse.json({ message: "Type ou immatriculation invalide." }, { status: 400 });
    }

    const vehicle = await prisma.$transaction(async (tx) => {
      const existing = await tx.vehicle.findFirst({
        where: { id, locationId: profile.locationId },
        select: { id: true },
      });
      if (!existing) return null;

      const updated = await tx.vehicle.update({
        where: { id: existing.id },
        data: { vehicleType, licensePlate },
        select: {
          id: true,
          vehicleType: true,
          licensePlate: true,
          driver: { select: { firstName: true, lastName: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          entityType: "Vehicle",
          entityId: updated.id,
          details: { locationId: profile.locationId },
        },
      });

      return updated;
    });

    if (!vehicle) {
      return NextResponse.json({ message: "Vehicule introuvable dans ce lieu." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, vehicle });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code : undefined;

    if (code === "P2002") {
      return NextResponse.json({ message: "Cette immatriculation existe deja." }, { status: 409 });
    }

    console.error("Vehicle update failed:", error);
    return NextResponse.json({ message: "Modification du vehicule impossible." }, { status: 500 });
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
    return NextResponse.json({ message: "Acces reserve aux regisseurs." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== "object" ||
        typeof (body as Record<string, unknown>).isActive !== "boolean") {
      return NextResponse.json({ message: "Statut invalide." }, { status: 400 });
    }

    const isActive = (body as { isActive: boolean }).isActive;
    const profile = await prisma.supervisor.findUnique({
      where: { userId: user.id },
      select: { locationId: true },
    });

    if (!profile?.locationId) {
      return NextResponse.json({ message: "Lieu non affecte." }, { status: 403 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.vehicle.findFirst({
        where: { id, locationId: profile.locationId },
        select: { id: true },
      });
      if (!existing) return null;

      const vehicle = await tx.vehicle.update({
        where: { id: existing.id },
        data: { isActive },
        select: { id: true, isActive: true },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: isActive ? "ACTIVATE" : "DEACTIVATE",
          entityType: "Vehicle",
          entityId: vehicle.id,
          details: { locationId: profile.locationId, isActive },
        },
      });

      return vehicle;
    });

    if (!updated) {
      return NextResponse.json({ message: "Vehicule introuvable dans ce lieu." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, vehicle: updated });
  } catch (error) {
    console.error("Vehicle status update failed:", error);
    return NextResponse.json({ message: "Modification du statut impossible." }, { status: 500 });
  }
}