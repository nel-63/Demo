import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  }

  if (user.role !== "SUPERVISOR") {
    return NextResponse.json({ message: "Accès réservé aux régisseurs." }, { status: 403 });
  }

  try {
    const profile = await prisma.supervisor.findUnique({
      where: { userId: user.id },
      select: { id: true, locationId: true },
    });

    if (!profile?.locationId) {
      return NextResponse.json({ message: "Votre compte doit être affecté à un lieu." }, { status: 403 });
    }

    const body: unknown = await request.json().catch(() => null)
    const data = body && typeof body === "object"
      ? body as Record<string, unknown>
      : {};

    const text = (key: string) =>
      typeof data[key] === "string" ? (data[key] as string).trim() : "";

    const productName = text("productName");
    const productType = text("productType");
    const description = text("description");
    const vehicleId = text("vehicleId");
    const notes = text("notes");
    const tonnageText = text("tonnage");
    const amountDueText = text("amountDue");
    const assignedAtText = text("assignedAt");

    if (!productName || !productType || !vehicleId ||
        !tonnageText || !amountDueText) {
      return NextResponse.json(
        { message: "Nom, type, tonnage, montant à régler et véhicule obligatoires." },
        { status: 400 }
      );
    }

    if (productName.length > 150 || productType.length > 100 ||
        description.length > 2000 || notes.length > 2000) {
      return NextResponse.json({ message: "Un champ est trop long." }, { status: 400 });
    }

    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(tonnageText) ||
        !Number.isFinite(Number(tonnageText)) || Number(tonnageText) <= 0) {
      return NextResponse.json({ message: "Tonnage invalide." }, { status: 400 });
    }

    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(amountDueText) ||
        !Number.isFinite(Number(amountDueText)) || Number(amountDueText) <= 0) {
      return NextResponse.json(
        { message: "Le montant à régler doit être positif et comporter au maximum deux décimales." },
        { status: 400 }
      );
    }

    let assignedAt: Date | undefined;

    if (assignedAtText) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(assignedAtText)) {
        return NextResponse.json({ message: "Date invalide." }, { status: 400 });
      }

      assignedAt = new Date(`${assignedAtText}T12:00:00.000Z`);

      if (Number.isNaN(assignedAt.getTime()) ||
          assignedAt.toISOString().slice(0, 10) !== assignedAtText) {
        return NextResponse.json({ message: "Date invalide." }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.findFirst({
        where: {
          id: vehicleId,
          locationId: profile.locationId,
          isActive: true,
          driver: { isActive: true, locationId: profile.locationId },
        },
        select: { id: true },
      });

      if (!vehicle) return null;

      const product = await tx.product.create({
        data: {
          name: productName,
          type: productType,
          tonnage: Number(tonnageText),
          description: description || null,
        },
        select: { id: true },
      });

      const transport = await tx.transportAssignment.create({
        data: {
          productId: product.id,
          supervisorId: profile.id,
          locationId: profile.locationId!,
          vehicleId: vehicle.id,
          amountDue: amountDueText,
          ...(assignedAt ? { assignedAt } : {}),
          notes: notes || null,
        },
        select: {
          id: true,
          assignedAt: true,
          status: true,
          amountDue: true,
          product: { select: { name: true, type: true, tonnage: true } },
          vehicle: { select: { licensePlate: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "TransportAssignment",
          entityId: transport.id,
          details: {
            locationId: profile.locationId,
            amountDue: amountDueText,
          },
        },
      });

      return transport;
    });

    if (!result) {
      return NextResponse.json(
        { message: "Le véhicule est inactif ou n'appartient pas à votre lieu." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      transport: {
        ...result,
        amountDue: String(result.amountDue),
        product: { ...result.product, tonnage: String(result.product.tonnage) },
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Transport creation failed:", error);
    return NextResponse.json({ message: "Impossible de créer le transport." }, { status: 500 });
  }
}