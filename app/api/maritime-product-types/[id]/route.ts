import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function normalizeProductName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseUnitPrice(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  return trimmed;
}

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ message: "Accès réservé à l'administrateur." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ message: "Aucune modification à enregistrer." }, { status: 400 });
    }

    const current = await prisma.maritimeProductType.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ message: "Produit maritime introuvable." }, { status: 404 });

    const name = typeof data.name === "string" ? data.name.trim() : current.name;
    const unitPrice = data.unitPrice !== undefined ? parseUnitPrice(data.unitPrice) : current.unitPrice.toString();
    const isActive = typeof data.isActive === "boolean" ? data.isActive : current.isActive;

    if (!name || name.length > 150 || !unitPrice) {
      return NextResponse.json({ message: "Le nom et le prix du produit sont invalides." }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.maritimeProductType.update({
        where: { id },
        data: {
          name,
          normalizedName: normalizeProductName(name),
          unitPrice,
          isActive,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          entityType: "MaritimeProductType",
          entityId: id,
          details: {
            before: {
              name: current.name,
              unitPrice: current.unitPrice.toString(),
              isActive: current.isActive,
            },
            after: { name, unitPrice, isActive },
          },
        },
      });
      return item;
    });

    return NextResponse.json({
      ok: true,
      maritimeProductType: {
        ...updated,
        unitPrice: updated.unitPrice.toString(),
      },
    });
  } catch (error) {
    console.error("Maritime product type update failed:", error);
    return NextResponse.json({ message: "Impossible de modifier le produit maritime." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ message: "Accès réservé à l'administrateur." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const current = await prisma.maritimeProductType.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ message: "Produit maritime introuvable." }, { status: 404 });
    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.maritimeProductType.update({
        where: { id },
        data: { isActive: false },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "DEACTIVATE",
          entityType: "MaritimeProductType",
          entityId: id,
          details: { before: { isActive: current.isActive }, after: { isActive: false } },
        },
      });
      return item;
    });

    return NextResponse.json({
      ok: true,
      maritimeProductType: { ...updated, unitPrice: updated.unitPrice.toString() },
      message: "Produit désactivé sans suppression physique.",
    });
  } catch (error) {
    console.error("Maritime product type deactivation failed:", error);
    return NextResponse.json({ message: "Impossible de désactiver le produit maritime." }, { status: 500 });
  }
}
