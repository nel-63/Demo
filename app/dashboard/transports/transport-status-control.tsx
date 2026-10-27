"use client";

import { useState } from "react";

type TransportStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

type Props = {
  id: string;
  status: string;
  isPaid: boolean;
};

const labels: Record<TransportStatus, string> = {
  PLANNED: "Planifié",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
};

export default function TransportStatusControl({
  id,
  status,
  isPaid,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const currentStatus = status as TransportStatus;

  const actions: { value: TransportStatus; label: string }[] =
    currentStatus === "PLANNED"
      ? [
          { value: "IN_PROGRESS", label: "Démarrer" },
          ...(!isPaid ? [{ value: "CANCELLED" as const, label: "Annuler" }] : []),
        ]
      : currentStatus === "IN_PROGRESS"
        ? [
            { value: "COMPLETED", label: "Terminer" },
            ...(!isPaid ? [{ value: "CANCELLED" as const, label: "Annuler" }] : []),
          ]
        : [];

  async function changeStatus(nextStatus: TransportStatus) {
    const confirmation =
      nextStatus === "CANCELLED"
        ? "Confirmer l'annulation de ce transport ?"
        : nextStatus === "COMPLETED"
          ? "Confirmer que ce transport est terminé ?"
          : "Démarrer ce transport ?";

    if (!window.confirm(confirmation)) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/transports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(
          typeof result.error === "string"
            ? result.error
            : "La modification a échoué.",
        );
        return;
      }

      window.location.reload();
    } catch {
      setMessage("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <span
        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
          currentStatus === "CANCELLED"
            ? "bg-red-100 text-red-800"
            : currentStatus === "COMPLETED"
              ? "bg-green-100 text-green-800"
              : currentStatus === "IN_PROGRESS"
                ? "bg-blue-100 text-blue-800"
                : "bg-gray-100 text-gray-800"
        }`}
      >
        {labels[currentStatus] ?? status}
      </span>

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action.value}
              type="button"
              disabled={loading}
              onClick={() => changeStatus(action.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
                action.value === "CANCELLED"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? "Traitement..." : action.label}
            </button>
          ))}
        </div>
      )}

      {isPaid && currentStatus !== "COMPLETED" && currentStatus !== "CANCELLED" && (
        <p className="text-xs text-amber-700">
          Paiement enregistré : l'annulation est bloquée.
        </p>
      )}

      {message && (
        <p role="alert" className="max-w-xs text-xs text-red-700">
          {message}
        </p>
      )}
    </div>
  );
}
