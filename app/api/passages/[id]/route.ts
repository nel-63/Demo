import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { checkPayment, isPaymentMethod, parseCents, toDecimal } from "@/lib/payment-rules";
import { isProductType } from "@/lib/product-types";
import type { Prisma } from "@/app/generated/prisma/client";
import { readPassagePayload, AttachmentValidationError } from "@/lib/passage-attachments";
import { parseDateOnly } from "@/lib/date-only";

type Context = { params: Promise<{ id: string }> };
type PassageSnapshot = {
  passage: Prisma.InputJsonObject;
  product: Prisma.InputJsonObject;
  payment: Prisma.InputJsonObject | null;
};
function snapshotOf(record: {
  id: string; assignedAt: Date; origin: string; destination: string;
  vehicleInfo: string | null; driverName: string | null; vehicleRegistration: string | null;
  vehicleCharacteristics: string | null; driverLicenseNumber: string | null; notes: string | null;
  nomOp: string | null; nomSoc: string | null; coli: string | null; nbColi: number | null;
  nQuittance: string | null; dateQuittance: Date | null; deletedAt: Date | null;
  product: { id: string; name: string; type: string; tonnage: unknown; description: string | null; deletedAt: Date | null };
  payment: null | { id: string; paymentMethod: string; reference: string | null; amountDue: unknown; amountReceived: unknown; changeReturned: unknown; deletedAt: Date | null };
}): PassageSnapshot {
  return {
    passage: {
      id: record.id, assignedAt: record.assignedAt.toISOString(), origin: record.origin,
      destination: record.destination, vehicleInfo: record.vehicleInfo,
      driverName: record.driverName, vehicleRegistration: record.vehicleRegistration,
      vehicleCharacteristics: record.vehicleCharacteristics,
      driverLicenseNumber: record.driverLicenseNumber, notes: record.notes,
      nomOp: record.nomOp, nomSoc: record.nomSoc, coli: record.coli,
      nbColi: record.nbColi, nQuittance: record.nQuittance,
      dateQuittance: record.dateQuittance?.toISOString().slice(0, 10) ?? null,
      deletedAt: record.deletedAt?.toISOString() ?? null,
    },
    product: {
      id: record.product.id, name: record.product.name, type: record.product.type,
      tonnage: String(record.product.tonnage), description: record.product.description,
      deletedAt: record.product.deletedAt?.toISOString() ?? null,
    },
    payment: record.payment ? {
      id: record.payment.id, paymentMethod: record.payment.paymentMethod,
      reference: record.payment.reference, amountDue: String(record.payment.amountDue),
      amountReceived: String(record.payment.amountReceived),
      changeReturned: String(record.payment.changeReturned),
      deletedAt: record.payment.deletedAt?.toISOString() ?? null,
    } : null,
  };
}

