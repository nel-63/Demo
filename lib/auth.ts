import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "caisse_session";
const SESSION_DURATION = 8 * 60 * 60;

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET is missing or too short.");
  }
  return new TextEncoder().encode(secret);
}

// Le jeton contient la version de session de l'utilisateur (claim "sv").
// Si la version en base change (deconnexion), tous les anciens jetons deviennent invalides.
export async function createSession(user: { id: string; sessionVersion: number }) {
  const token = await new SignJWT({ sv: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// Deconnexion complete : invalide les jetons existants (meme copies) puis supprime le cookie.
export async function endSession() {
  try {
    const user = await getCurrentUser();
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } },
      });
    }
  } finally {
    await clearSession();
  }
}

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });

    if (typeof payload.sub !== "string") return null;
    if (typeof payload.sv !== "number") return null;

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        designation: true,
        isActive: true,
        sessionVersion: true,
      },
    });

    if (!user || !user.isActive) return null;
    if (user.sessionVersion !== payload.sv) return null;

    const { sessionVersion: _sessionVersion, ...currentUser } = user;
    void _sessionVersion;
    return currentUser;
  } catch {
    return null;
  }
}
