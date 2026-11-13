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
    throw new MaritimeContactValidationError("Une adresse email de contact valide est obligatoire.");
  }
  if (!/^\+?[0-9][0-9\s().-]{4,39}$/.test(phone)) {
    throw new MaritimeContactValidationError("Un numéro de téléphone de contact valide est obligatoire.");
  }
  return { email, phone };
}
