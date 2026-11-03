"use client";

import { useRef, useState } from "react";
import { FileText, History, Pencil, Trash2, X } from "lucide-react";
import type { HistoryEntry } from "@/lib/passage-history";

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Indian/Antananarivo",
});

const KIND_STYLE = {
  initial: { icon: FileText, circle: "bg-slate-100 text-slate-800" },
  updated: { icon: Pencil, circle: "bg-blue-100 text-blue-800" },
  deleted: { icon: Trash2, circle: "bg-red-100 text-red-800" },
} as const;

export default function PassageHistory({
  passageId,
  productName,
}: {
  passageId: string;
  productName: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState("");

  async function open() {
    dialogRef.current?.showModal();
    // On recharge à chaque ouverture : le passage a pu être modifié entre-temps.
    setEntries(null);
    setError("");
    try {
      const response = await fetch(`/api/passages/${passageId}/history`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.message ?? "Historique inaccessible.");
        return;
      }
      setEntries(result.entries ?? []);
    } catch {
      setError("Impossible de charger l'historique.");
    }
  }

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <History className="size-4 shrink-0" aria-hidden="true" />
        Voir l&apos;historique
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`history-title-${passageId}`}
        onClick={(event) => {
          // Un clic sur le fond assombri ferme la fenêtre.
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto max-h-[85vh] w-[min(42rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50"
      >
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
            <div>
              <h2 id={`history-title-${passageId}`} className="text-lg font-bold">
                Historique du passage
              </h2>
              <p className="mt-1 text-sm text-slate-700">
                {productName}. Rien n&apos;est jamais effacé : chaque changement est conservé.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Fermer l'historique"
              className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </header>

          <div className="overflow-y-auto p-5">
            {error ? (
              <p role="alert" className="text-sm font-medium text-red-700">{error}</p>
            ) : entries === null ? (
              <p className="text-sm text-slate-700">Chargement de l&apos;historique...</p>
            ) : entries.length === 0 ? (
              <p className="text-sm text-slate-800">
                Aucun changement : ce passage est toujours tel qu&apos;il a été enregistré.
              </p>
            ) : (
              <ol className="space-y-6">
                {entries.map((entry) => {
                  const { icon: Icon, circle } = KIND_STYLE[entry.kind];
                  return (
                    <li key={entry.id} className="flex gap-4">
                      <span
                        aria-hidden="true"
                        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${circle}`}
                      >
                        <Icon className="size-4" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">
                          {entry.title}
                          {entry.author && (
                            <span className="font-normal text-slate-700"> par {entry.author}</span>
                          )}
                        </p>
                        <p className="text-sm text-slate-700">
                          {dateTimeFormatter.format(new Date(entry.when))}
                        </p>

                        {entry.kind === "updated" && entry.changes.length === 0 && (
                          <p className="mt-3 text-sm text-slate-700">
                            Aucune information visible n&apos;a changé.
                          </p>
                        )}

                        {entry.changes.length > 0 && (
                          <ul className="mt-3 space-y-2">
                            {entry.changes.map((change) => (
                              <li key={change.label} className="rounded-xl bg-slate-50 p-3 text-sm">
                                <p className="font-semibold text-slate-900">{change.label}</p>
                                <p className="mt-1 text-slate-800">
                                  <span className="text-slate-700">Avant : </span>
                                  <span className="line-through">{change.before}</span>
                                </p>
                                <p className="text-slate-800">
                                  <span className="text-slate-700">Maintenant : </span>
                                  <span className="font-semibold text-emerald-800">{change.after}</span>
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}

                        {entry.details.length > 0 && (
                          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-slate-50 p-3 text-sm">
                            {entry.details.map((detail) => (
                              <div key={detail.label} className="contents">
                                <dt className="text-slate-700">{detail.label}</dt>
                                <dd className="font-medium text-slate-900">{detail.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
