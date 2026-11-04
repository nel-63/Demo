"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LocationActions({
  id,
  name,
  deleted,
}: {
  id: string;
  name: string;
  deleted: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function updateLocation() {
    const confirmation = deleted
      ? "Voulez-vous restaurer le lieu « " + name + " » ? Il redeviendra visible dans l'application."
      : "Voulez-vous supprimer le lieu « " + name + " » ? Il sera placé dans la corbeille. Toutes ses données seront conservées.";
    if (!window.confirm(confirmation)) return;

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/locations/" + id, {
        method: deleted ? "PATCH" : "DELETE",
        ...(deleted
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "RESTORE" }) }
          : {}),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message ?? "Modification impossible.");
        return;
      }
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={updateLocation}
        disabled={busy}
        className={`rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${deleted ? "border-emerald-300 text-emerald-800 hover:bg-emerald-50" : "border-red-300 text-red-700 hover:bg-red-50"}`}
      >
        {busy ? "En cours..." : deleted ? "Restaurer" : "Supprimer"}
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
