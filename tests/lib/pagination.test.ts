import { describe, expect, it } from "vitest";
import { getTotalPages, PASSAGES_PAGE_SIZE, resolvePage } from "@/lib/pagination";

describe("resolvePage", () => {
  const total = PASSAGES_PAGE_SIZE * 2 + 1;

  it.each([undefined, "", "abc", "0", "-1", "1.5"])(
    "ramène la valeur invalide %j à la première page",
    (value) => {
      expect(resolvePage(value, total)).toEqual({ page: 1, totalPages: 3 });
    },
  );

  it("conserve une page valide", () => {
    expect(resolvePage("2", total)).toEqual({ page: 2, totalPages: 3 });
  });

  it("ramène une page au-delà du maximum à la dernière page", () => {
    expect(resolvePage("99", total)).toEqual({ page: 3, totalPages: 3 });
  });
});

describe("getTotalPages", () => {
  it.each([
    [0, 1],
    [1, 1],
    [PASSAGES_PAGE_SIZE, 1],
    [PASSAGES_PAGE_SIZE + 1, 2],
    [PASSAGES_PAGE_SIZE * 2 + 1, 3],
  ])("calcule le nombre de pages pour %i passages", (total, totalPages) => {
    expect(getTotalPages(total)).toBe(totalPages);
  });
});
