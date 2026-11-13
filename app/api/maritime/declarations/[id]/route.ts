import { NextResponse } from "next/server";
import { resolveMaritimeProductLines } from "@/lib/maritime-product-lines";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MaritimeDeclarationValidationError,
  snapshotMaritimeDeclaration,
  validateMaritimeDeclaration,
} from "@/lib/maritime-declarations";
import {
  hasMaritimeUserCoordinates,
  parseOptionalMaritimeUserCoordinates,
} from "@/lib/maritime-user-coordinates";
import { MaritimeContactValidationError, validateMaritimeContact } from "@/lib/maritime-account";

type Context = { params: Promise<{ id: string }> };

async function getMaritimeProfile(userId: string) {
  return prisma.maritimeUser.findUnique({
    where: { userId },
    select: {
      id: true,
      companyName: true,
      latitude: true,
      longitude: true,
    },
  });
}

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "USER_MAR") {
    return NextResponse.json({ message: "Accès réservé aux utilisateurs maritimes." }, { status: 403 });
  }

  try {
    const profile = await getMaritimeProfile(user.id);
    if (!profile) {
      return NextResponse.json({ message: "Aucun profil maritime n'est associé à ce compte." }, { status: 403 });
    }
    const { id } = await context.params;
    const declaration = await prisma.maritimeDeclaration.findFirst({
      where: { id, maritimeUserId: profile.id },
      include: { products: true },
    });
    if (!declaration) return NextResponse.json({ message: "Déclaration introuvable." }, { status: 404 });
    return NextResponse.json({ declaration: snapshotMaritimeDeclaration(declaration) });
  } catch (error) {
    console.error("Maritime declaration retrieval failed:", error);
    return NextResponse.json({ message: "Impossible de charger cette déclaration maritime." }, { status: 500 });
  }
}

async function updateDeclaration(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "USER_MAR") {
    return NextResponse.json({ message: "Accès réservé aux utilisateurs maritimes." }, { status: 403 });
  }

  try {
    const profile = await getMaritimeProfile(user.id);
    if (!profile) {
      return NextResponse.json({ message: "Aucun profil maritime n'est associé à ce compte." }, { status: 403 });
    }
    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Le contenu de la déclaration est invalide." }, { status: 400 });
    }
    const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const hasContactInput =
      Object.prototype.hasOwnProperty.call(data, "contactEmail") ||
      Object.prototype.hasOwnProperty.call(data, "contactPhone");
    const contact = hasContactInput
      ? validateMaritimeContact(data.contactEmail, data.contactPhone)
      : null;
    const hasCoordinatesInput = hasMaritimeUserCoordinates(data);
    const coordinates = parseOptionalMaritimeUserCoordinates(data.latitude, data.longitude);
    if (hasCoordinatesInput && coordinates === undefined) {
      return NextResponse.json({ message: "Les coordonnées doivent être valides." }, { status: 400 });
    }
    const input = validateMaritimeDeclaration({ ...data, companyName: profile.companyName });
    const products = input.products ?? [];
    const outcome = await prisma.$transaction(async (tx) => {
      const current = await tx.maritimeDeclaration.findFirst({
        where: { id, maritimeUserId: profile.id },
        include: { products: true },
      });
      if (!current) return { kind: "not_found" as const };

      const currentProductIds = new Set(current.products.map((product) => product.id));
      if (products.some((product) => product.id && !currentProductIds.has(product.id))) {
        return { kind: "invalid_product" as const };
      }

      const resolvedProducts = await resolveMaritimeProductLines(tx, products);
      if (contact) {
        await tx.user.update({
          where: { id: user.id },
          data: { email: contact.email, phoneNumber: contact.phone },
        });
        await tx.maritimeUser.update({
          where: { id: profile.id },
          data: { contactPhone: contact.phone },
        });
      }
      if (hasCoordinatesInput) {
        const updatedProfile = await tx.maritimeUser.update({
          where: { id: profile.id },
          data: {
            latitude: coordinates?.latitude ?? null,
            longitude: coordinates?.longitude ?? null,
          },
          select: { id: true, latitude: true, longitude: true },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "UPDATE",
            entityType: "MaritimeUserProfile",
            entityId: updatedProfile.id,
            details: {
              before: {
                latitude: profile.latitude?.toString() ?? null,
                longitude: profile.longitude?.toString() ?? null,
              },
              after: {
                latitude: updatedProfile.latitude?.toString() ?? null,
                longitude: updatedProfile.longitude?.toString() ?? null,
              },
            },
          },
        });
      }
      const before = snapshotMaritimeDeclaration(current);
      await tx.maritimeDeclaration.update({
        where: { id },
        data: {
          companyName: profile.companyName,
          boatName: input.boatName,
          boatRegistration: input.boatRegistration,
          boatCapacity: input.boatCapacity,
          captainName: input.captainName,
          captainPhone: input.captainPhone,
          captainEmail: input.captainEmail,
          originDepartureDate: new Date(`${input.originDepartureDate}T00:00:00.000Z`),
          arrivalDate: new Date(`${input.arrivalDate}T00:00:00.000Z`),
          departureDate: input.departureDate ? new Date(`${input.departureDate}T00:00:00.000Z`) : null,
        },
      });

      const retainedIds: string[] = [];
      for (let index = 0; index < products.length; index += 1) {
        const sourceLine = products[index];
        const resolved = resolvedProducts[index];
        const data = {
          productTypeId: resolved.productTypeId ?? undefined,
          productType: resolved.productType,
          quantity: resolved.quantity,
          unitPrice: resolved.unitPrice,
        };
        if (sourceLine.id) {
          retainedIds.push(sourceLine.id);
          await tx.maritimeDeclarationProduct.update({ where: { id: sourceLine.id }, data });
        } else {
          await tx.maritimeDeclarationProduct.create({ data: { declarationId: id, ...data } });
        }
      }
      await tx.maritimeDeclarationProduct.deleteMany({
        where: {
          declarationId: id,
          ...(retainedIds.length > 0 ? { id: { notIn: retainedIds } } : {}),
        },
      });

      const updated = await tx.maritimeDeclaration.findUniqueOrThrow({
        where: { id },
        include: { products: true },
      });
      const after = snapshotMaritimeDeclaration(updated);
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          entityType: "MaritimeDeclaration",
          entityId: id,
          details: { before, after },
        },
      });
      return {
        kind: "updated" as const,
        declaration: after,
      };
    });

    if (outcome.kind === "not_found") {
      return NextResponse.json({ message: "Déclaration introuvable." }, { status: 404 });
    }
    if (outcome.kind === "invalid_product") {
      return NextResponse.json({ message: "Une ligne produit ne fait pas partie de cette déclaration." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    if (error instanceof MaritimeDeclarationValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof MaritimeContactValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ message: "Cet email ou ce téléphone est déjà associé à un compte." }, { status: 409 });
    }
    console.error("Maritime declaration update failed:", error);
    return NextResponse.json({ message: "Impossible de modifier la déclaration maritime." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: Context) {
  return updateDeclaration(request, context);
}

export async function PATCH(request: Request, context: Context) {
  return updateDeclaration(request, context);
}
