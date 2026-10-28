"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type LocationOption = {
  id: string;
  name: string;
};

export default function LocationAssignmentForm({
  supervisorId,
  currentLocationId,
  supervisorName,
  locations,
}: {
  supervisorId: string;
  currentLocationId: string | null;
  supervisorName: string;
  locations: LocationOption[];
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(currentLocationId ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!locationId) {
      setError("Sélectionnez un lieu.");
      return;
    }

    if (locationId === currentLocationId) {
      setError("Choisissez un lieu différent de l'affectation actuelle.");
      return;
    }

    const confirmed = window.confirm(
      `Affecter ${supervisorName} à ce nouveau lieu ? ` +
      "Les anciennes données resteront dans leur lieu d'origine."
    );

    if (!confirmed) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/supervisors/${supervisorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? "Modification impossible.");
        return;
      }

      setMessage(result.message ?? "Affectation modifiée.");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="min-w-56 space-y-2">
      <select
        value={locationId}
        onChange={(event) => setLocationId(event.target.value)}
        required
        disabled={loading || locations.length === 0}
        aria-label={`Nouveau lieu pour ${supervisorName}`}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
      >
        <option value="" disabled>
          Choisir un lieu
        </option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={loading || locations.length === 0 || !locationId || locationId === currentLocationId}
        className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Enregistrement..." : "Changer le lieu"}
      </button>

      {message && (
        <p role="status" className="text-xs text-green-700">{message}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">{error}</p>
      )}
    </form>
  );
}