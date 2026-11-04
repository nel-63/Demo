import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/passages/[id]/attachments/[kind]/route";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { resetFakePrisma, type FakePrisma } from "../helpers/fake-prisma";
import { ADMIN, SUPERVISOR } from "../helpers/http";

vi.mock("@/lib/prisma", async () => {
  const { createFakePrisma } = await import("../helpers/fake-prisma");
  return { prisma: createFakePrisma() };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as FakePrisma;
const context = (kind = "pjt") => ({ params: Promise.resolve({ id: "pass-1", kind }) });
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

beforeEach(() => {
  resetFakePrisma(db);
  vi.mocked(getCurrentUser).mockResolvedValue(SUPERVISOR);
  db.supervisor.findUnique.mockResolvedValue({
    id: "supervisor-1",
    locationId: "location-1",
    assignedLocation: { deletedAt: null },
  });
});

describe("consultation différée des pièces jointes", () => {
  it("renvoie l'image seulement après la demande explicite du régisseur de son lieu", async () => {
    db.passage.findUnique
      .mockResolvedValueOnce({ id: "pass-1", locationId: "location-1", deletedAt: null })
      .mockResolvedValueOnce({ pjt: png });

    const response = await GET(new Request("https://demo.test/api/passages/pass-1/attachments/pjt"), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
  });

  it("ne révèle pas les pièces jointes d'un autre lieu", async () => {
    db.passage.findUnique.mockResolvedValue({ id: "pass-1", locationId: "location-elsewhere", deletedAt: null });

    const response = await GET(new Request("https://demo.test/api/passages/pass-1/attachments/pjt"), context());
    expect(response.status).toBe(404);
    expect(db.passage.findUnique).toHaveBeenCalledTimes(1);
  });

  it("autorise l'administrateur à consulter les pièces jointes d'un autre lieu", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(ADMIN);
    db.passage.findUnique
      .mockResolvedValueOnce({ id: "pass-1", locationId: "location-elsewhere", deletedAt: null })
      .mockResolvedValueOnce({ quittance: png });

    const response = await GET(
      new Request("https://demo.test/api/passages/pass-1/attachments/quittance"),
      context("quittance"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("refuse les types de pièce jointe autres que pjt et quittance", async () => {
    const response = await GET(
      new Request("https://demo.test/api/passages/pass-1/attachments/other"),
      context("other"),
    );
    expect(response.status).toBe(404);
    expect(db.passage.findUnique).not.toHaveBeenCalled();
  });
});
