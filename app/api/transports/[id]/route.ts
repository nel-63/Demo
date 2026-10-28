import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type TransportStatusValue =
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

const VALID_STATUSES: TransportStatusValue[] = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentification requise." },
        { status: 401 },
      );
    }

    if (currentUser.role !== "SUPERVISOR") {
      return NextResponse.json(
        { error: "Accès réservé aux superviseurs." },
        { status: 403 },
      );
    }

    const { id } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Données JSON invalides." },
        { status: 400 },
      );
    }

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Données invalides." },
        { status: 400 },
      );
    }

    const payload = body as Record<string, unknown>;
    const hasAmountDue = Object.prototype.hasOwnProperty.call(payload, "amountDue");
    const hasStatus = Object.prototype.hasOwnProperty.call(payload, "status");

    if (hasAmountDue === hasStatus) {
      return NextResponse.json(
        { error: "Indiquez soit un montant, soit un nouveau statut." },
        { status: 400 },
      );
    }

    const profile = await prisma.supervisor.findUnique({
      where: { userId: currentUser.id },
      select: { id: true, locationId: true },
    });

    if (!profile || !profile.locationId) {
      return NextResponse.json(
        { error: "Aucun emplacement n'est affecté à ce superviseur." },
        { status: 403 },
      );
    }

    // Fixation unique du montant officiel d'un ancien transport.
    if (hasAmountDue) {
      const amountText = String(payload.amountDue ?? "").trim();

      if (
        !/^\d{1,12}(?:\.\d{1,2})?$/.test(amountText) ||
        !Number.isFinite(Number(amountText)) ||
        Number(amountText) <= 0
      ) {
        return NextResponse.json(
          { error: "Le montant doit être positif, avec au maximum deux décimales." },
          { status: 400 },
        );
      }

      return await prisma.$transaction(async (tx) => {
        // Verrou de ligne : serialise avec un paiement ou un autre changement simultane.
        await tx.$queryRaw`SELECT "id" FROM "TransportAssignment" WHERE "id" = ${id} FOR UPDATE`;

        const transport = await tx.transportAssignment.findFirst({
          where: { id, locationId: profile.locationId },
          include: { payment: { select: { id: true } } },
        });

        if (!transport) {
          return NextResponse.json(
            { error: "Transport introuvable dans votre emplacement." },
            { status: 404 },
          );
        }

        if (transport.status === "CANCELLED") {
          return NextResponse.json(
            { error: "Un transport annulé ne peut pas être modifié." },
            { status: 409 },
          );
        }

        if (transport.payment) {
          return NextResponse.json(
            { error: "Le montant ne peut pas être changé après un paiement." },
            { status: 409 },
          );
        }

        if (transport.amountDue !== null) {
          return NextResponse.json(
            { error: "Le montant officiel est déjà fixé." },
            { status: 409 },
          );
        }

        const updated = await tx.transportAssignment.update({
          where: { id: transport.id },
          data: { amountDue: amountText },
        });

        await tx.auditLog.create({
          data: {
            userId: currentUser.id,
            action: "SET_TRANSPORT_AMOUNT",
            entityType: "TransportAssignment",
            entityId: transport.id,
            details: {
              amountDue: amountText,
              locationId: profile.locationId,
            },
          },
        });

        return NextResponse.json({ transport: updated });
      });
    }

    // Changement de statut.
    const requestedStatus = payload.status;

    if (
      typeof requestedStatus !== "string" ||
      !VALID_STATUSES.includes(requestedStatus as TransportStatusValue)
    ) {
      return NextResponse.json(
        { error: "Statut de transport invalide." },
        { status: 400 },
      );
    }

    const nextStatus = requestedStatus as TransportStatusValue;

    return await prisma.$transaction(async (tx) => {
      // Verrou de ligne : serialise avec un paiement ou un autre changement simultane.
      await tx.$queryRaw`SELECT "id" FROM "TransportAssignment" WHERE "id" = ${id} FOR UPDATE`;

      const transport = await tx.transportAssignment.findFirst({
        where: { id, locationId: profile.locationId },
        include: { payment: { select: { id: true } } },
      });

      if (!transport) {
        return NextResponse.json(
          { error: "Transport introuvable dans votre emplacement." },
          { status: 404 },
        );
      }

      const currentStatus = transport.status as TransportStatusValue;

      const allowed =
        (currentStatus === "PLANNED" &&
          (nextStatus === "IN_PROGRESS" || nextStatus === "CANCELLED")) ||
        (currentStatus === "IN_PROGRESS" &&
          (nextStatus === "COMPLETED" || nextStatus === "CANCELLED"));

      if (!allowed) {
        return NextResponse.json(
          {
            error:
              "Transition impossible : un transport planifié peut démarrer ou être annulé ; un transport en cours peut être terminé ou annulé.",
          },
          { status: 409 },
        );
      }

      if (nextStatus === "CANCELLED" && transport.payment) {
        return NextResponse.json(
          {
            error:
              "Ce transport est déjà payé. Son annulation est interdite sans procédure comptable adaptée.",
          },
          { status: 409 },
        );
      }

      const updated = await tx.transportAssignment.update({
        where: { id: transport.id },
        data: { status: nextStatus },
      });

      await tx.auditLog.create({
        data: {
          userId: currentUser.id,
          action: "CHANGE_TRANSPORT_STATUS",
          entityType: "TransportAssignment",
          entityId: transport.id,
          details: {
            previousStatus: currentStatus,
            newStatus: nextStatus,
            locationId: profile.locationId,
          },
        },
      });

      return NextResponse.json({ transport: updated });
    });
  } catch (error) {
    console.error("Erreur PATCH transport :", error);

    return NextResponse.json(
      { error: "Une erreur est survenue lors de la modification du transport." },
      { status: 500 },
    );
  }
}
