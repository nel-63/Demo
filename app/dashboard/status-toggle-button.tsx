"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StatusToggleButton({
  endpoint,
  isActive,
  itemLabel,
}: {
  endpoint: string;
  isActive: boolean;
  itemLabel: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function toggleStatus() {
    const nextStatus = !isActive;
    const question = nextStatus
      ? "Réactiver cet élément ?"
      : "Désactiver cet élément ?";

    if (!window.confirm(question)) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextStatus }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.message ?? "La modification a échoué.");
        return;
      }

      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggleStatus}
        disabled={loading}
        aria-label={`${isActive ? "Désactiver" : "Réactiver"} ${itemLabel}`}
        className={isActive
          ? "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          : "rounded-lg border border-green-200 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
        }
      >
        {loading
          ? "En cours..."
          : isActive
            ? "Désactiver"
            : "Réactiver"}
      </button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}