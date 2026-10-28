import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  const admin = await getCurrentUser();

  if (!admin) {
    return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  }

  if (admin.role !== "ADMIN") {
    return NextResponse.json(
      { message: "Seul un administrateur peut enregistrer un régisseur." },
      { status: 403 }
    );
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    const data = body && typeof body === "object"
      ? body as Record<string, unknown>
      : {};

    const text = (key: string) =>
      typeof data[key] === "string" ? (data[key] as string).trim() : "";

    const firstName = text("firstName");
    const lastName = text("lastName");
    const email = text("email").toLowerCase();
    const phoneNumber = text("phoneNumber");
    const nationalId = text("nationalId");
    const address = text("address");
    const locationId = text("locationId");
    const password = typeof data.password === "string" ? data.password : "";

    if (!firstName || !lastName ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !nationalId || !locationId) {
      return NextResponse.json(
        { message: "Prénom, nom, email, CIN et lieu sont obligatoires." },
        { status: 400 }
      );
    }

    if (password.length < 12 || password.length > 200) {
      return NextResponse.json(
        { message: "Le mot de passe doit contenir entre 12 et 200 caractères." },
        { status: 400 }
      );
    }

    const location = await prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, name: true },
    });

    if (!location) {
      return NextResponse.json(
        { message: "Le lieu sélectionné n'existe pas." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const supervisor = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          firstName,
          lastName,
          email,
          phoneNumber: phoneNumber || null,
          passwordHash,
          role: "SUPERVISOR",
          designation: "Régisseur",
        },
        select: { id: true },
      });

      const createdSupervisor = await tx.supervisor.create({
        data: {
          userId: createdUser.id,
          nationalId,
          location: location.name,
          locationId: location.id,
          address: address || null,
        },
        select: {
          id: true,
          nationalId: true,
          locationId: true,
          location: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: "CREATE",
          entityType: "Supervisor",
          entityId: createdSupervisor.id,
          details: {
            email,
            locationId: location.id,
            locationName: location.name,
          },
        },
      });

      return createdSupervisor;
    });

    return NextResponse.json({ ok: true, supervisor }, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined;

    if (code === "P2002") {
      return NextResponse.json(
        { message: "Cet email ou cette CIN existe déjà." },
        { status: 409 }
      );
    }

    console.error("Supervisor creation failed:", error);
    return NextResponse.json(
      { message: "Impossible de créer le régisseur." },
      { status: 500 }
    );
  }
}