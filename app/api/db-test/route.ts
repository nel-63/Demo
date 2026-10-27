import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
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
      {
        ok: false,
        message: "Database connection failed",
      },
      { status: 500 },
    );
  }
}
