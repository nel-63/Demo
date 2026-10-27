import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  }
  if (user.role !== "SUPERVISOR") {
    return NextResponse.json({ message: "Acces reserve aux regisseurs." }, { status: 403 });
  }

  try {
    const profile = await prisma.supervisor.findUnique({
      where: { userId: user.id },
      select: { id: true, locationId: true },
    });

    if (!profile?.locationId) {
      return NextResponse.json({ message: "Votre compte doit etre affecte a un lieu." }, { status: 403 });
    }

    const body: unknown = await request.json().catch(() => null);
    const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const text = (key: string) => typeof data[key] === "string" ? (data[key] as string).trim() : "";

    const vehicleType = text("vehicleType");
    const licensePlate = text("licensePlate").replace(/\s+/g, " ").toUpperCase();
    const driverId = text("driverId");

    if (!vehicleType || !licensePlate || !driverId) {
      return NextResponse.json({ message: "Type, immatriculation et chauffeur obligatoires." }, { status: 400 });
    }
    if (vehicleType.length > 100 || licensePlate.length > 30) {
      return NextResponse.json({ message: "Un champ est trop long." }, { status: 400 });
    }

    const driver = await prisma.driver.findFirst({
      where: {
        id: driverId,
        locationId: profile.locationId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!driver) {
      return NextResponse.json(
        { message: "Le chauffeur doit etre actif et appartenir a votre lieu." },
        { status: 403 }
      );
    }

    const vehicle = await prisma.$transaction(async (tx) => {
      const created = await tx.vehicle.create({
        data: {
          vehicleType,
          licensePlate,
          driverId: driver.id,
          supervisorId: profile.id,
          locationId: profile.locationId!,
        },
        select: {
          id: true,
          vehicleType: true,
          licensePlate: true,
          isActive: true,
          driver: { select: { firstName: true, lastName: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "Vehicle",
          entityId: created.id,
          details: { locationId: profile.locationId },
        },
      });

      return created;
    });

    return NextResponse.json({ ok: true, vehicle }, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code : undefined;
    if (code === "P2002") {
      return NextResponse.json({ message: "Cette immatriculation existe deja." }, { status: 409 });
    }
    console.error("Vehicle creation failed:", error);
    return NextResponse.json({ message: "Impossible de creer le vehicule." }, { status: 500 });
  }
}