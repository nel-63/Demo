import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const data =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : {};

    const email =
      typeof data.email === "string"
        ? data.email.trim().toLowerCase()
        : "";
    const password =
      typeof data.password === "string" ? data.password : "";

    if (!email || !password || password.length > 200) {
      return NextResponse.json(
        { message: "Veuillez saisir un email et un mot de passe valides." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
      },
    });

    const passwordIsValid = user
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!user || !user.isActive || !passwordIsValid) {
      return NextResponse.json(
        { message: "Email ou mot de passe incorrect." },
        { status: 401 },
      );
    }

    await createSession({ id: user.id });

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { message: "Une erreur interne est survenue." },
      { status: 500 },
    );
  }
}
