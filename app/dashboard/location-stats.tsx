import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatMGA } from "@/lib/audit";

export default async function LocationStats() {
  const locations = await prisma.location.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: { select: { supervisors: true, passages: { where: { deletedAt: null } } } },
    },
  });

  const rows = await Promise.all(
    locations.map(async (location) => {
      const [tonnage, payments] = await Promise.all([
        prisma.product.aggregate({
          where: { deletedAt: null, passage: { is: { locationId: location.id, deletedAt: null } } },
          _sum: { tonnage: true },
        }),
        prisma.payment.aggregate({
          where: { deletedAt: null, passage: { is: { locationId: location.id, deletedAt: null } } },
          _sum: { amountDue: true },
        }),
      ]);

      return {
        ...location,
        tonnage: tonnage._sum.tonnage,
        amountPaid: payments._sum.amountDue,
      };
    }),
  );

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-xl font-semibold text-slate-900">Statistiques par lieu</h2>
      <p className="mb-5 text-sm text-slate-700">
        Cliquez sur un lieu pour voir tout ce qui y a été fait.
      </p>

      {rows.length === 0 ? (
        <p className="text-slate-700">Aucun lieu enregistré.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-700">
              <tr>
                <th className="px-3 py-3 font-medium">Lieu</th>
                <th className="px-3 py-3 text-right font-medium">Régisseurs</th>
                <th className="px-3 py-3 text-right font-medium">Passages</th>
                <th className="px-3 py-3 text-right font-medium">Tonnage</th>
                <th className="px-3 py-3 text-right font-medium">Montant payé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((location) => (
                <tr key={location.id} className="hover:bg-blue-50">
                  <td className="px-3 py-4 font-medium">
                    <Link href={`/dashboard/locations/${location.id}`} className="text-blue-700 hover:underline">
                      {location.name}
                    </Link>
                  </td>
                  <td className="px-3 py-4 text-right">{location._count.supervisors}</td>
                  <td className="px-3 py-4 text-right">{location._count.passages}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">
                    {Number(location.tonnage ?? 0).toLocaleString("fr-FR")} t
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-right font-medium">
                    {formatMGA(location.amountPaid ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
