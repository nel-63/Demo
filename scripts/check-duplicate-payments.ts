import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const payments = await prisma.payment.findMany({
    select: {
      id: true,
      assignmentId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const grouped = new Map<string, string[]>();

  for (const payment of payments) {
    const ids = grouped.get(payment.assignmentId) ?? [];
    ids.push(payment.id);
    grouped.set(payment.assignmentId, ids);
  }

  const duplicates = [...grouped.entries()].filter(([, ids]) => ids.length > 1);

  if (duplicates.length > 0) {
    console.error("Des transports possedent deja plusieurs paiements.");
    console.error("Aucune donnee n'a ete supprimee. Une reconciliation est necessaire.");
    for (const [assignmentId, ids] of duplicates) {
      console.error(`Transport ${assignmentId}: ${ids.length} paiements`);
    }
    process.exitCode = 2;
    return;
  }

  console.log(`Verification terminee : ${payments.length} paiements, aucun doublon.`);
}

main()
  .catch((error) => {
    console.error("Verification des paiements impossible :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });