import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isProductType } from "@/lib/product-types";
import {
  checkPayment,
  isPaymentMethod,
  parseCents,
  toDecimal,
} from "@/lib/payment-rules";
import { readPassagePayload, AttachmentValidationError } from "@/lib/passage-attachments";

// Enregistre un passage ET son paiement en une seule opération :
// pas de paiement valide, pas de passage.
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
      select: {
        id: true,
        locationId: true,
        assignedLocation: { select: { deletedAt: true } },
      },
    });

    if (!profile?.locationId) {
      return NextResponse.json({ message: "Votre compte doit être affecté à un lieu." }, { status: 403 });
    }
    if (profile.assignedLocation?.deletedAt) {
      return NextResponse.json({ message: "Votre lieu est archivé. Contactez l'administrateur." }, { status: 403 });
    }

    const locationId = profile.locationId;
    const payload = await readPassagePayload(request);
    const data = payload.data;
    const { pjt, quittance } = payload;
    const text = (key: string) =>
      typeof data[key] === "string" ? (data[key] as string).trim() : "";

    const productName = text("productName");
    const productType = text("productType");
    const origin = text("origin");
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
    const tonnageText = text("tonnage");
    const assignedAtText = text("assignedAt");
    const method = text("paymentMethod");
    const reference = text("reference");
    const dueText = text("amountDue");
    const receivedText = text("amountReceived");

    if (!productName || !productType || !tonnageText || !origin || !destination) {
      return NextResponse.json(
        { message: "Produit, type, tonnage, origine et destination sont obligatoires." },
        { status: 400 },
      );
    }
    if (!isProductType(productType)) {
      return NextResponse.json({ message: "Choisissez une catégorie de produit valide." }, { status: 400 });
    }

    if (
      productName.length > 150 || productType.length > 100 ||
      origin.length > 150 || destination.length > 150 ||
      vehicleInfo.length > 200 || driverName.length > 150 ||
      vehicleRegistration.length > 40 || vehicleCharacteristics.length > 200 ||
      driverLicenseNumber.length > 80 ||
      notes.length > 2000 || reference.length > 150 ||
      nomOp.length > 150 || nomSoc.length > 200 || coli.length > 100 ||
      nQuittance.length > 100
    ) {
      return NextResponse.json({ message: "Un champ est trop long." }, { status: 400 });
    }

    if (nbColiText && (!/^\d{1,9}$/.test(nbColiText) || !Number.isSafeInteger(nbColi) || (nbColi as number) < 0)) {
      return NextResponse.json({ message: "Le nombre de colis doit être un entier positif ou nul." }, { status: 400 });
    }

    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(tonnageText) || Number(tonnageText) <= 0) {
      return NextResponse.json({ message: "Tonnage invalide." }, { status: 400 });
    }

    if (!isPaymentMethod(method)) {
      return NextResponse.json({ message: "Mode de paiement invalide : Espèces ou Mobile Money uniquement." }, { status: 400 });
    }

    const dueCents = parseCents(dueText);
    if (dueCents === null || dueCents <= 0) {
      return NextResponse.json(
        { message: "Le montant à payer doit être positif, avec au maximum deux décimales." },
        { status: 400 },
      );
    }

    const receivedCents = parseCents(receivedText);
    if (receivedCents === null || receivedCents <= 0) {
      return NextResponse.json({ message: "Montant reçu invalide." }, { status: 400 });
    }

    const payment = checkPayment({ method, reference, dueCents, receivedCents });
    if (!payment.ok) {
      return NextResponse.json(
        {
          message:
            payment.error === "INSUFFICIENT"
              ? "Passage refusé : le montant reçu est inférieur au montant à payer."
              : "Pour ce mode, le montant reçu doit être exact et une référence est obligatoire.",
        },
        { status: 400 },
      );
    }

    let assignedAt: Date | undefined;
    if (assignedAtText) {
      assignedAt = /^\d{4}-\d{2}-\d{2}$/.test(assignedAtText)
        ? new Date(`${assignedAtText}T12:00:00.000Z`)
        : undefined;

      if (!assignedAt || Number.isNaN(assignedAt.getTime()) ||
          assignedAt.toISOString().slice(0, 10) !== assignedAtText) {
        return NextResponse.json({ message: "Date invalide." }, { status: 400 });
      }
    }

    const amountDue = toDecimal(dueCents);
    const amountReceived = toDecimal(receivedCents);
    const changeReturned = toDecimal(payment.changeCents);

    const passage = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: { name: productName, type: productType, tonnage: tonnageText },
        select: { id: true },
      });

      const created = await tx.passage.create({
        data: {
          productId: product.id,
          supervisorId: profile.id,
          locationId,
          origin,
          destination,
          vehicleInfo: vehicleInfo || null,
          driverName: driverName || null,
          vehicleRegistration: vehicleRegistration || null,
          vehicleCharacteristics: vehicleCharacteristics || null,
          driverLicenseNumber: driverLicenseNumber || null,
          notes: notes || null,
          nomOp: nomOp || null,
          nomSoc: nomSoc || null,
          coli: coli || null,
          nbColi,
          nQuittance: nQuittance || null,
          pjt: pjt ?? null,
          quittance: quittance ?? null,
          ...(assignedAt ? { assignedAt } : {}),
          payment: {
            create: {
              recordedById: user.id,
              paymentMethod: method,
              reference: reference || null,
              amountDue,
              amountReceived,
              changeReturned,
            },
          },
        },
        select: {
          id: true,
          assignedAt: true,
          origin: true,
          destination: true,
          product: { select: { name: true, type: true, tonnage: true } },
          payment: {
            select: {
              id: true,
              paymentMethod: true,
              reference: true,
              amountDue: true,
              amountReceived: true,
              changeReturned: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "Passage",
          entityId: created.id,
          details: {
            locationId,
            productName,
            tonnage: tonnageText,
            origin,
            destination,
            vehicleInfo,
            vehicleRegistration,
            vehicleCharacteristics,
            driverName,
            driverLicenseNumber,
            nomOp: nomOp || null,
            nomSoc: nomSoc || null,
            coli: coli || null,
            nbColi,
            nQuittance: nQuittance || null,
            attachmentsUpdated: { pjt: Boolean(pjt), quittance: Boolean(quittance) },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "Payment",
          entityId: created.payment?.id ?? null,
          details: {
            passageId: created.id,
            locationId,
            paymentMethod: method,
            reference: reference || null,
            amountDue,
            amountReceived,
            changeReturned,
          },
        },
      });

      await tx.recordRevision.create({
        data: {
          entityType: "Passage",
          entityId: created.id,
          version: 1,
          action: "CREATE",
          actorId: user.id,
          snapshot: {
            passage: {
              id: created.id, assignedAt: created.assignedAt.toISOString(),
              origin, destination, vehicleInfo: vehicleInfo || null,
              vehicleRegistration: vehicleRegistration || null,
              vehicleCharacteristics: vehicleCharacteristics || null,
              driverName: driverName || null, driverLicenseNumber: driverLicenseNumber || null,
              notes: notes || null,
              nomOp: nomOp || null, nomSoc: nomSoc || null, coli: coli || null,
              nbColi, nQuittance: nQuittance || null, deletedAt: null,
            },
            product: {
              id: product.id, name: productName, type: productType,
              tonnage: tonnageText, description: null, deletedAt: null,
            },
            payment: {
              id: created.payment?.id ?? null, paymentMethod: method,
              reference: reference || null, amountDue: String(amountDue),
              amountReceived: String(amountReceived), changeReturned: String(changeReturned),
              deletedAt: null,
            },
          },
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Passage et paiement enregistrés.",
        passage: {
          ...passage,
          product: { ...passage.product, tonnage: String(passage.product.tonnage) },
          payment: passage.payment && {
            ...passage.payment,
            amountDue: String(passage.payment.amountDue),
            amountReceived: String(passage.payment.amountReceived),
            changeReturned: String(passage.payment.changeReturned),
          },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AttachmentValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error("Passage creation failed:", error);
    return NextResponse.json({ message: "Impossible d'enregistrer le passage." }, { status: 500 });
  }
}
