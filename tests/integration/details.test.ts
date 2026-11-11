import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { GET } from "@/app/api/details/[kind]/route";
import { assertTestDatabase, resetDatabase, seed } from "./setup";
import type { DetailsResult } from "@/lib/details-types";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

type World = Awaited<ReturnType<typeof seed>>;
let w: World;

const as = (user: Awaited<ReturnType<typeof getCurrentUser>>) =>
  vi.mocked(getCurrentUser).mockResolvedValue(user);

async function call(kind: string, query = "") {
  const response = await GET(new Request(`http://localhost/api/details/${kind}${query}`), {
    params: Promise.resolve({ kind }),
  });
  return { status: response.status, body: (await response.json()) as DetailsResult & { message?: string } };
}

async function addPassage(opts: {
  side: "A" | "B"; name: string; tonnage: string; origin: string; destination: string;
  due: string; method?: "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY"; reference?: string;
  vehicleCharacteristics?: string;
}) {
  const a = opts.side === "A";
  const supervisor = a ? w.supA1 : w.supB;
  const product = await prisma.product.create({ data: { name: opts.name, type: "Test", tonnage: opts.tonnage } });

  return prisma.passage.create({
    data: {
      productId: product.id,
      supervisorId: supervisor.profile.id,
      locationId: a ? w.locA.id : w.locB.id,
      origin: opts.origin,
      destination: opts.destination,
      vehicleRegistration: "1234 TAA",
      vehicleCharacteristics: opts.vehicleCharacteristics ?? "Camion benne",
      driverName: "Jean",
      driverLicenseNumber: "PER-123",
      payment: {
        create: {
          recordedById: supervisor.user.id,
          paymentMethod: opts.method ?? "CASH",
          reference: opts.reference ?? null,
          amountDue: opts.due,
        },
      },
    },
  });
}

// Lieu A (Tana) : Riz 2,5 t (40 000), Ciment 3 t (30 000), Farine 1,5 t (25 000 virement)
// Lieu B (Tamatave) : Sucre 6 t (70 000 mobile money)
beforeAll(() => assertTestDatabase());
afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await resetDatabase();
  w = await seed();
  await addPassage({ side: "A", name: "Riz", tonnage: "2.5", origin: "Antsirabe", destination: "Toamasina", due: "40000", vehicleCharacteristics: "Camion blanc" });
  await addPassage({ side: "A", name: "Ciment", tonnage: "3", origin: "Moramanga", destination: "Tana", due: "30000" });
  await addPassage({ side: "A", name: "Farine", tonnage: "1.5", origin: "Ambatolampy", destination: "Mahajanga", due: "25000", method: "BANK_TRANSFER", reference: "VIR-1" });
  await addPassage({ side: "B", name: "Sucre", tonnage: "6", origin: "Brickaville", destination: "Tana", due: "70000", method: "MOBILE_MONEY", reference: "MVOLA-1" });
});

describe("accès", () => {
  it("refuse un utilisateur non connecté", async () => {
    as(null);
    expect((await call("passages")).status).toBe(401);
  });

  it("répond 404 pour les anciens types de détail (plus de statuts, chauffeurs, véhicules)", async () => {
    as(w.admin);
    for (const kind of ["drivers", "vehicles", "outstanding", "status-PLANNED", "payments", "products", "transports", "nimportequoi"]) {
      expect((await call(kind)).status).toBe(404);
    }
  });

  it("refuse les rôles non prévus", async () => {
    as({ ...w.supA1.user, role: "CASHIER" });
    expect((await call("passages")).status).toBe(403);
  });

  it("les listes Lieux et Régisseurs sont réservées à l'administrateur", async () => {
    as(w.supA1.user);
    expect((await call("locations")).status).toBe(403);
    expect((await call("supervisors")).status).toBe(403);
  });
});

