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
    return NextResponse.json({ message: "Accès réservé aux régisseurs." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const profile = await prisma.supervisor.findUnique({
      where: { userId: user.id },
      select: { locationId: true },
    });

    if (!profile?.locationId) {
      return NextResponse.json({ message: "Lieu non affecté." }, { status: 403 });
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

    // Chauffeur facultatif : absent = on ne change pas de chauffeur.
    const requestedDriverId =
      typeof data.driverId === "string" ? data.driverId.trim() : "";

    const outcome = await prisma.$transaction(async (tx) => {
      // Verrou : un changement de chauffeur et la création d'un transport ne se croisent pas.
      await tx.$queryRaw`SELECT "id" FROM "Vehicle" WHERE "id" = ${id} FOR UPDATE`;

      const existing = await tx.vehicle.findFirst({
        where: { id, locationId: profile.locationId },
        select: {
          id: true,
          driverId: true,
          driver: { select: { firstName: true, lastName: true } },
        },
      });
      if (!existing) return { error: "NOT_FOUND" as const };

      const driverChanges =
        requestedDriverId !== "" && requestedDriverId !== existing.driverId;

      let newDriver: { id: string; firstName: string; lastName: string } | null = null;

      if (driverChanges) {
        newDriver = await tx.driver.findFirst({
          where: {
            id: requestedDriverId,
            locationId: profile.locationId,
            isActive: true,
          },
          select: { id: true, firstName: true, lastName: true },
        });
        if (!newDriver) return { error: "DRIVER_INVALID" as const };
      }

      const updated = await tx.vehicle.update({
        where: { id: existing.id },
        data: { vehicleType, licensePlate, ...(newDriver ? { driverId: newDriver.id } : {}) },
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

      if (newDriver) {
        // Les anciens transports gardent leur propre chauffeur (TransportAssignment.driverId).
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "CHANGE_DRIVER",
            entityType: "Vehicle",
            entityId: updated.id,
            details: {
              locationId: profile.locationId,
              previousDriverId: existing.driverId,
              previousDriverName: `${existing.driver.firstName} ${existing.driver.lastName}`,
              newDriverId: newDriver.id,
              newDriverName: `${newDriver.firstName} ${newDriver.lastName}`,
              historyPreserved: true,
            },
          },
        });
      }

      return { vehicle: updated };
    });

    if ("error" in outcome) {
      if (outcome.error === "NOT_FOUND") {
        return NextResponse.json({ message: "Véhicule introuvable dans ce lieu." }, { status: 404 });
      }
      return NextResponse.json(
        { message: "Le chauffeur doit être actif et appartenir à votre lieu." },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true, vehicle: outcome.vehicle });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code : undefined;

    if (code === "P2002") {
      return NextResponse.json({ message: "Cette immatriculation existe déjà." }, { status: 409 });
    }

    console.error("Vehicle update failed:", error);
    return NextResponse.json({ message: "Modification du véhicule impossible." }, { status: 500 });
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

    const isActive = (body as { isActive: boolean }).isActive;
    const profile = await prisma.supervisor.findUnique({
      where: { userId: user.id },
      select: { locationId: true },
    });

    if (!profile?.locationId) {
      return NextResponse.json({ message: "Lieu non affecté." }, { status: 403 });
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
      return NextResponse.json({ message: "Véhicule introuvable dans ce lieu." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, vehicle: updated });
  } catch (error) {
    console.error("Vehicle status update failed:", error);
    return NextResponse.json({ message: "Modification du statut impossible." }, { status: 500 });
  }
}