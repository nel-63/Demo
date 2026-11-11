import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MaritimeDeclarationValidationError,
  snapshotMaritimeDeclaration,
  validateMaritimeDeclaration,
} from "@/lib/maritime-declarations";

type Context = { params: Promise<{ id: string }> };

async function getMaritimeProfile(userId: string) {
  return prisma.maritimeUser.findUnique({
    where: { userId },
    select: { id: true },
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
    const input = validateMaritimeDeclaration(body);
    const outcome = await prisma.$transaction(async (tx) => {
      const current = await tx.maritimeDeclaration.findFirst({
        where: { id, maritimeUserId: profile.id },
        include: { products: true },
      });
      if (!current) return { kind: "not_found" as const };

      const currentProductIds = new Set(current.products.map((product) => product.id));
      if (input.products.some((product) => product.id && !currentProductIds.has(product.id))) {
        return { kind: "invalid_product" as const };
      }

      const before = snapshotMaritimeDeclaration(current);
      await tx.maritimeDeclaration.update({
        where: { id },
        data: {
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
        },
      });

      const retainedIds: string[] = [];
      for (const product of input.products) {
        const data = {
          productType: product.productType,
          quantity: product.quantity,
          unitPrice: product.unitPrice,
        };
        if (product.id) {
          retainedIds.push(product.id);
          await tx.maritimeDeclarationProduct.update({ where: { id: product.id }, data });
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
      return { kind: "updated" as const, declaration: after };
    });

    if (outcome.kind === "not_found") {
      return NextResponse.json({ message: "Déclaration introuvable." }, { status: 404 });
    }
    if (outcome.kind === "invalid_product") {
      return NextResponse.json({ message: "Une ligne produit ne fait pas partie de cette déclaration." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, declaration: outcome.declaration });
  } catch (error) {
    if (error instanceof MaritimeDeclarationValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
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

export async function DELETE(_request: Request, context: Context) {
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
    const deleted = await prisma.$transaction(async (tx) => {
      const current = await tx.maritimeDeclaration.findFirst({
        where: { id, maritimeUserId: profile.id },
        include: { products: true },
      });
      if (!current) return false;
      const before = snapshotMaritimeDeclaration(current);
      await tx.maritimeDeclaration.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "DELETE",
          entityType: "MaritimeDeclaration",
          entityId: id,
          details: { before },
        },
      });
      return true;
    });
    if (!deleted) return NextResponse.json({ message: "Déclaration introuvable." }, { status: 404 });
    return NextResponse.json({ ok: true, message: "Déclaration supprimée définitivement." });
  } catch (error) {
    console.error("Maritime declaration deletion failed:", error);
    return NextResponse.json({ message: "Impossible de supprimer la déclaration maritime." }, { status: 500 });
  }
}
