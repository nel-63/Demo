import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  MaritimeDeclarationValidationError,
  snapshotMaritimeDeclaration,
  validateMaritimeDeclaration,
} from "@/lib/maritime-declarations";
import { MARITIME_DECLARATIONS_PAGE_SIZE, resolvePage } from "@/lib/pagination";

async function getMaritimeProfile(userId: string) {
  return prisma.maritimeUser.findUnique({
    where: { userId },
    select: { id: true },
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Le contenu de la déclaration est invalide." }, { status: 400 });
    }
    const input = validateMaritimeDeclaration(body);
    const created = await prisma.$transaction(async (tx) => {
      const declaration = await tx.maritimeDeclaration.create({
        data: {
          maritimeUserId: profile.id,
          companyName: input.companyName,
          boatName: input.boatName,
          boatRegistration: input.boatRegistration,
          boatCapacity: input.boatCapacity,
          captainName: input.captainName,
          captainPhone: input.captainPhone,
          captainEmail: input.captainEmail,
          originDepartureDate: new Date(`${input.originDepartureDate}T00:00:00.000Z`),
          arrivalDate: new Date(`${input.arrivalDate}T00:00:00.000Z`),
          departureDate: new Date(`${input.departureDate}T00:00:00.000Z`),
          products: {
            create: input.products.map(({ productType, quantity, unitPrice }) => ({
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
      return snapshot;
    });

    return NextResponse.json({ ok: true, declaration: created }, { status: 201 });
  } catch (error) {
    if (error instanceof MaritimeDeclarationValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error("Maritime declaration creation failed:", error);
    return NextResponse.json({ message: "Impossible d'enregistrer la déclaration maritime." }, { status: 500 });
  }
}
