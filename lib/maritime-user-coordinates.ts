const COORDINATE_PATTERN = /^-?\d+(?:\.\d{1,6})?$/;

export function parseMaritimeUserCoordinates(
  latitudeValue: unknown,
  longitudeValue: unknown,
): { latitude: string; longitude: string } | null {
  const latitude = coordinateText(latitudeValue);
  const longitude = coordinateText(longitudeValue);

  if (!latitude || !longitude) return null;

  const latitudeNumber = Number(latitude);
  const longitudeNumber = Number(longitude);
  if (
    !Number.isFinite(latitudeNumber) ||
    !Number.isFinite(longitudeNumber) ||
    latitudeNumber < -90 ||
    latitudeNumber > 90 ||
    longitudeNumber < -180 ||
    longitudeNumber > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

export function parseOptionalMaritimeUserCoordinates(
  latitudeValue: unknown,
  longitudeValue: unknown,
): { latitude: string; longitude: string } | null | undefined {
  const latitude = coordinateText(latitudeValue);
  const longitude = coordinateText(longitudeValue);

  if (latitude === "" && longitude === "") return null;
  if (!latitude || !longitude) return undefined;
  return parseMaritimeUserCoordinates(latitude, longitude) ?? undefined;
}

export function hasMaritimeUserCoordinates(value: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(value, "latitude") ||
    Object.prototype.hasOwnProperty.call(value, "longitude");
}

function coordinateText(value: unknown): string | null {
  const text = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : typeof value === "string"
      ? value.trim()
      : "";

  return text === "" ? "" : COORDINATE_PATTERN.test(text) ? text : null;
}
