import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buildHistory } from "@/lib/passage-history";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPERVISOR") {
    return NextResponse.json({ message: "Accès réservé aux régisseurs et à l'administrateur." }, { status: 403 });
  }

  const { id } = await context.params;
  if (user.role === "SUPERVISOR") {
    const profile = await prisma.supervisor.findUnique({
      where: { userId: user.id },
      select: { locationId: true },
    });
    const passage = await prisma.passage.findUnique({
      where: { id },
      select: { locationId: true, deletedAt: true },
    });
    // Un passage supprimé n'est visible que de l'administrateur.
    if (!profile?.locationId || passage?.locationId !== profile.locationId || passage.deletedAt) {
      return NextResponse.json({ message: "Passage introuvable dans votre lieu." }, { status: 404 });
    }
  }
  const revisions = await prisma.recordRevision.findMany({
    where: { entityType: "Passage", entityId: id },
    orderBy: { version: "desc" },
    select: {
      id: true, version: true, action: true, snapshot: true, createdAt: true,
      actor: { select: { firstName: true, lastName: true } },
    },
  });
  // Les instantanés bruts ne quittent pas le serveur : on renvoie un historique lisible.
  return NextResponse.json({
    entries: buildHistory(
      revisions.map((revision) => ({ ...revision, createdAt: revision.createdAt.toISOString() })),
    ),
  });
}
