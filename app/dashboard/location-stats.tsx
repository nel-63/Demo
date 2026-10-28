import { prisma } from "@/lib/prisma";

function money(value: unknown) {
  return `${Number(value ?? 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MGA`;
}

export default async function LocationStats() {
  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          supervisors: true,
          drivers: true,
          vehicles: true,
          assignments: true,
        },
      },
    },
  });

  const rows = await Promise.all(
    locations.map(async (location) => {
      const totals = await prisma.payment.aggregate({
        where: {
          assignment: { is: { locationId: location.id } },
        },
        _count: { _all: true },
        _sum: { amountReceived: true },
      });

      return {
        ...location,
        paymentCount: totals._count._all,
        amountReceived: totals._sum.amountReceived,
      };
    })
  );

  return (
    <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-xl font-semibold text-slate-900">
        Statistiques par lieu
      </h2>
      <p className="mb-5 text-sm text-slate-500">
        Vue globale de chaque lieu d&apos;affectation.
      </p>

      {rows.length === 0 ? (
        <p className="text-slate-500">Aucun lieu enregistre.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">Lieu</th>
                <th className="px-3 py-3 font-medium">Regisseurs</th>
                <th className="px-3 py-3 font-medium">Chauffeurs</th>
                <th className="px-3 py-3 font-medium">Vehicules</th>
                <th className="px-3 py-3 font-medium">Transports</th>
                <th className="px-3 py-3 font-medium">Paiements</th>
                <th className="px-3 py-3 font-medium">Montant recu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((location) => (
                <tr key={location.id} className="hover:bg-slate-50">
                  <td className="px-3 py-4 font-medium text-slate-900">
                    {location.name}
                  </td>
                  <td className="px-3 py-4">{location._count.supervisors}</td>
                  <td className="px-3 py-4">{location._count.drivers}</td>
                  <td className="px-3 py-4">{location._count.vehicles}</td>
                  <td className="px-3 py-4">{location._count.assignments}</td>
                  <td className="px-3 py-4">{location.paymentCount}</td>
                  <td className="px-3 py-4 whitespace-nowrap font-medium">
                    {money(location.amountReceived)}
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