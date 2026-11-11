import { describe, expect, it } from "vitest";
import { dashboardPathForRole } from "@/lib/role-routes";

describe("dashboardPathForRole", () => {
  it("envoie l'utilisateur maritime vers ses déclarations", () => {
    expect(dashboardPathForRole("USER_MAR")).toBe("/dashboard/maritime");
  });

  it("conserve le tableau de bord existant pour les autres rôles", () => {
    expect(dashboardPathForRole("ADMIN")).toBe("/dashboard");
    expect(dashboardPathForRole("SUPERVISOR")).toBe("/dashboard");
  });
});
