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

// Données :  Lieu A (Tana)                         Lieu B (Tamatave)
//   T1 terminé  payé  40 000  2,5 t  (reçu 50 000)   T5 terminé payé 70 000  6 t (mobile money)
//   T2 planifié       30 000  3 t
//   T3 annulé         20 000  4 t
//   T4 en cours       25 000  1,5 t
async function addTransport(opts: {
  w: World; side: "A" | "B"; name: string; tonnage: string; amountDue: string; status: string;
  payment?: { method: "CASH" | "MOBILE_MONEY"; received: string; change: string; reference?: string };
}) {
  const a = opts.side === "A";
  const supervisor = a ? opts.w.supA1 : opts.w.supB;
  const vehicleId = a
    ? opts.w.vehicle.id
    : (await prisma.vehicle.findFirstOrThrow({ where: { locationId: opts.w.locB.id } })).id;
  const driverId = a ? opts.w.driver1.id : opts.w.driverB.id;

  const product = await prisma.product.create({
    data: { name: opts.name, type: "Test", tonnage: opts.tonnage },
  });

  return prisma.transportAssignment.create({
    data: {
      productId: product.id,
      supervisorId: supervisor.profile.id,
      locationId: a ? opts.w.locA.id : opts.w.locB.id,
      vehicleId,
      driverId,
      status: opts.status as "PLANNED",
      amountDue: opts.amountDue,
      ...(opts.payment
        ? {
            payment: {
              create: {
                recordedById: supervisor.user.id,
                paymentMethod: opts.payment.method,
                reference: opts.payment.reference ?? null,
                amountDue: opts.amountDue,
                amountReceived: opts.payment.received,
                changeReturned: opts.payment.change,
              },
            },
          }
        : {}),
    },
  });
}

beforeAll(() => assertTestDatabase());
afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await resetDatabase();
  w = await seed();
  await prisma.vehicle.create({
    data: {
      vehicleType: "Camion", licensePlate: "2000 BBB", driverId: w.driverB.id,
      locationId: w.locB.id, supervisorId: w.supB.profile.id,
    },
  });
  await addTransport({ w, side: "A", name: "Riz", tonnage: "2.5", amountDue: "40000", status: "COMPLETED",
    payment: { method: "CASH", received: "50000", change: "10000" } });
  await addTransport({ w, side: "A", name: "Ciment", tonnage: "3", amountDue: "30000", status: "PLANNED" });
  await addTransport({ w, side: "A", name: "Girofle", tonnage: "4", amountDue: "20000", status: "CANCELLED" });
  await addTransport({ w, side: "A", name: "Farine", tonnage: "1.5", amountDue: "25000", status: "IN_PROGRESS" });
  await addTransport({ w, side: "B", name: "Sucre", tonnage: "6", amountDue: "70000", status: "COMPLETED",
    payment: { method: "MOBILE_MONEY", received: "70000", change: "0", reference: "MVOLA-1" } });
});

describe("accès", () => {
  it("refuse un utilisateur non connecté", async () => {
    as(null);
    expect((await call("transports")).status).toBe(401);
  });

  it("répond 404 pour un type de détail inconnu", async () => {
    as(w.admin);
    expect((await call("nimportequoi")).status).toBe(404);
    expect((await call("status-EXPLOSE")).status).toBe(404);
  });

  it("refuse les rôles non prévus", async () => {
    as({ ...w.supA1.user, role: "CASHIER" });
    expect((await call("transports")).status).toBe(403);
  });

  it("les listes Lieux et Régisseurs sont réservées à l'administrateur", async () => {
    as(w.supA1.user);
    expect((await call("locations")).status).toBe(403);
    expect((await call("supervisors")).status).toBe(403);
  });
});

