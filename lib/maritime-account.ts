import type { Prisma } from "@/app/generated/prisma/client";

export const MARITIME_INACTIVITY_MONTHS = 3;

export class MaritimeContactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaritimeContactValidationError";
  }
}

export function validateMaritimeContact(
  emailValue: unknown,
  phoneValue: unknown,
): { email: string; phone: string } {
  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const phone = typeof phoneValue === "string" ? phoneValue.trim() : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new MaritimeContactValidationError("Une adresse email personnelle valide est obligatoire.");
  }
  if (!/^\+?[0-9][0-9\s().-]{4,39}$/.test(phone)) {
    throw new MaritimeContactValidationError("Un numéro de téléphone personnel valide est obligatoire.");
  }

  return { email, phone };
}

export function isMaritimeAccountExpired(
  lastLoginAt: Date | null,
  createdAt: Date,
  now = new Date(),
): boolean {
  const reference = lastLoginAt ?? createdAt;
  const expiry = new Date(reference);
  const originalDay = expiry.getUTCDate();
  expiry.setUTCDate(1);
  expiry.setUTCMonth(expiry.getUTCMonth() + MARITIME_INACTIVITY_MONTHS);
  const lastDayOfExpiryMonth = new Date(
    Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth() + 1, 0),
  ).getUTCDate();
  expiry.setUTCDate(Math.min(originalDay, lastDayOfExpiryMonth));
  return now >= expiry;
}

export async function deactivateMaritimeAccount(
  tx: Prisma.TransactionClient,
  userId: string,
  maritimeUserId: string,
  reason: "EXIT_DATE" | "INACTIVITY",
) {
  await tx.user.update({
    where: { id: userId },
    data: { isActive: false, sessionVersion: { increment: 1 } },
  });
  await tx.auditLog.create({
    data: {
      userId,
      action: "DEACTIVATE",
      entityType: "MaritimeUser",
      entityId: maritimeUserId,
      details: { reason },
    },
  });
}
