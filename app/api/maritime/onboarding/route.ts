import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MaritimeDeclarationValidationError,
  snapshotMaritimeDeclaration,
  validateMaritimeDeclaration,
} from "@/lib/maritime-declarations";
import {
  deactivateMaritimeAccount,
  MaritimeContactValidationError,
  validateMaritimeContact,
} from "@/lib/maritime-account";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "USER_MAR") {
    return NextResponse.json({ message: "Accès réservé aux utilisateurs maritimes." }, { status: 403 });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Les informations du profil sont invalides." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Les informations du profil sont invalides." }, { status: 400 });
    }
    const data = body as Record<string, unknown>;
    const contact = validateMaritimeContact(data.contactEmail, data.contactPhone);
    const profile = await prisma.maritimeUser.findUnique({
      where: { userId: user.id },
      select: { id: true, companyName: true, onboardingComplete: true },
    });
    if (!profile) {
      return NextResponse.json({ message: "Aucun profil maritime n'est associé à ce compte." }, { status: 404 });
    }
    if (profile.onboardingComplete) {
      return NextResponse.json({ message: "Le profil maritime est déjà renseigné." }, { status: 409 });
    }

    const input = validateMaritimeDeclaration({
      ...data,
      companyName: profile.companyName,
      products: [],
    });
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          email: contact.email,
          phoneNumber: contact.phone,
        },
      });
      await tx.maritimeUser.update({
        where: { id: profile.id },
        data: { contactPhone: contact.phone, onboardingComplete: true },
      });
      const declaration = await tx.maritimeDeclaration.create({
        data: {
          maritimeUserId: profile.id,
          companyName: profile.companyName,
          boatName: input.boatName,
          boatRegistration: input.boatRegistration,
          boatCapacity: input.boatCapacity,
          captainName: input.captainName,
          captainPhone: input.captainPhone,
          captainEmail: input.captainEmail,
          originDepartureDate: new Date(`${input.originDepartureDate}T00:00:00.000Z`),
          arrivalDate: new Date(`${input.arrivalDate}T00:00:00.000Z`),
          departureDate: input.departureDate
            ? new Date(`${input.departureDate}T00:00:00.000Z`)
            : null,
        },
        include: { products: true },
      });
      const snapshot = snapshotMaritimeDeclaration(declaration);
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "MaritimeDeclaration",
          entityId: declaration.id,
          details: { after: snapshot },
        },
      });
      if (input.departureDate) {
        await deactivateMaritimeAccount(tx, user.id, profile.id, "EXIT_DATE");
      }
      return { declaration: snapshot, accountDeactivated: Boolean(input.departureDate) };
    });

    return NextResponse.json({ ok: true, ...outcome }, { status: 201 });
  } catch (error) {
    if (error instanceof MaritimeDeclarationValidationError || error instanceof MaritimeContactValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined;
    if (code === "P2002") {
      return NextResponse.json({ message: "Cet email ou ce téléphone est déjà associé à un compte." }, { status: 409 });
    }
    console.error("Maritime onboarding failed:", error);
    return NextResponse.json({ message: "Impossible d'enregistrer le profil maritime." }, { status: 500 });
  }
}
