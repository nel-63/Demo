import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  await prisma.$transaction(async (tx) => {
    const supervisors = await tx.supervisor.findMany({
      select: {
        id: true,
        location: true,
        locationId: true,
      },
    });

for (const supervisor of supervisors) {
      if (supervisor.locationId) continue;

const name = supervisor.location?.trim();
      if (!name) continue;

      const normalizedName = name.normalize("NFKC").toLowerCase();

const location = await tx.location.upsert({
        where: { normalizedName },
        create: { name, normalizedName },
        update: {},
        select: { id: true },
      });

await tx.supervisor.update({
        where: { id: supervisor.id },
        data: { locationId: location.id },
      });
    }

const locatedSupervisors = await tx.supervisor.findMany({
      where: { locationId: { not: null } },
      select: { id: true, locationId: true },
    });

for (const supervisor of locatedSupervisors) {
      if (!supervisor.locationId) continue;

await tx.driver.updateMany({
        where: {
          supervisorId: supervisor.id,
          locationId: null,
        },
        data: { locationId: supervisor.locationId },
      });

await tx.vehicle.updateMany({
        where: {
          supervisorId: supervisor.id,
          locationId: null,
        },
        data: { locationId: supervisor.locationId },
      });

await tx.transportAssignment.updateMany({
        where: {
          supervisorId: supervisor.id,
          locationId: null,
        },
        data: { locationId: supervisor.locationId },
      });
    }
  });

const [
    unassignedSupervisors,
    unassignedDrivers,
    unassignedVehicles,
    unassignedTransports,
  ] = await Promise.all([
    prisma.supervisor.count({ where: { locationId: null } }),
    prisma.driver.count({ where: { locationId: null } }),
    prisma.vehicle.count({ where: { locationId: null } }),
    prisma.transportAssignment.count({ where: { locationId: null } }),
  ]);

console.log("Rattachement des lieux termine.");
  console.log("Regisseurs sans lieu :", unassignedSupervisors);
  console.log("Chauffeurs sans lieu :", unassignedDrivers);
  console.log("Vehicules sans lieu :", unassignedVehicles);
  console.log("Transports sans lieu :", unassignedTransports);
}

main()
  .catch((error) => {
    console.error("Erreur durant le rattachement :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
