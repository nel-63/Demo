import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const METHODS = ["CASH", "BANK_TRANSFER", "CHECK", "MOBILE_MONEY", "OTHER"] as const;

function parseCents(value: string): number | null {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

function decimal(cents: number) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "SUPERVISOR") {
    return NextResponse.json({ message: "Accès réservé aux régisseurs." }, { status: 403 });
  }

  try {
    const profile = await prisma.supervisor.findUnique({
      where: { userId: user.id },
      select: { id: true, locationId: true },
    });
    if (!profile?.locationId) {
      return NextResponse.json({ message: "Aucun lieu affecté." }, { status: 403 });
    }

    const body: unknown = await request.json().catch(() => null);
    const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const text = (key: string) => typeof data[key] === "string" ? (data[key] as string).trim() : "";

    const assignmentId = text("assignmentId");
    const method = text("paymentMethod");
    const reference = text("reference");
    const receivedText = text("amountReceived");

    if (!assignmentId || !receivedText) {
      return NextResponse.json({ message: "Transport et montant reçu obligatoires." }, { status: 400 });
    }
    if (!METHODS.some((item) => item === method)) {
      return NextResponse.json({ message: "Mode de paiement invalide." }, { status: 400 });
    }
    if (reference.length > 150) {
      return NextResponse.json({ message: "Référence trop longue." }, { status: 400 });
    }

    const receivedCents = parseCents(receivedText);
    if (receivedCents === null || receivedCents <= 0) {
      return NextResponse.json({ message: "Montant reçu invalide." }, { status: 400 });
    }

    const outcome = await prisma.$transaction(async (tx) => {
      // Verrou de ligne : un paiement et une annulation du meme transport sont serialises.
      await tx.$queryRaw`SELECT "id" FROM "TransportAssignment" WHERE "id" = ${assignmentId} FOR UPDATE`;
      const assignment = await tx.transportAssignment.findFirst({
        where: {
          id: assignmentId,
          locationId: profile.locationId,
          status: { not: "CANCELLED" },
        },
        select: {
          id: true,
          amountDue: true,
          payment: { select: { id: true } },
        },
      });

      if (!assignment) return { error: "NOT_FOUND" as const };
      if (assignment.amountDue === null) return { error: "NO_AMOUNT" as const };
      if (assignment.payment) return { error: "ALREADY_PAID" as const };

      const dueCents = parseCents(String(assignment.amountDue));
      if (dueCents === null || dueCents <= 0) return { error: "INVALID_AMOUNT" as const };

      let changeCents = 0;

      if (method === "CASH") {
        if (receivedCents < dueCents) return { error: "INSUFFICIENT" as const };
        changeCents = receivedCents - dueCents;
      } else {
        if (!reference || receivedCents !== dueCents) {
          return { error: "EXACT_REQUIRED" as const };
        }
      }

      const payment = await tx.payment.create({
        data: {
          assignmentId: assignment.id,
          recordedById: user.id,
          paymentMethod: method as (typeof METHODS)[number],
          reference: reference || null,
          amountDue: decimal(dueCents),
          amountReceived: decimal(receivedCents),
          changeReturned: decimal(changeCents),
        },
        select: {
          id: true,
          amountDue: true,
          amountReceived: true,
          changeReturned: true,
          paymentMethod: true,
          reference: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "Payment",
          entityId: payment.id,
          details: { assignmentId, locationId: profile.locationId },
        },
      });

      return { payment };
    });

    if ("error" in outcome) {
      const messages: Record<string, string> = {
        NOT_FOUND: "Transport introuvable ou non rattaché à votre lieu.",
        NO_AMOUNT: "Le montant officiel de ce transport n'est pas encore défini.",
        ALREADY_PAID: "Ce transport a déjà été payé intégralement.",
        INVALID_AMOUNT: "Le montant officiel du transport est invalide.",
        INSUFFICIENT: "Paiement refusé : le montant reçu est inférieur au montant dû.",
        EXACT_REQUIRED: "Le paiement doit être intégral et une référence est obligatoire pour ce mode.",
      };
      const status = outcome.error === "NOT_FOUND" ? 404 :
        outcome.error === "ALREADY_PAID" ? 409 : 400;
      return NextResponse.json({ message: messages[outcome.error as keyof typeof messages] ?? "Une erreur est survenue." }, { status });
    }

    return NextResponse.json({
      ok: true,
      message: "Paiement intégral enregistré.",
      payment: {
        ...outcome.payment,
        amountDue: String(outcome.payment.amountDue),
        amountReceived: String(outcome.payment.amountReceived),
        changeReturned: String(outcome.payment.changeReturned),
      },
    }, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code : undefined;

    if (code === "P2002") {
      return NextResponse.json({ message: "Ce transport a déjà été payé." }, { status: 409 });
    }

    console.error("Payment creation failed:", error);
    return NextResponse.json({ message: "Impossible d'enregistrer le paiement." }, { status: 500 });
  }
}
