import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getDetails, isAdminOnlyKind, isDetailKind } from "@/lib/details";

// Contenu du panneau de détails ouvert depuis une carte statistique.
export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  }

  const { kind } = await context.params;

  if (!isDetailKind(kind)) {
    return NextResponse.json({ message: "Détail introuvable." }, { status: 404 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);

  try {
    if (user.role === "ADMIN") {
      const requested = (url.searchParams.get("locationId") ?? "").trim();
      const details = await getDetails(kind, { admin: true, locationId: requested || null }, q);
      return NextResponse.json(details);
    }

    if (user.role === "SUPERVISOR" && !isAdminOnlyKind(kind)) {
      const profile = await prisma.supervisor.findUnique({
        where: { userId: user.id },
        select: { locationId: true },
      });

      // Le lieu vient toujours du profil : un paramètre `locationId` envoyé par le client est ignoré.
      if (!profile?.locationId) {
        return NextResponse.json({ message: "Aucun lieu affecté." }, { status: 403 });
      }

      const details = await getDetails(kind, { admin: false, locationId: profile.locationId }, q);
      return NextResponse.json(details);
    }

    return NextResponse.json({ message: "Accès non autorisé." }, { status: 403 });
  } catch (error) {
    console.error("Details failed:", error);
    return NextResponse.json({ message: "Impossible de charger le détail." }, { status: 500 });
  }
}
