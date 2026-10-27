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
      return NextResponse.json(
        { message: "Votre compte doit etre affecte a un lieu." },
        { status: 403 }
      );
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
        { message: "Prenom, nom, CIN et permis sont obligatoires." },
        { status: 400 }
      );
    }

    if (
      firstName.length > 100 ||
      lastName.length > 100 ||
      nationalId.length > 50 ||
      licenseNumber.length > 50 ||
      phoneNumber.length > 30
    ) {
      return NextResponse.json({ message: "Un champ est trop long." }, { status: 400 });
    }

    const driver = await prisma.$transaction(async (tx) => {
      const created = await tx.driver.create({
        data: {
          firstName,
          lastName,
          nationalId,
          phoneNumber: phoneNumber || null,
          licenseNumber,
          supervisorId: profile.id,
          locationId: profile.locationId!,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          nationalId: true,
          phoneNumber: true,
          licenseNumber: true,
          locationId: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "Driver",
          entityId: created.id,
          details: {
            locationId: profile.locationId,
            createdBySupervisorId: profile.id,
          },
        },
      });

      return created;
    });

    return NextResponse.json({ ok: true, driver }, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined;

    if (code === "P2002") {
      return NextResponse.json(
        { message: "Cette CIN ou ce numero de permis existe deja." },
        { status: 409 }
      );
    }

    console.error("Driver creation failed:", error);
    return NextResponse.json({ message: "Impossible de creer le chauffeur." }, { status: 500 });
  }
}