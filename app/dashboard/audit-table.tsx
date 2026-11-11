import {
  ROLE_LABELS,
  actionLabel,
  describeAudit,
  entityLabel,
} from "@/lib/audit";
import type { fetchAuditRows } from "@/lib/audit-rows";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Indian/Antananarivo",
});

type Rows = Awaited<ReturnType<typeof fetchAuditRows>>;

// Tableau d'opérations (journal d'audit, activité d'un régisseur, activité d'un lieu).
export default function AuditTable({
  rows,
  locationNames,
  showAuthor = true,
}: {
  rows: Rows["rows"];
  locationNames: Rows["locationNames"];
  showAuthor?: boolean;
}) {
  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="border-b text-slate-600">
          <tr>
            <th className="px-3 py-3">Date</th>
            {showAuthor && <th className="px-3 py-3">Auteur</th>}
            <th className="px-3 py-3">Action</th>
            <th className="px-3 py-3">Enregistrement</th>
            <th className="px-3 py-3">Détails</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((log) => {
            const lines = describeAudit(log.entityType, log.action, log.details, {
              locations: locationNames,
            });

            return (
              <tr key={log.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-4">{dateFormatter.format(log.createdAt)}</td>
                {showAuthor && (
                  <td className="px-3 py-4">
                    <p className="font-medium">
                      {log.user.firstName} {log.user.lastName}
                    </p>
                    <p className="text-xs text-slate-700">
                      {ROLE_LABELS[log.user.role] ?? log.user.role} — {log.user.email}
                    </p>
                  </td>
                )}
                <td className="px-3 py-4">{actionLabel(log.action, log.entityType)}</td>
                <td className="px-3 py-4">
                  <p>{entityLabel(log.entityType)}</p>
                  {log.entityId && (
                    <p className="font-mono text-xs text-slate-700" title={log.entityId}>
                      …{log.entityId.slice(-8)}
                    </p>
                  )}
                </td>
                <td className="px-3 py-4">
                  {lines.length === 0 ? (
                    <span className="text-slate-600">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
