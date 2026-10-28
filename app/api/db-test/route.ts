import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Connexion requise." }, { status: 401 });
  }

  if (user.role !== "ADMIN") {
    return NextResponse.json({ message: "Accès réservé à l'administrateur." }, { status: 403 });
  }

  try {
    const userCount = await prisma.user.count();

    return NextResponse.json({
      ok: true,
      message: "Database connection successful",
      users: userCount,
    });
  } catch (error) {
    console.error("Database test failed:", error);

    return NextResponse.json(
      { ok: false, message: "Database connection failed" },
      { status: 500 },
    );
  }
}
