import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import {
  deactivateMaritimeAccount,
  isMaritimeAccountExpired,
} from "@/lib/maritime-account";

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

    const identifierValue =
      typeof data.identifier === "string"
        ? data.identifier
        : typeof data.email === "string"
          ? data.email
          : "";
    const identifier = identifierValue.trim().toLocaleLowerCase("fr-FR");
    const password =
      typeof data.password === "string" ? data.password : "";

    if (!identifier || !password || identifier.length > 254 || password.length > 200) {
      return NextResponse.json(
        { message: "Veuillez saisir un identifiant et un mot de passe valides." },
        { status: 400 },
      );
    }

    const ipAddress = getClientIp(request);
    const windowStart = new Date(Date.now() - WINDOW_MS);

    const [emailFailures, ipFailures] = await Promise.all([
      prisma.loginFailure.count({ where: { email: identifier, createdAt: { gte: windowStart } } }),
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

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { maritimeProfile: { is: { loginId: identifier, onboardingComplete: false } } },
          { maritimeProfile: { is: { contactPhone: identifier } } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
        sessionVersion: true,
        createdAt: true,
        lastLoginAt: true,
        maritimeProfile: {
          select: { id: true, companyName: true, onboardingComplete: true },
        },
      },
    });

    const passwordIsValid = await bcrypt.compare(
      password,
      user ? user.passwordHash : DUMMY_HASH,
    );

    const needsOnboarding =
      user?.role === "USER_MAR" &&
      Boolean(user.maritimeProfile) &&
      !user.maritimeProfile?.onboardingComplete;
    const isExpired =
      user?.role === "USER_MAR" &&
      isMaritimeAccountExpired(user.lastLoginAt, user.createdAt);

    if (!user || !user.isActive || !passwordIsValid || isExpired) {
      if (user && user.isActive && isExpired && user.maritimeProfile) {
        await prisma.$transaction((tx) =>
          deactivateMaritimeAccount(tx, user.id, user.maritimeProfile!.id, "INACTIVITY"),
        );
      }
      // Mot de passe correct mais accès maritime terminé (départ enregistré ou 3 mois sans connexion) :
      // on l'explique clairement. Le mot de passe étant juste, rien de sensible n'est révélé.
      if (user?.role === "USER_MAR" && passwordIsValid) {
        return NextResponse.json(
          { message: "Ce compte n'est plus actif. Contactez votre société ou l'administrateur." },
          { status: 403 },
        );
      }
      await prisma.loginFailure.create({ data: { email: identifier, ipAddress } });
      // Nettoyage opportuniste des anciens echecs de cet email.
      await prisma.loginFailure.deleteMany({
        where: { email: identifier, createdAt: { lt: windowStart } },
      });

      return NextResponse.json(
        { message: "Identifiant ou mot de passe incorrect." },
        { status: 401 },
      );
    }

    await prisma.loginFailure.deleteMany({ where: { email: identifier } });
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const activeDeclaration = user.role === "USER_MAR" && user.maritimeProfile?.onboardingComplete
      ? await prisma.maritimeDeclaration.findFirst({
          where: { maritimeUserId: user.maritimeProfile.id, departureDate: null },
          select: { id: true },
        })
      : null;
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
      needsOnboarding,
      activeDeclarationId: activeDeclaration?.id ?? null,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { message: "Une erreur interne est survenue." },
      { status: 500 },
    );
  }
}
