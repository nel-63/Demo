import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ message: "Historique réservé à l'administrateur." }, { status: 403 });

  const { id } = await context.params;
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
