import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validatePassword } from "@/lib/password-policy";
import {
  MaritimeDeclarationValidationError,
  snapshotMaritimeDeclaration,
  validateMaritimeDeclaration,
} from "@/lib/maritime-declarations";
import { resolveMaritimeProductLines } from "@/lib/maritime-product-lines";
import {
  deactivateMaritimeAccount,
  MaritimeContactValidationError,
  validateMaritimeContact,
} from "@/lib/maritime-account";
import {
  hasMaritimeUserCoordinates,
  parseOptionalMaritimeUserCoordinates,
} from "@/lib/maritime-user-coordinates";

// Première connexion : l'utilisateur est connecté avec le COMPTE SOCIÉTÉ saisi par l'admin.
// Il renseigne le bateau, le commandant, les produits et choisit de NOUVEAUX identifiants.
// Cela crée un compte bateau distinct, relié à la société. Le compte société est ensuite fermé :
// les connexions suivantes se font uniquement avec le compte bateau.
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
    const password = typeof data.password === "string" ? data.password : "";
    const passwordError = validatePassword(password);
    if (passwordError) return NextResponse.json({ message: passwordError }, { status: 400 });
    if (data.passwordConfirm !== undefined && data.passwordConfirm !== password) {
      return NextResponse.json({ message: "Les deux mots de passe ne correspondent pas." }, { status: 400 });
    }

    const hasCoordinatesInput = hasMaritimeUserCoordinates(data);
    const coordinates = parseOptionalMaritimeUserCoordinates(data.latitude, data.longitude);
    if (hasCoordinatesInput && coordinates === undefined) {
      return NextResponse.json({ message: "Les coordonnées doivent être valides." }, { status: 400 });
    }

    const company = await prisma.maritimeUser.findUnique({
      where: { userId: user.id },
      select: { id: true, companyName: true, latitude: true, longitude: true, onboardingComplete: true },
    });
    if (!company) {
      return NextResponse.json({ message: "Aucun profil maritime n'est associé à ce compte." }, { status: 404 });
    }
    if (company.onboardingComplete) {
      return NextResponse.json({ message: "Ce compte a déjà été utilisé pour créer un compte bateau." }, { status: 409 });
    }

    const input = validateMaritimeDeclaration({ ...data, companyName: company.companyName });
    const passwordHash = await bcrypt.hash(password, 12);

    const outcome = await prisma.$transaction(async (tx) => {
      const productLines = await resolveMaritimeProductLines(tx, input.products ?? []);

      const boatUser = await tx.user.create({
        data: {
          firstName: company.companyName,
          lastName: input.boatName,
          email: contact.email,
          phoneNumber: contact.phone,
          passwordHash,
          role: "USER_MAR",
          designation: "Utilisateur maritime",
        },
        select: { id: true },
      });
      const boatProfile = await tx.maritimeUser.create({
        data: {
          userId: boatUser.id,
          loginId: contact.email,
          contactPhone: contact.phone,
          companyName: company.companyName,
          onboardingComplete: true,
          latitude: coordinates?.latitude ?? company.latitude ?? null,
          longitude: coordinates?.longitude ?? company.longitude ?? null,
          companyAccountId: company.id,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "MaritimeUser",
          entityId: boatProfile.id,
          details: { companyAccountId: company.id, loginId: contact.email, boatName: input.boatName },
        },
      });

      const declaration = await tx.maritimeDeclaration.create({
        data: {
          maritimeUserId: boatProfile.id,
          companyName: company.companyName,
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
          products: {
            create: productLines.map(({ productTypeId, productType, quantity, unitPrice }) => ({
              productTypeId: productTypeId ?? undefined,
              productType,
              quantity,
              unitPrice,
            })),
          },
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

      // Le compte société a rempli son rôle : on le ferme (et sa session avec).
      await deactivateMaritimeAccount(tx, user.id, company.id, "BOAT_ACCOUNT_CREATED");
      if (input.departureDate) {
        await deactivateMaritimeAccount(tx, boatUser.id, boatProfile.id, "EXIT_DATE");
      }
      return {
        declaration: snapshot,
        accountDeactivated: Boolean(input.departureDate),
        login: { email: contact.email, phone: contact.phone },
      };
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
    return NextResponse.json({ message: "Impossible de créer le compte bateau." }, { status: 500 });
  }
}
