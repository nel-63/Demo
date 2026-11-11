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

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ message: "Accès réservé à l'administrateur." }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { normalizedName: { contains: normalizeProductName(q), mode: "insensitive" as const } },
          ],
        }
      : undefined;

    const items = await prisma.maritimeProductType.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        normalizedName: true,
        unitPrice: true,
        currency: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      maritimeProductTypes: items.map((item) => ({
        ...item,
        unitPrice: item.unitPrice.toString(),
      })),
    });
  } catch (error) {
    console.error("Maritime product type list failed:", error);
    return NextResponse.json({ message: "Impossible de charger les produits maritimes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ message: "Accès réservé à l'administrateur." }, { status: 403 });
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const unitPrice = parseUnitPrice(data.unitPrice);
    const isActive = typeof data.isActive === "boolean" ? data.isActive : true;

    if (!name || name.length > 150 || !unitPrice) {
      return NextResponse.json({ message: "Le nom et le prix officiel du produit sont obligatoires." }, { status: 400 });
    }

    const normalizedName = normalizeProductName(name);
    const existing = await prisma.maritimeProductType.findUnique({ where: { normalizedName } });
    if (existing) {
      return NextResponse.json({ message: "Ce produit maritime existe déjà." }, { status: 409 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.maritimeProductType.create({
        data: {
          name,
          normalizedName,
          unitPrice,
          currency: "MGA",
          isActive,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "MaritimeProductType",
          entityId: item.id,
          details: { name, unitPrice, isActive },
        },
      });
      return item;
    });

    return NextResponse.json({
      ok: true,
      maritimeProductType: {
        ...created,
        unitPrice: created.unitPrice.toString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Maritime product type creation failed:", error);
    return NextResponse.json({ message: "Impossible de créer le produit maritime." }, { status: 500 });
  }
}
