import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getCurrentUser();

  if (!admin) {
    return NextResponse.json(
      { message: "Connexion requise." },
      { status: 401 }
    );
  }

  if (admin.role !== "ADMIN") {
    return NextResponse.json(
      { message: "Seul un administrateur peut modifier une affectation." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { message: "Requete invalide." },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;
    const locationId =
      typeof data.locationId === "string" ? data.locationId.trim() : "";

    if (!locationId) {
      return NextResponse.json(
        { message: "Selectionnez un lieu." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const supervisor = await tx.supervisor.findUnique({
        where: { id },
        select: {
          id: true,
          locationId: true,
          location: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      if (!supervisor) {
        return { error: "SUPERVISOR_NOT_FOUND" as const };
      }

      const location = await tx.location.findUnique({
        where: { id: locationId },
        select: { id: true, name: true },
      });

      if (!location) {
        return { error: "LOCATION_NOT_FOUND" as const };
      }

      if (supervisor.locationId === location.id) {
        return {
          error: "ALREADY_ASSIGNED" as const,
          locationName: location.name,
        };
      }

      const previousLocationId = supervisor.locationId;

      const updated = await tx.supervisor.update({
        where: { id: supervisor.id },
        data: {
          locationId: location.id,
          location: location.name,
        },
        select: {
          id: true,
          locationId: true,
          location: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: "CHANGE_LOCATION",
          entityType: "Supervisor",
          entityId: supervisor.id,
          details: {
            previousLocationId,
            newLocationId: location.id,
            newLocationName: location.name,
            email: supervisor.user.email,
            historyPreserved: true,
          },
        },
      });

      return { supervisor: updated };
    });

    if ("error" in result) {
      if (result.error === "SUPERVISOR_NOT_FOUND") {
        return NextResponse.json(
          { message: "Regisseur introuvable." },
          { status: 404 }
        );
      }

      if (result.error === "LOCATION_NOT_FOUND") {
        return NextResponse.json(
          { message: "Le lieu selectionne n'existe pas." },
          { status: 404 }
        );
      }

      if (result.error === "ALREADY_ASSIGNED") {
        return NextResponse.json(
          {
            message: `Ce regisseur est deja affecte a ${result.locationName}.`,
          },
          { status: 409 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Affectation modifiee. L'historique des anciennes operations est conserve.",
      supervisor: result.supervisor,
    });
  } catch (error) {
    console.error("Supervisor location change failed:", error);

    return NextResponse.json(
      { message: "Impossible de modifier le lieu d'affectation." },
      { status: 500 }
    );
  }
}