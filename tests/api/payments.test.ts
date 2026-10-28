import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/payments/route";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { auditEntries, resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR, jsonRequest, read } from "../helpers/http";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;

function pay(body: Record<string, unknown>) {
  return POST(jsonRequest("/api/payments", "POST", { assignmentId: "t1", ...body }));
}

// Transport de base : 40 000 MGA dus, non payé, non annulé.
function givenTransport(overrides: Record<string, unknown> = {}) {
  db.transportAssignment.findFirst.mockResolvedValue({
    id: "t1",
    amountDue: "40000.00",
    payment: null,
    ...overrides,
  });
}

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
  db.supervisor.findUnique.mockResolvedValue({ id: "sup-1", locationId: "loc-1" });
  db.payment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "pay-1",
    ...data,
  }));
});

describe("accès", () => {
  it("refuse un utilisateur non connecté", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { status } = await read(await pay({ amountReceived: "40000", paymentMethod: "CASH" }));
    expect(status).toBe(401);
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("refuse l'administrateur (formulaire réservé aux régisseurs)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
    const { status } = await read(await pay({ amountReceived: "40000", paymentMethod: "CASH" }));
    expect(status).toBe(403);
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("refuse un régisseur sans lieu affecté", async () => {
    db.supervisor.findUnique.mockResolvedValue({ id: "sup-1", locationId: null });
    const { status } = await read(await pay({ amountReceived: "40000", paymentMethod: "CASH" }));
    expect(status).toBe(403);
  });
});

describe("paiement en espèces", () => {
  it("calcule la monnaie à rendre quand le montant reçu dépasse le montant dû", async () => {
    givenTransport();
    const { status, body } = await read(
      await pay({ amountReceived: "50000", paymentMethod: "CASH" }),
    );

    expect(status).toBe(201);
    expect(db.payment.create.mock.calls[0][0].data).toMatchObject({
      amountDue: "40000.00",
      amountReceived: "50000.00",
      changeReturned: "10000.00",
    });
    expect((body.payment as Record<string, string>).changeReturned).toBe("10000.00");
  });

  it("accepte le montant exact sans monnaie", async () => {
    givenTransport();
    const { status } = await read(await pay({ amountReceived: "40000", paymentMethod: "CASH" }));
    expect(status).toBe(201);
    expect(db.payment.create.mock.calls[0][0].data.changeReturned).toBe("0.00");
  });

  it("refuse un montant reçu insuffisant (aucun paiement partiel)", async () => {
    givenTransport();
    const { status } = await read(await pay({ amountReceived: "39999.99", paymentMethod: "CASH" }));
    expect(status).toBe(400);
    expect(db.payment.create).not.toHaveBeenCalled();
  });
});

describe("paiement non liquide", () => {
  it("exige une référence", async () => {
    givenTransport();
    const { status } = await read(
      await pay({ amountReceived: "40000", paymentMethod: "BANK_TRANSFER" }),
    );
    expect(status).toBe(400);
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("exige le montant exact, même supérieur", async () => {
    givenTransport();
    const { status } = await read(
      await pay({ amountReceived: "40001", paymentMethod: "MOBILE_MONEY", reference: "MM-1" }),
    );
    expect(status).toBe(400);
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("refuse un montant incomplet", async () => {
    givenTransport();
    const { status } = await read(
      await pay({ amountReceived: "30000", paymentMethod: "CHECK", reference: "CHQ-9" }),
    );
    expect(status).toBe(400);
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("enregistre un paiement exact avec référence", async () => {
    givenTransport();
    const { status } = await read(
      await pay({ amountReceived: "40000", paymentMethod: "BANK_TRANSFER", reference: "VIR-1" }),
    );
    expect(status).toBe(201);
    expect(db.payment.create.mock.calls[0][0].data).toMatchObject({
      paymentMethod: "BANK_TRANSFER",
      reference: "VIR-1",
      changeReturned: "0.00",
    });
  });
});

describe("règles du transport", () => {
  it("ignore tout montant dû envoyé par le client : la base fait foi", async () => {
    givenTransport();
    await pay({ amountReceived: "40000", paymentMethod: "CASH", amountDue: "1" });
    expect(db.payment.create.mock.calls[0][0].data.amountDue).toBe("40000.00");
  });

  it("refuse un transport annulé ou hors du lieu (introuvable)", async () => {
    db.transportAssignment.findFirst.mockResolvedValue(null);
    const { status } = await read(await pay({ amountReceived: "40000", paymentMethod: "CASH" }));
    expect(status).toBe(404);
    // la recherche exclut les transports annulés et ceux d'un autre lieu
    expect(db.transportAssignment.findFirst.mock.calls[0][0].where).toMatchObject({
      locationId: "loc-1",
      status: { not: "CANCELLED" },
    });
  });

  it("refuse un transport sans montant officiel", async () => {
    givenTransport({ amountDue: null });
    const { status } = await read(await pay({ amountReceived: "40000", paymentMethod: "CASH" }));
    expect(status).toBe(400);
  });

  it("refuse un second paiement", async () => {
    givenTransport({ payment: { id: "pay-0" } });
    const { status } = await read(await pay({ amountReceived: "40000", paymentMethod: "CASH" }));
    expect(status).toBe(409);
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("convertit un paiement concurrent (contrainte unique) en refus 409", async () => {
    givenTransport();
    db.payment.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const { status } = await read(await pay({ amountReceived: "40000", paymentMethod: "CASH" }));
    expect(status).toBe(409);
  });

  it("verrouille la ligne du transport avant de décider", async () => {
    givenTransport();
    await pay({ amountReceived: "40000", paymentMethod: "CASH" });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("validation des champs", () => {
  it.each([
    ["montant négatif", { amountReceived: "-5", paymentMethod: "CASH" }],
    ["montant à 3 décimales", { amountReceived: "10.123", paymentMethod: "CASH" }],
    ["montant non numérique", { amountReceived: "abc", paymentMethod: "CASH" }],
    ["montant nul", { amountReceived: "0", paymentMethod: "CASH" }],
    ["mode inconnu", { amountReceived: "40000", paymentMethod: "BITCOIN" }],
    ["montant manquant", { paymentMethod: "CASH" }],
  ])("refuse : %s", async (_label, body) => {
    givenTransport();
    const { status } = await read(await pay(body));
    expect(status).toBe(400);
    expect(db.payment.create).not.toHaveBeenCalled();
  });
});

describe("traçabilité", () => {
  it("journalise le montant, le mode et la référence du paiement", async () => {
    givenTransport();
    await pay({ amountReceived: "50000", paymentMethod: "CASH" });

    const [entry] = auditEntries(db);
    expect(entry).toMatchObject({
      userId: SUPERVISOR.id,
      action: "CREATE",
      entityType: "Payment",
      entityId: "pay-1",
    });
    expect(entry.details).toMatchObject({
      assignmentId: "t1",
      paymentMethod: "CASH",
      amountDue: "40000.00",
      amountReceived: "50000.00",
      changeReturned: "10000.00",
    });
  });
});
