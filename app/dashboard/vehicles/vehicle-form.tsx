"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type DriverOption = {
  id: string;
  firstName: string;
  lastName: string;
};

export default function VehicleForm({
  drivers,
}: {
  drivers: DriverOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? "L'enregistrement a échoué.");
        return;
      }

      form.reset();
      setSuccess("Le véhicule a été enregistré.");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="vehicleType" className="mb-1 block text-sm font-medium text-slate-700">
          Type de véhicule
        </label>
        <input
          id="vehicleType"
          name="vehicleType"
          type="text"
          required
          maxLength={100}
          placeholder="Ex. : Camion, camionnette..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label htmlFor="licensePlate" className="mb-1 block text-sm font-medium text-slate-700">
          Numéro d&apos;immatriculation
        </label>
        <input
          id="licensePlate"
          name="licensePlate"
          type="text"
          required
          maxLength={30}
          placeholder="Ex. : 1234 TAA"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 uppercase outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label htmlFor="driverId" className="mb-1 block text-sm font-medium text-slate-700">
          Chauffeur associé
        </label>
        <select
          id="driverId"
          name="driverId"
          required
          disabled={drivers.length === 0}
          defaultValue=""
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        >
          <option value="" disabled>
            Sélectionner un chauffeur
          </option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.firstName} {driver.lastName}
            </option>
          ))}
        </select>

        {drivers.length === 0 && (
          <p className="mt-1 text-sm text-amber-700">
            Enregistrez d&apos;abord un chauffeur actif dans le module Chauffeurs.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {success && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || drivers.length === 0}
        className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Enregistrement..." : "Ajouter le véhicule"}
      </button>
    </form>
  );
}