describe("administrateur : tous les lieux", () => {
  beforeEach(() => as(w.admin));

  it("transports : 5 au total, colonne Lieu, pas de page complète", async () => {
    const { status, body } = await call("transports");
    expect(status).toBe(200);
    expect(body.total).toBe("5");
    expect(body.rows).toHaveLength(5);
    expect(body.columns.map((c) => c.key)).toContain("location");
    expect(body.href).toBeNull();
    expect(body.locations?.map((l) => l.name).sort()).toEqual(["Tamatave", "Tana"]);
  });

  it("filtre par lieu et par recherche", async () => {
    expect((await call("transports", `?locationId=${w.locB.id}`)).body.rows).toHaveLength(1);
    expect((await call("transports", `?locationId=${w.locA.id}`)).body.rows).toHaveLength(4);
    const search = await call("transports", "?q=ciment");
    expect(search.body.count).toBe(1);
    expect(search.body.total).toBe("5"); // le total reste celui de la carte
  });

  it("reste à encaisser : ni annulés, ni payés", async () => {
    const { body } = await call("outstanding");
    expect(body.rows).toHaveLength(2);
    expect(body.total).toMatch(/^55.000,00 MGA$/);
    expect(body.title).toBe("Reste à encaisser");
  });

  it("montant reçu, monnaie rendue et paiements", async () => {
    expect((await call("received")).body.total).toMatch(/^120.000,00 MGA$/);
    const change = await call("change");
    expect(change.body.total).toMatch(/^10.000,00 MGA$/);
    expect(change.body.rows).toHaveLength(1);
    const payments = await call("payments");
    expect(payments.body.total).toBe("2");
    expect(payments.body.rows[0].cells.method.t).toMatch(/Espèces|Mobile money/);
  });

  it("tonnage cumulé exclut les transports annulés, produits les compte", async () => {
    const tonnage = await call("tonnage");
    expect(tonnage.body.total).toBe("13 t");
    expect(tonnage.body.rows).toHaveLength(4);
    expect((await call("products")).body.total).toBe("5");
  });

  it("répartition par statut", async () => {
    const { body } = await call("status-CANCELLED");
    expect(body.title).toBe("Transports : Annulé");
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].cells.status.badge).toBe("bad");
  });

  it("lieux et régisseurs, avec lien vers la page complète", async () => {
    const locations = await call("locations");
    expect(locations.body.total).toBe("2");
    const tana = locations.body.rows.find((r) => r.cells.name.t === "Tana");
    expect(tana?.cells.transports.t).toBe("4");
    expect(locations.body.href).toBe("/dashboard/locations");

    const supervisors = await call("supervisors");
    expect(supervisors.body.total).toBe("3");
    expect(supervisors.body.href).toBe("/dashboard/supervisors");
  });

  it("chauffeurs et véhicules : recherche par nom ou immatriculation", async () => {
    expect((await call("drivers", "?q=Chauffeur1")).body.count).toBe(1);
    expect((await call("vehicles", "?q=2000")).body.count).toBe(1);
  });
});

describe("régisseur : uniquement son lieu", () => {
  it("ne voit que les données de son lieu, sans colonne Lieu", async () => {
    as(w.supA1.user);
    const { body } = await call("transports");
    expect(body.total).toBe("4");
    expect(body.columns.map((c) => c.key)).not.toContain("location");
    expect(body.locations).toBeNull();
    expect(body.href).toBe("/dashboard/transports");
  });

  it("le même lieu est partagé entre les régisseurs du lieu", async () => {
    as(w.supA2.user);
    expect((await call("transports")).body.total).toBe("4");
  });

  it("ignore un locationId envoyé pour voir un autre lieu", async () => {
    as(w.supA1.user);
    const { body } = await call("transports", `?locationId=${w.locB.id}`);
    expect(body.total).toBe("4");
    expect(body.rows.every((r) => r.cells.product.t !== "Sucre")).toBe(true);
  });

  it("un régisseur d'un autre lieu ne voit rien du lieu A", async () => {
    as(w.supB.user);
    const { body } = await call("transports");
    expect(body.total).toBe("1");
    expect(body.rows[0].cells.product.t).toBe("Sucre");
    expect((await call("received")).body.total).toMatch(/^70.000,00 MGA$/);
    expect((await call("outstanding")).body.total).toMatch(/^0,00 MGA$/);
    expect((await call("tonnage")).body.total).toBe("6 t");
  });

  it("montants du lieu A", async () => {
    as(w.supA1.user);
    expect((await call("received")).body.total).toMatch(/^50.000,00 MGA$/);
    expect((await call("outstanding")).body.total).toMatch(/^55.000,00 MGA$/);
    expect((await call("tonnage")).body.total).toBe("7 t");
  });

  it("le chauffeur affiché est celui du transport, même après un changement de chauffeur", async () => {
    as(w.supA1.user);
    await prisma.vehicle.update({ where: { id: w.vehicle.id }, data: { driverId: w.driver2.id } });
    const { body } = await call("transports");
    expect(body.rows.every((r) => r.cells.driver.t === "Chauffeur1 Test")).toBe(true);
  });
});
