import { describe, expect, it } from "vitest";
import { parseDateOnly } from "@/lib/date-only";

describe("parseDateOnly", () => {
  it("convertit une date valide en date UTC sans décalage de jour", () => {
    expect(parseDateOnly("2026-10-15")).toEqual(new Date("2026-10-15T00:00:00.000Z"));
  });

  it.each(["", "2026-2-03", "2026-02-30", "2026-13-01", "15-10-2026"])(
    "refuse la date invalide %j",
    (value) => {
      expect(parseDateOnly(value)).toBeNull();
    },
  );
});
