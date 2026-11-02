import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

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
      select: { locationId: true },
    });
    if (!profile?.locationId || passage?.locationId !== profile.locationId) {
      return NextResponse.json({ message: "Passage introuvable dans votre lieu." }, { status: 404 });
    }
  }
  const revisions = await prisma.recordRevision.findMany({
    where: { entityType: "Passage", entityId: id },
    orderBy: { version: "desc" },
    select: {
      id: true, version: true, action: true, snapshot: true, createdAt: true,
      actor: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  return NextResponse.json({
    revisions: revisions.map((revision) => ({
      ...revision,
      createdAt: revision.createdAt.toISOString(),
    })),
  });
}
