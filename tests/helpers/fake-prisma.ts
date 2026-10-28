import { vi, type Mock } from "vitest";

// Faux client Prisma pour tester les routes API sans base de données.
// Les tests décrivent ce que la base « répond » ; on vérifie ensuite ce que la route a décidé.

const MODELS = [
  "user",
  "supervisor",
  "driver",
  "vehicle",
  "location",
  "product",
  "transportAssignment",
  "payment",
  "auditLog",
  "loginFailure",
] as const;

const METHODS = [
  "findUnique",
  "findFirst",
  "findMany",
  "create",
  "update",
  "deleteMany",
  "count",
] as const;

type ModelMock = Record<(typeof METHODS)[number], Mock>;

export type FakePrisma = Record<(typeof MODELS)[number], ModelMock> & {
  $transaction: Mock;
  $queryRaw: Mock;
};

export function createFakePrisma(): FakePrisma {
  const db = {} as FakePrisma;

  for (const model of MODELS) {
    db[model] = Object.fromEntries(
      METHODS.map((method) => [method, vi.fn()]),
    ) as ModelMock;
  }

  db.$queryRaw = vi.fn();
  db.$transaction = vi.fn();
  resetFakePrisma(db);
  return db;
}

// Remet tous les mocks à zéro (appels et réponses) et réinstalle le comportement par défaut :
// une transaction exécute simplement sa fonction avec le même faux client.
export function resetFakePrisma(db: FakePrisma) {
  for (const model of MODELS) {
    for (const method of METHODS) db[model][method].mockReset();
  }
  db.$queryRaw.mockReset().mockResolvedValue([]);
  db.$transaction
    .mockReset()
    .mockImplementation(async (callback: (tx: FakePrisma) => unknown) => callback(db));
}

// Les enregistrements d'audit créés pendant le test.
export function auditEntries(db: FakePrisma): Array<{
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
}> {
  return db.auditLog.create.mock.calls.map(
    (call) => (call[0] as { data: never }).data,
  );
}
