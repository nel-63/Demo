"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type VehicleOption = {
  id: string;
  vehicleType: string;
  licensePlate: string;
  driver: { firstName: string; lastName: string };
};

export default function TransportForm({ vehicles }: { vehicles: VehicleOption[] }) {
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
      const response = await fetch("/api/transports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? "Création impossible.");
        return;
      }

      form.reset();
      setSuccess("Le transport et son montant officiel ont été enregistrés.");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="border-b border-slate-200 pb-2 font-semibold">Informations du produit</h3>

      <div>
        <label htmlFor="productName" className="mb-1 block text-sm font-medium">Nom du produit</label>
        <input id="productName" name="productName" required maxLength={150} className={inputClass} />
      </div>

      <div>
        <label htmlFor="productType" className="mb-1 block text-sm font-medium">Type de produit</label>
        <input id="productType" name="productType" required maxLength={100} className={inputClass} />
      </div>

      <div>
        <label htmlFor="tonnage" className="mb-1 block text-sm font-medium">Tonnage</label>
        <input id="tonnage" name="tonnage" type="number" min="0.01" max="99999999.99" step="0.01" required className={inputClass} />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">Description (facultative)</label>
        <textarea id="description" name="description" maxLength={2000} rows={2} className={inputClass} />
      </div>

      <h3 className="border-b border-slate-200 pb-2 pt-3 font-semibold">Informations du transport</h3>

      <div>
        <label htmlFor="amountDue" className="mb-1 block text-sm font-medium">Montant total à régler (MGA)</label>
        <input id="amountDue" name="amountDue" type="number" min="0.01" max="999999999999.99" step="0.01" required className={inputClass} />
        <p className="mt-1 text-xs text-slate-500">Ce montant sera utilisé par la caisse pour exiger un paiement intégral.</p>
      </div>

      <div>
        <label htmlFor="vehicleId" className="mb-1 block text-sm font-medium">Véhicule et chauffeur</label>
        <select id="vehicleId" name="vehicleId" required defaultValue="" disabled={vehicles.length === 0} className={inputClass}>
          <option value="" disabled>Sélectionner un véhicule</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.licensePlate} — {vehicle.vehicleType} ({vehicle.driver.firstName} {vehicle.driver.lastName})
            </option>
          ))}
        </select>
        {vehicles.length === 0 && <p className="mt-1 text-sm text-amber-700">Enregistrez d&apos;abord un véhicule actif pour ce lieu.</p>}
      </div>

      <div>
        <label htmlFor="assignedAt" className="mb-1 block text-sm font-medium">Date du transport</label>
        <input id="assignedAt" name="assignedAt" type="date" className={inputClass} />
      </div>

      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium">Notes (facultatives)</label>
        <textarea id="notes" name="notes" maxLength={2000} rows={2} className={inputClass} />
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{success}</p>}

      <button type="submit" disabled={loading || vehicles.length === 0} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
        {loading ? "Création..." : "Créer le transport"}
      </button>
    </form>
  );
}