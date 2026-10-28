import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";

// Limitation des tentatives : echecs comptes sur une fenetre glissante.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

// Hash factice : on fait toujours un bcrypt.compare, meme si l'email n'existe pas,
// pour que le temps de reponse ne revele pas si un compte existe.
const DUMMY_HASH =
  "$2b$12$eYU7uvDiC91yh/YzotBscOst.ijC0.HTmFiTkY0YC.CokCQxKQXSS";

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return (first || request.headers.get("x-real-ip") || "unknown").slice(0, 64);
}

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

    if (!email || !password || email.length > 254 || password.length > 200) {
      return NextResponse.json(
        { message: "Veuillez saisir un email et un mot de passe valides." },
        { status: 400 },
      );
    }

    const ipAddress = getClientIp(request);
    const windowStart = new Date(Date.now() - WINDOW_MS);

    const [emailFailures, ipFailures] = await Promise.all([
      prisma.loginFailure.count({
        where: { email, createdAt: { gte: windowStart } },
      }),
      prisma.loginFailure.count({
        where: { ipAddress, createdAt: { gte: windowStart } },
      }),
    ]);

    if (
      emailFailures >= MAX_FAILURES_PER_EMAIL ||
      ipFailures >= MAX_FAILURES_PER_IP
    ) {
      return NextResponse.json(
        { message: "Trop de tentatives. Réessayez dans quelques minutes." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(WINDOW_MS / 1000)) },
        },
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
        sessionVersion: true,
      },
    });

    const passwordIsValid = await bcrypt.compare(
      password,
      user ? user.passwordHash : DUMMY_HASH,
    );

    if (!user || !user.isActive || !passwordIsValid) {
      await prisma.loginFailure.create({ data: { email, ipAddress } });
      // Nettoyage opportuniste des anciens echecs de cet email.
      await prisma.loginFailure.deleteMany({
        where: { email, createdAt: { lt: windowStart } },
      });

      return NextResponse.json(
        { message: "Email ou mot de passe incorrect." },
        { status: 401 },
      );
    }

    await prisma.loginFailure.deleteMany({ where: { email } });
    await createSession({ id: user.id, sessionVersion: user.sessionVersion });

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
