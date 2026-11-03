import { describe, expect, it } from "vitest";
import {
  DRAWER_DEFAULT_WIDTH,
  DRAWER_MAX_WIDTH,
  DRAWER_MIN_WIDTH,
  clampDrawerWidth,
  drawerWidthBounds,
} from "@/lib/drawer-width";

describe("drawerWidthBounds", () => {
  it("écran large : minimum 420 px, maximum 1100 px", () => {
    expect(drawerWidthBounds(1920)).toEqual({ min: DRAWER_MIN_WIDTH, max: DRAWER_MAX_WIDTH });
  });

  it("le maximum ne dépasse jamais la largeur de la fenêtre", () => {
    expect(drawerWidthBounds(900)).toEqual({ min: 420, max: 900 });
  });

  it("fenêtre plus étroite que le minimum : le minimum suit la fenêtre", () => {
    expect(drawerWidthBounds(360)).toEqual({ min: 360, max: 360 });
  });
});

describe("clampDrawerWidth", () => {
  it("laisse passer une largeur dans les bornes", () => {
    expect(clampDrawerWidth(700, 1920)).toBe(700);
  });

  it("respecte la largeur minimale et maximale", () => {
    expect(clampDrawerWidth(100, 1920)).toBe(420);
    expect(clampDrawerWidth(5000, 1920)).toBe(1100);
  });

  it("ramène la largeur dans la fenêtre quand elle rétrécit", () => {
    expect(clampDrawerWidth(1000, 800)).toBe(800);
    expect(clampDrawerWidth(1000, 300)).toBe(300);
  });

  it("arrondit et gère les valeurs non finies", () => {
    expect(clampDrawerWidth(640.6, 1920)).toBe(641);
    expect(clampDrawerWidth(Number.NaN, 1920)).toBe(DRAWER_DEFAULT_WIDTH);
  });
});