async function recordRevision(
  tx: Prisma.TransactionClient,
  actorId: string,
  passageId: string,
  action: "UPDATE" | "DELETE",
  before: PassageSnapshot,
  after: PassageSnapshot,
) {
  let latest = await tx.recordRevision.findFirst({
    where: { entityType: "Passage", entityId: passageId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  // Legacy passages get an immutable baseline before the first change.
  if (!latest) {
    await tx.recordRevision.create({
      data: {
        entityType: "Passage", entityId: passageId, version: 1,
        action: "BASELINE", actorId, snapshot: before,
      },
    });
    latest = { version: 1 };
  }

  await tx.recordRevision.create({
    data: {
      entityType: "Passage", entityId: passageId,
      version: latest.version + 1, action, actorId,
      snapshot: { before, after },
    },
  });
}

async function getSupervisorLocationId(userId: string): Promise<string | null> {
  const profile = await prisma.supervisor.findUnique({
    where: { userId },
    select: { locationId: true },
  });
  return profile?.locationId ?? null;
}

async function loadForUpdate(tx: Prisma.TransactionClient, id: string) {
  return tx.passage.findUnique({
    where: { id },
    select: {
      id: true, productId: true, locationId: true, assignedAt: true, origin: true, destination: true,
      vehicleInfo: true, driverName: true, vehicleRegistration: true, vehicleCharacteristics: true,
      driverLicenseNumber: true, notes: true, nomOp: true, nomSoc: true, coli: true,
      nbColi: true, nQuittance: true, dateQuittance: true, deletedAt: true,
      product: { select: { id: true, name: true, type: true, tonnage: true, description: true, deletedAt: true } },
      payment: { select: { id: true, paymentMethod: true, reference: true, amountDue: true, amountReceived: true, changeReturned: true, deletedAt: true } },
    },
  });
}

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "SUPERVISOR") return NextResponse.json({ message: "Modification réservée aux régisseurs." }, { status: 403 });

  try {
    const supervisorLocationId = await getSupervisorLocationId(user.id);
    if (!supervisorLocationId) return NextResponse.json({ message: "Votre compte n'est affecté à aucun lieu." }, { status: 403 });
    const { id } = await context.params;
    const payload = await readPassagePayload(request);
    const data = payload.data;
    const { pjt, quittance } = payload;
    const text = (key: string) => typeof data[key] === "string" ? (data[key] as string).trim() : "";

    const productName = text("productName");
    const productType = text("productType");
    const tonnage = text("tonnage");
    const origin = text("origin");
    const assignedAtText = text("assignedAt");
    const destination = text("destination");
    const vehicleInfo = text("vehicleInfo");
    const driverName = text("driverName");
    const vehicleRegistration = text("vehicleRegistration");
    const vehicleCharacteristics = text("vehicleCharacteristics");
    const driverLicenseNumber = text("driverLicenseNumber");
    const notes = text("notes");
    const nomOp = text("nomOp");
    const nomSoc = text("nomSoc");
    const coli = text("coli");
    const nbColiText = text("nbColi");
    const nbColi = nbColiText ? Number(nbColiText) : null;
    const nQuittance = text("nQuittance");
    const dateQuittanceText = text("dateQuittance");
    const dateQuittance = dateQuittanceText ? parseDateOnly(dateQuittanceText) : null;
    const method = text("paymentMethod");
    const reference = text("reference");
    const dueText = text("amountDue");
    const receivedText = text("amountReceived");

    if (!productName || !productType || !tonnage || !origin || !destination) {
      return NextResponse.json({ message: "Produit, type, tonnage, origine et destination sont obligatoires." }, { status: 400 });
    }
    if (productName.length > 150 || productType.length > 100 || origin.length > 150 ||
        destination.length > 150 || vehicleInfo.length > 200 || driverName.length > 150 ||
        vehicleRegistration.length > 40 || vehicleCharacteristics.length > 200 ||
        driverLicenseNumber.length > 80 || notes.length > 2000 || reference.length > 150 ||
        nomOp.length > 150 || nomSoc.length > 200 || coli.length > 100 || nQuittance.length > 100) {
      return NextResponse.json({ message: "Un champ dépasse la longueur autorisée." }, { status: 400 });
    }
    if (nbColiText && (!/^\d{1,9}$/.test(nbColiText) || !Number.isSafeInteger(nbColi) || (nbColi as number) < 0)) {
      return NextResponse.json({ message: "Le nombre de colis doit être un entier positif ou nul." }, { status: 400 });
    }
    if (dateQuittanceText && !dateQuittance) {
      return NextResponse.json({ message: "Date de quittance invalide." }, { status: 400 });
    }
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(tonnage) || Number(tonnage) <= 0) {
      return NextResponse.json({ message: "Tonnage invalide." }, { status: 400 });
    }
    if (!isPaymentMethod(method)) return NextResponse.json({ message: "Mode de paiement invalide : Espèces ou Mobile Money uniquement." }, { status: 400 });
    const assignedAt = /^\d{4}-\d{2}-\d{2}$/.test(assignedAtText) ? new Date(`${assignedAtText}T12:00:00.000Z`) : null;
    if (!assignedAt || Number.isNaN(assignedAt.getTime()) || assignedAt.toISOString().slice(0, 10) !== assignedAtText) {
      return NextResponse.json({ message: "Date de passage invalide." }, { status: 400 });
    }
    const dueCents = parseCents(dueText);
    const receivedCents = parseCents(receivedText);
    if (dueCents === null || dueCents <= 0 || receivedCents === null || receivedCents <= 0) {
      return NextResponse.json({ message: "Montants de paiement invalides." }, { status: 400 });
    }
    const check = checkPayment({ method, reference, dueCents, receivedCents });
    if (!check.ok) return NextResponse.json({
      message: check.error === "INSUFFICIENT" ? "Le montant reçu est inférieur au montant dû." :
        "Le paiement doit être exact et comporter une référence pour ce mode.",
    }, { status: 400 });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "TransportAssignment" WHERE "id" = ${id} FOR UPDATE`;
      const current = await loadForUpdate(tx, id);
      if (!current || current.deletedAt || current.locationId !== supervisorLocationId) return null;
      if (!current.payment) return null;
      if (!isProductType(productType) && productType !== current.product.type) {
        return { error: "INVALID_PRODUCT_TYPE" as const };
      }

      const before = snapshotOf(current);
      const paymentData = {
        paymentMethod: method, reference: reference || null,
        amountDue: toDecimal(dueCents), amountReceived: toDecimal(receivedCents),
        changeReturned: toDecimal(check.changeCents),
      };

      await tx.product.update({
        where: { id: current.productId },
        data: { name: productName, type: productType, tonnage },
      });
      await tx.passage.update({
        where: { id },
        data: {
          origin, destination, assignedAt, vehicleInfo: vehicleInfo || null, driverName: driverName || null,
          vehicleRegistration: vehicleRegistration || null,
          vehicleCharacteristics: vehicleCharacteristics || null,
          driverLicenseNumber: driverLicenseNumber || null, notes: notes || null,
          nomOp: nomOp || null, nomSoc: nomSoc || null, coli: coli || null,
          nbColi, nQuittance: nQuittance || null, dateQuittance,
          ...(pjt ? { pjt: new Uint8Array(pjt) } : {}),
          ...(quittance ? { quittance: new Uint8Array(quittance) } : {}),
        },
      });
      await tx.payment.update({ where: { id: current.payment.id }, data: paymentData });

      const fresh = await loadForUpdate(tx, id);
      if (!fresh) throw new Error("Passage disappeared during update.");
      const after = snapshotOf(fresh);
      await recordRevision(tx, user.id, id, "UPDATE", before, after);
      await tx.auditLog.create({
        data: {
          userId: user.id, action: "UPDATE", entityType: "Passage", entityId: id,
          details: { before, after, attachmentsUpdated: { pjt: Boolean(pjt), quittance: Boolean(quittance) } },
        },
      });
      return { snapshot: after };
    });

    if (!updated) return NextResponse.json({ message: "Passage introuvable, supprimé, situé hors de votre lieu ou sans paiement." }, { status: 404 });
    if ("error" in updated) {
      return NextResponse.json({ message: "Choisissez une catégorie de produit valide." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Passage modifié. La version précédente est conservée." });
  } catch (error) {
    if (error instanceof AttachmentValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error("Passage update failed:", error);
    return NextResponse.json({ message: "Impossible de modifier le passage." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "SUPERVISOR") return NextResponse.json({ message: "Suppression réservée aux régisseurs." }, { status: 403 });

  try {
    const supervisorLocationId = await getSupervisorLocationId(user.id);
    if (!supervisorLocationId) return NextResponse.json({ message: "Votre compte n'est affecté à aucun lieu." }, { status: 403 });
    const { id } = await context.params;
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "TransportAssignment" WHERE "id" = ${id} FOR UPDATE`;
      const current = await loadForUpdate(tx, id);
      if (!current || current.deletedAt || current.locationId !== supervisorLocationId) return false;

      const before = snapshotOf(current);
      const now = new Date();
      await tx.passage.update({ where: { id }, data: { deletedAt: now, deletedById: user.id } });
      await tx.product.update({ where: { id: current.productId }, data: { deletedAt: now, deletedById: user.id } });
      if (current.payment) {
        await tx.payment.update({ where: { id: current.payment.id }, data: { deletedAt: now, deletedById: user.id } });
      }
      const fresh = await loadForUpdate(tx, id);
      if (!fresh) throw new Error("Passage disappeared during deletion.");
      const after = snapshotOf(fresh);
      await recordRevision(tx, user.id, id, "DELETE", before, after);
      await tx.auditLog.create({
        data: { userId: user.id, action: "DELETE", entityType: "Passage", entityId: id, details: { before, after, deletedAt: now.toISOString() } },
      });
      return true;
    });

    if (!result) return NextResponse.json({ message: "Passage introuvable, déjà supprimé ou situé hors de votre lieu." }, { status: 404 });
    return NextResponse.json({ ok: true, message: "Passage supprimé logiquement. Les données restent conservées." });
  } catch (error) {
    console.error("Passage deletion failed:", error);
    return NextResponse.json({ message: "Impossible de supprimer le passage." }, { status: 500 });
  }
}
