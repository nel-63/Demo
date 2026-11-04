import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectImageContentType } from "@/lib/passage-attachments";

type Context = { params: Promise<{ id: string; kind: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERVISOR") {
    return NextResponse.json({ message: "Accès refusé." }, { status: 403 });
  }

  const { id, kind } = await context.params;
  if (kind !== "pjt" && kind !== "quittance") {
    return NextResponse.json({ message: "Type de pièce jointe invalide." }, { status: 404 });
  }

  try {
    const passage = await prisma.passage.findUnique({
      where: { id },
      select: { id: true, locationId: true, deletedAt: true },
    });
    if (!passage || (user.role === "SUPERVISOR" && passage.deletedAt)) {
      return NextResponse.json({ message: "Pièce jointe introuvable." }, { status: 404 });
    }

    if (user.role === "SUPERVISOR") {
      const profile = await prisma.supervisor.findUnique({
        where: { userId: user.id },
        select: { locationId: true, assignedLocation: { select: { deletedAt: true } } },
      });
      if (
        !profile?.locationId ||
        profile.locationId !== passage.locationId ||
        profile.assignedLocation?.deletedAt
      ) {
        return NextResponse.json({ message: "Pièce jointe introuvable." }, { status: 404 });
      }
    }

    let bytes: Uint8Array | null = null;
    if (kind === "pjt") {
      const attachment = await prisma.passage.findUnique({ where: { id }, select: { pjt: true } });
      bytes = attachment?.pjt ?? null;
    } else {
      const attachment = await prisma.passage.findUnique({ where: { id }, select: { quittance: true } });
      bytes = attachment?.quittance ?? null;
    }

    if (!bytes) return NextResponse.json({ message: "Cette image n'existe pas." }, { status: 404 });
    const contentType = detectImageContentType(bytes);
    if (!contentType) {
      return NextResponse.json({ message: "Le fichier enregistré n'est pas une image valide." }, { status: 415 });
    }

    const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${kind}.${extension}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Passage attachment retrieval failed:", error);
    return NextResponse.json({ message: "Impossible de récupérer cette image." }, { status: 500 });
  }
}
