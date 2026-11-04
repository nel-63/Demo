import Link from "next/link";
import { ALL_PAYMENT_METHOD_LABELS, formatMGA } from "@/lib/audit";
import AttachmentViewer from "./passages/attachment-viewer";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeZone: "Indian/Antananarivo",
});

type Row = {
  id: string;
  assignedAt: Date;
  origin: string;
  destination: string;
  vehicleInfo: string | null;
  driverName: string | null;
  nomOp: string | null;
  nomSoc: string | null;
  coli: string | null;
  nbColi: number | null;
  nQuittance: string | null;
  hasPjt: boolean;
  hasQuittance: boolean;
  product: { name: string; type: string; tonnage: unknown };
  supervisor: { id: string; user: { firstName: string; lastName: string } };
  assignedLocation: { id: string; name: string } | null;
  payment: { paymentMethod: string; reference: string | null; amountDue: unknown } | null;
};

// Liste de passages pour l'administrateur : qui l'a enregistré, par quel lieu, d'où vers où.
export default function PassagesTable({
  rows,
  showSupervisor = true,
  showLocation = true,
}: {
  rows: Row[];
  showSupervisor?: boolean;
  showLocation?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-slate-700">
          <tr>
            <th className="px-3 py-3">Date</th>
            <th className="px-3 py-3">Produit</th>
            <th className="px-3 py-3 text-right">Tonnage</th>
            <th className="px-3 py-3">Origine</th>
            {showLocation && <th className="px-3 py-3">Lieu de passage</th>}
            <th className="px-3 py-3">Destination</th>
            <th className="px-3 py-3">Véhicule / chauffeur</th>
            <th className="px-3 py-3">Informations transport</th>
            <th className="px-3 py-3">Pièces jointes</th>
            <th className="px-3 py-3 text-right">Montant payé</th>
            <th className="px-3 py-3">Mode</th>
            {showSupervisor && <th className="px-3 py-3">Enregistré par</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((item) => (
            <tr key={item.id} className="align-top hover:bg-blue-50">
              <td className="whitespace-nowrap px-3 py-4">{dateFormatter.format(item.assignedAt)}</td>
              <td className="px-3 py-4">
                <p className="font-medium text-slate-900">{item.product.name}</p>
                <p className="text-xs text-slate-700">{item.product.type}</p>
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-right">
                {Number(item.product.tonnage).toLocaleString("fr-FR")} t
              </td>
              <td className="px-3 py-4">{item.origin}</td>
              {showLocation && (
                <td className="px-3 py-4">
                  {item.assignedLocation ? (
                    <Link
                      href={`/dashboard/locations/${item.assignedLocation.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {item.assignedLocation.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              )}
              <td className="px-3 py-4">{item.destination}</td>
              <td className="px-3 py-4">
                {item.vehicleInfo || item.driverName ? (
                  <>
                    {item.vehicleInfo && <p>{item.vehicleInfo}</p>}
                    {item.driverName && <p className="text-xs text-slate-700">{item.driverName}</p>}
                  </>
                ) : (
                  <span className="text-slate-600">—</span>
                )}
              </td>
              <td className="px-3 py-4">
                <p>Opérateur : {item.nomOp || "—"}</p>
                <p>Société : {item.nomSoc || "—"}</p>
                <p>Colisage : {item.coli || "—"}</p>
                <p>Nombre de colis : {item.nbColi ?? "—"}</p>
                <p>N° quittance : {item.nQuittance || "—"}</p>
              </td>
              <td className="px-3 py-4">
                <AttachmentViewer passageId={item.id} hasPjt={item.hasPjt} hasQuittance={item.hasQuittance} />
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-right">
                {item.payment ? formatMGA(item.payment.amountDue) : "—"}
              </td>
              <td className="px-3 py-4">
                {item.payment ? (
                  <>
                    {ALL_PAYMENT_METHOD_LABELS[item.payment.paymentMethod] ?? item.payment.paymentMethod}
                    {item.payment.reference && (
                      <p className="text-xs text-slate-700">{item.payment.reference}</p>
                    )}
                  </>
                ) : (
                  "—"
                )}
              </td>
              {showSupervisor && (
                <td className="px-3 py-4">
                  <Link
                    href={`/dashboard/supervisors/${item.supervisor.id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {item.supervisor.user.firstName} {item.supervisor.user.lastName}
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
