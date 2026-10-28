import { prisma } from "@/lib/prisma";

// Garde-fou : ces tests VIDENT les tables. Ils refusent de tourner hors d'une base « *_test ».
export function assertTestDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL est obligatoire pour les tests d'intégration (base dédiée, nom finissant par _test).",
    );
  }
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(`Base « ${name} » refusée : le nom doit finir par _test pour éviter d'effacer de vraies données.`);
  }
}

export async function resetDatabase() {
  assertTestDatabase();
  await prisma.$executeRawUnsafe(
    `TRUNCATE "AuditLog","Payment","TransportAssignment","Product","Vehicle","Driver","Supervisor","LoginFailure","User","Location" RESTART IDENTITY CASCADE`,
  );
}

// Jeu de données : deux lieux, un admin, deux régisseurs dans le lieu A, un dans le lieu B.
export async function seed() {
  const [locA, locB] = await Promise.all([
    prisma.location.create({ data: { name: "Tana", normalizedName: "tana" } }),
    prisma.location.create({ data: { name: "Tamatave", normalizedName: "tamatave" } }),
  ]);

  const admin = await prisma.user.create({
    data: { firstName: "Ada", lastName: "Admin", email: "admin@test.mg", passwordHash: "x", role: "ADMIN" },
  });

  async function supervisor(email: string, nationalId: string, locationId: string, locationName: string) {
    const user = await prisma.user.create({
      data: { firstName: email.split("@")[0], lastName: "Test", email, passwordHash: "x", role: "SUPERVISOR" },
    });
    const profile = await prisma.supervisor.create({
      data: { userId: user.id, nationalId, locationId, location: locationName },
    });
    return {
      profile,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: "SUPERVISOR" as const,
        designation: null,
        isActive: true,
      },
    };
  }

  const supA1 = await supervisor("a1@test.mg", "CIN-A1", locA.id, locA.name);
  const supA2 = await supervisor("a2@test.mg", "CIN-A2", locA.id, locA.name);
  const supB = await supervisor("b1@test.mg", "CIN-B1", locB.id, locB.name);

  const driver = (n: number, locationId: string, supervisorId: string, isActive = true) =>
    prisma.driver.create({
      data: {
        firstName: `Chauffeur${n}`,
        lastName: "Test",
        nationalId: `DRV-${n}`,
        licenseNumber: `LIC-${n}`,
        isActive,
        locationId,
        supervisorId,
      },
    });

  const driver1 = await driver(1, locA.id, supA1.profile.id);
  const driver2 = await driver(2, locA.id, supA1.profile.id);
  const driverInactive = await driver(3, locA.id, supA1.profile.id, false);
  const driverB = await driver(4, locB.id, supB.profile.id);

  const vehicle = await prisma.vehicle.create({
    data: {
      vehicleType: "Camion",
      licensePlate: "1000 AAA",
      driverId: driver1.id,
      locationId: locA.id,
      supervisorId: supA1.profile.id,
    },
  });

  return {
    locA, locB,
    admin: {
      id: admin.id, firstName: admin.firstName, lastName: admin.lastName, email: admin.email,
      role: "ADMIN" as const, designation: null, isActive: true,
    },
    supA1, supA2, supB,
    driver1, driver2, driverInactive, driverB,
    vehicle,
  };
}
