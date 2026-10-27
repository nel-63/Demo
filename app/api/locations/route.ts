import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json({ message: "Acces reserve a l'administrateur." }, { status: 403 });
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    const data =
      body && typeof body === "object"
        ? body as Record<string, unknown>
        : {};

    const name = typeof data.name === "string"
      ? data.name.normalize("NFKC").replace(/\s+/g, " ").trim()
      : "";

    if (name.length < 2 || name.length > 100) {
      return NextResponse.json(
        { message: "Le nom du lieu doit contenir entre 2 et 100 caracteres." },
        { status: 400 }
      );
    }

    const normalizedName = name.toLowerCase();

    const location = await prisma.$transaction(async (tx) => {
      const created = await tx.location.create({
        data: { name, normalizedName },
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "Location",
          entityId: created.id,
          details: { name: created.name },
        },
      });

      return created;
    });

    return NextResponse.json({ ok: true, location }, { status: 201 });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;

    if (code === "P2002") {
      return NextResponse.json(
        { message: "Ce lieu existe deja." },
        { status: 409 }
      );
    }

    console.error("Location creation failed:", error);

    return NextResponse.json(
      { message: "Impossible de creer le lieu." },
      { status: 500 }
    );
  }
}