const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentValidationError";
  }
}

export function detectImageContentType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";

  return null;
}

async function readImageUpload(value: FormDataEntryValue | null): Promise<Uint8Array | undefined> {
  if (value === null) return undefined;
  if (typeof value === "string") {
    if (!value.trim()) return undefined;
    throw new AttachmentValidationError("Le fichier joint est invalide.");
  }
  if (value.size === 0) return undefined;
  if (value.size > MAX_IMAGE_SIZE) {
    throw new AttachmentValidationError("Chaque image doit faire 5 Mo maximum.");
  }

  const bytes = new Uint8Array(await value.arrayBuffer());
  if (!detectImageContentType(bytes)) {
    throw new AttachmentValidationError("Format d'image invalide. Utilisez un fichier JPEG, PNG ou WebP.");
  }
  return bytes;
}

/** Read either the existing JSON API payload or a multipart form with optional images. */
export async function readPassagePayload(request: Request): Promise<{
  data: Record<string, unknown>;
  pjt?: Uint8Array;
  quittance?: Uint8Array;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const data: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") data[key] = value;
    }
    const [pjt, quittance] = await Promise.all([
      readImageUpload(form.get("pjt")),
      readImageUpload(form.get("quittance")),
    ]);
    return { data, pjt, quittance };
  }

  const body: unknown = await request.json().catch(() => null);
  return {
    data: body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {},
  };
}
