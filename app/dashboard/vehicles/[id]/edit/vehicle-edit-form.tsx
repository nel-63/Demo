"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type VehicleData = {
  id: string;
  vehicleType: string;
  licensePlate: string;
  driver: { firstName: string; lastName: string };
};

export default function VehicleEditForm({ vehicle }: { vehicle: VehicleData }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch(`/api/vehicles/${vehicle.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? "Modification impossible.");
        return;
      }

      router.replace("/dashboard/vehicles");
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
        <label htmlFor="vehicleType" className="mb-1 block text-sm font-medium text-slate-700">Type de vehicule</label>
        <input id="vehicleType" name="vehicleType" required maxLength={100}
          defaultValue={vehicle.vehicleType}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
      </div>

      <div>
        <label htmlFor="licensePlate" className="mb-1 block text-sm font-medium text-slate-700">Immatriculation</label>
        <input id="licensePlate" name="licensePlate" required maxLength={30}
          defaultValue={vehicle.licensePlate}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 uppercase" />
      </div>

      <div className="rounded-lg bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-700">Chauffeur actuellement associe</p>
        <p className="mt-1 text-slate-600">{vehicle.driver.firstName} {vehicle.driver.lastName}</p>
        <p className="mt-2 text-xs text-slate-500">
          Le changement de chauffeur n&apos;est pas effectue depuis ce formulaire afin de preserver l&apos;historique des transports.
        </p>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <button disabled={loading} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">
        {loading ? "Enregistrement..." : "Enregistrer les modifications"}
      </button>

      <Link href="/dashboard/vehicles" className="block text-center text-sm text-blue-700 hover:underline">
        Annuler
      </Link>
    </form>
  );
}