describe("administrateur : tous les lieux", () => {
  beforeEach(() => as(w.admin));

  it("passages : 4 au total, avec lieu, origine, destination et enregistreur", async () => {
    const { status, body } = await call("passages");
    expect(status).toBe(200);
    expect(body.total).toBe("4");
    expect(body.columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(["product", "origin", "location", "destination", "by"]),
    );
    expect(body.href).toBeNull();
    expect(body.locations?.map((l) => l.name).sort()).toEqual(["Tamatave", "Tana"]);

    const riz = body.rows.find((r) => r.cells.product.t === "Riz");
    expect(riz?.cells).toMatchObject({
      origin: { t: "Antsirabe" },
      destination: { t: "Toamasina" },
      location: { t: "Tana" },
    });
    expect(riz?.cells.by.t).toBe("a1 Test");
  });

  it("filtre par lieu et recherche dans l'origine, la destination ou le véhicule", async () => {
    expect((await call("passages", `?locationId=${w.locB.id}`)).body.rows).toHaveLength(1);
    expect((await call("passages", `?locationId=${w.locA.id}`)).body.rows).toHaveLength(3);
    expect((await call("passages", "?q=moramanga")).body.count).toBe(1);
    expect((await call("passages", "?q=mahajanga")).body.count).toBe(1);
    expect((await call("passages", "?q=camion")).body.count).toBe(1);
    const search = await call("passages", "?q=ciment");
    expect(search.body.count).toBe(1);
    expect(search.body.total).toBe("4");
  });

  it("montant payé et tonnage cumulé", async () => {
    const paid = await call("paid");
    expect(paid.body.total).toMatch(/^165.000,00 MGA$/);
    expect(paid.body.title).toBe("Montant payé");
    expect(paid.body.rows).toHaveLength(4);
    expect(paid.body.rows[0].cells.amount).toBeDefined();
    const tonnage = await call("tonnage");
    expect(tonnage.body.total).toBe("13 t");
    expect(tonnage.body.title).toBe("Tonnage cumulé");
  });

  it("lieux et régisseurs : noms cliquables vers leur fiche", async () => {
    const locations = await call("locations");
    expect(locations.body.total).toBe("2");
    const tana = locations.body.rows.find((r) => r.cells.name.t === "Tana");
    expect(tana?.cells.passages.t).toBe("3");
    expect(tana?.cells.name.href).toBe(`/dashboard/locations/${tana?.id}`);
    expect(locations.body.href).toBe("/dashboard/locations");

    const supervisors = await call("supervisors");
    expect(supervisors.body.total).toBe("3");
    const a1 = supervisors.body.rows.find((r) => r.cells.name.t === "a1 Test");
    expect(a1?.cells.passages.t).toBe("3");
    expect(a1?.cells.name.href).toBe(`/dashboard/supervisors/${a1?.id}`);
  });
});

describe("régisseur : uniquement son lieu", () => {
  it("ne voit que les passages de son lieu, sans colonne Lieu", async () => {
    as(w.supA1.user);
    const { body } = await call("passages");
    expect(body.total).toBe("3");
    expect(body.columns.map((c) => c.key)).not.toContain("location");
    expect(body.locations).toBeNull();
    expect(body.href).toBe("/dashboard/passages");
  });

  it("le lieu est partagé entre les régisseurs du lieu", async () => {
    as(w.supA2.user);
    expect((await call("passages")).body.total).toBe("3");
  });

  it("ignore un locationId envoyé pour voir un autre lieu", async () => {
    as(w.supA1.user);
    const { body } = await call("passages", `?locationId=${w.locB.id}`);
    expect(body.total).toBe("3");
    expect(body.rows.some((r) => r.cells.product.t === "Sucre")).toBe(false);
  });

  it("un régisseur d'un autre lieu ne voit rien du lieu A", async () => {
    as(w.supB.user);
    const { body } = await call("passages");
    expect(body.total).toBe("1");
    expect(body.rows[0].cells.product.t).toBe("Sucre");
    expect((await call("paid")).body.total).toMatch(/^70.000,00 MGA$/);
    expect((await call("tonnage")).body.total).toBe("6 t");
    expect((await call("change")).status).toBe(404);
  });

  it("montants du lieu A", async () => {
    as(w.supA1.user);
    expect((await call("paid")).body.total).toMatch(/^95.000,00 MGA$/);
    expect((await call("tonnage")).body.total).toBe("7 t");
  });
});
