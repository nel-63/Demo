import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  MaritimeDeclarationValidationError,
  snapshotMaritimeDeclaration,
  validateMaritimeDeclaration,
  type MaritimeProductInput,
} from "@/lib/maritime-declarations";
import {
  deactivateMaritimeAccount,
  MaritimeContactValidationError,
  validateMaritimeContact,
} from "@/lib/maritime-account";
import {
  hasMaritimeUserCoordinates,
  parseOptionalMaritimeUserCoordinates,
} from "@/lib/maritime-user-coordinates";
import { MARITIME_DECLARATIONS_PAGE_SIZE, resolvePage } from "@/lib/pagination";

async function resolveProductLines(
  tx: Prisma.TransactionClient,
  products: MaritimeProductInput[] = [],
) {
  const safeProducts = products ?? [];
  const productIds = safeProducts
    .map((product) => product.productId ?? product.id)
    .filter((value): value is string => Boolean(value));

  const catalog = productIds.length
    ? (await tx.maritimeProductType.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: { id: true, name: true, unitPrice: true },
      })) ?? []
    : [];

  const catalogById = new Map(catalog.map((item) => [item.id, item]));

  return safeProducts.map((product) => {
    const catalogItem = product.productId ? catalogById.get(product.productId) : null;
    const resolvedName = catalogItem?.name ?? product.productType ?? "";
    const resolvedUnitPrice = catalogItem ? catalogItem.unitPrice.toString() : (product.unitPrice ?? "0");
    if (product.productId && !catalogItem) {
      throw new MaritimeDeclarationValidationError("Un produit maritime sélectionné est introuvable ou désactivé.");
    }
    return {
      productTypeId: catalogItem?.id ?? null,
      productType: resolvedName,
      quantity: product.quantity,
      unitPrice: resolvedUnitPrice,
    };
  });
}

async function getMaritimeProfile(userId: string) {
  return prisma.maritimeUser.findUnique({
    where: { userId },
    select: {
      id: true,
      companyName: true,
      latitude: true,
      longitude: true,
      onboardingComplete: true,
    },
  });
}

export async function GET(request: Request) {
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

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
    const requestedSort = url.searchParams.get("sort");
    const sort: "companyName" | "boatName" | "arrivalDate" | "createdAt" =
      requestedSort === "companyName" || requestedSort === "boatName" ||
      requestedSort === "arrivalDate" || requestedSort === "createdAt"
        ? requestedSort
        : "createdAt";
    const direction: Prisma.SortOrder = url.searchParams.get("direction") === "asc" ? "asc" : "desc";
    const where = {
      maritimeUserId: profile.id,
      departureDate: null,
      ...(words.length
        ? {
            AND: words.map((word) => ({
              OR: [
                { companyName: { contains: word, mode: "insensitive" as const } },
                { boatName: { contains: word, mode: "insensitive" as const } },
                { boatRegistration: { contains: word, mode: "insensitive" as const } },
                { captainName: { contains: word, mode: "insensitive" as const } },
              ],
            })),
          }
        : {}),
    };
    const orderBy: Prisma.MaritimeDeclarationOrderByWithRelationInput =
      sort === "companyName" ? { companyName: direction }
        : sort === "boatName" ? { boatName: direction }
          : sort === "arrivalDate" ? { arrivalDate: direction }
            : { createdAt: direction };
    const total = await prisma.maritimeDeclaration.count({ where });
    const { page, totalPages } = resolvePage(
      url.searchParams.get("page") ?? undefined,
      total,
      MARITIME_DECLARATIONS_PAGE_SIZE,
    );
    const declarations = await prisma.maritimeDeclaration.findMany({
      where,
      orderBy,
      skip: (page - 1) * MARITIME_DECLARATIONS_PAGE_SIZE,
      take: MARITIME_DECLARATIONS_PAGE_SIZE,
      include: { products: true },
    });

    return NextResponse.json({
      declarations: declarations.map(snapshotMaritimeDeclaration),
      pagination: { page, totalPages, total },
    });
  } catch (error) {
    console.error("Maritime declaration list failed:", error);
    return NextResponse.json({ message: "Impossible de charger les déclarations maritimes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
    if (!profile.onboardingComplete) {
      return NextResponse.json({ message: "Complétez d'abord votre profil maritime." }, { status: 403 });
    }

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
    const created = await prisma.$transaction(async (tx) => {
      const activeSession = await tx.maritimeDeclaration.findFirst({
        where: { maritimeUserId: profile.id, departureDate: null },
        select: { id: true },
      });
      if (activeSession) return { kind: "active_exists" as const, id: activeSession.id };

      const productLines = await resolveProductLines(tx, products);
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
          departureDate: input.departureDate ? new Date(`${input.departureDate}T00:00:00.000Z`) : null,
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
      if (input.departureDate) {
        await deactivateMaritimeAccount(tx, user.id, profile.id, "EXIT_DATE");
      }
      return { kind: "created" as const, declaration: snapshot, accountDeactivated: Boolean(input.departureDate) };
    });

    if (created.kind === "active_exists") {
      return NextResponse.json(
        { message: "Une session maritime est déjà active.", declarationId: created.id },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, ...created }, { status: 201 });
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
    console.error("Maritime declaration creation failed:", error);
    return NextResponse.json({ message: "Impossible d'enregistrer la déclaration maritime." }, { status: 500 });
  }
}
