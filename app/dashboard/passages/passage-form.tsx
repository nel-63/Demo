"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_METHOD_LABELS, formatMGA } from "@/lib/audit";
import { PRODUCT_TYPES } from "@/lib/product-types";

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const labelClass = "mb-1 block text-sm font-medium text-slate-800";
const sectionClass = "border-b border-slate-200 pb-2 pt-3 font-semibold text-slate-900";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-sm text-slate-600">{hint}</p>}
    </div>
  );
}

export default function PassageForm({ locations }: { locations: string[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState("CASH");
  const [due, setDue] = useState("");
  const [received, setReceived] = useState("");

  const isCash = method === "CASH";
  // Hors espèces, le montant reçu est forcément le montant à payer.
  const receivedValue = isCash ? received : due;
  const dueNumber = Number(due);
  const receivedNumber = Number(receivedValue);
  const hasAmounts = due !== "" && receivedValue !== "" && dueNumber > 0 && receivedNumber > 0;
  const change = hasAmounts && isCash ? receivedNumber - dueNumber : 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const form = event.currentTarget;
    const values = {
      ...Object.fromEntries(new FormData(form).entries()),
      paymentMethod: method,
      amountDue: due,
      amountReceived: receivedValue,
    };

    try {
      const response = await fetch("/api/passages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.message ?? "Enregistrement impossible.");
        return;
      }

      setSuccess(
        change > 0
          ? `Passage enregistré. Monnaie à rendre : ${formatMGA(change)}.`
          : "Passage et paiement enregistrés.",
      );
      form.reset();
      setMethod("CASH");
      setDue("");
      setReceived("");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className={sectionClass}>Produit</h3>

      <Field id="productName" label="Nom du produit">
        <input id="productName" name="productName" required maxLength={150} className={inputClass} />
      </Field>
      <Field id="productType" label="Type de produit">
        <select id="productType" name="productType" required defaultValue="" className={inputClass}>
          <option value="" disabled>Choisir une catégorie</option>
          {PRODUCT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </Field>
      <Field id="tonnage" label="Tonnage (tonnes)">
        <input
          id="tonnage" name="tonnage" type="number" inputMode="decimal"
          min="0.01" max="99999999.99" step="0.01" required className={inputClass}
        />
      </Field>

      <h3 className={sectionClass}>Trajet</h3>

      <Field id="origin" label="D'où vient le produit" hint="Lieu de départ.">
        <select id="origin" name="origin" required defaultValue="" className={inputClass}>
          <option value="" disabled>Choisir un lieu</option>
          {locations.map((location) => <option key={location} value={location}>{location}</option>)}
        </select>
      </Field>
      <Field id="destination" label="Où va le produit" hint="Lieu d'arrivée. Le passage est rattaché à votre lieu.">
        <select id="destination" name="destination" required defaultValue="" className={inputClass}>
          <option value="" disabled>Choisir un lieu</option>
          {locations.map((location) => <option key={location} value={location}>{location}</option>)}
        </select>
      </Field>

      <h3 className={sectionClass}>Véhicule et chauffeur (facultatif)</h3>

      <Field id="vehicleRegistration" label="Numéro d'immatriculation">
        <input id="vehicleRegistration" name="vehicleRegistration" maxLength={40} className={inputClass} />
      </Field>
      <Field id="vehicleCharacteristics" label="Caractéristiques du véhicule" hint="Type, marque, couleur, capacité, etc.">
        <input id="vehicleCharacteristics" name="vehicleCharacteristics" maxLength={200} className={inputClass} />
      </Field>
      <Field id="vehicleInfo" label="Informations complémentaires sur le véhicule">
        <input id="vehicleInfo" name="vehicleInfo" maxLength={200} className={inputClass} />
      </Field>
      <Field id="driverName" label="Nom du chauffeur">
        <input id="driverName" name="driverName" maxLength={150} className={inputClass} />
      </Field>
      <Field id="driverLicenseNumber" label="Numéro de permis du chauffeur">
        <input id="driverLicenseNumber" name="driverLicenseNumber" maxLength={80} className={inputClass} />
      </Field>

      <h3 className={sectionClass}>Paiement</h3>

      <Field id="amountDue" label="Montant à payer (MGA)">
        <input
          id="amountDue" type="number" inputMode="decimal" min="0.01" step="0.01" required
          value={due} onChange={(event) => setDue(event.target.value)} className={inputClass}
        />
      </Field>

      <Field id="paymentMethod" label="Mode de paiement">
        <select
          id="paymentMethod" value={method} onChange={(event) => setMethod(event.target.value)}
          className={inputClass}
        >
          {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </Field>

      <Field
        id="amountReceived"
        label="Montant reçu (MGA)"
        hint={isCash ? undefined : "Hors espèces, le paiement doit être exact."}
      >
        <input
          id="amountReceived" type="number" inputMode="decimal" min="0.01" step="0.01" required
          readOnly={!isCash} value={receivedValue} onChange={(event) => setReceived(event.target.value)}
          className={`${inputClass} ${isCash ? "" : "bg-slate-100"}`}
        />
      </Field>

      {!isCash && (
        <Field id="reference" label="Référence du paiement" hint="Numéro de virement, de chèque ou de transaction.">
          <input id="reference" name="reference" required maxLength={150} className={inputClass} />
        </Field>
      )}

      {hasAmounts && isCash && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            change < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {change < 0
            ? `Montant insuffisant : il manque ${formatMGA(-change)}. Le passage ne peut pas être enregistré.`
            : change === 0
              ? "Montant exact, aucune monnaie à rendre."
              : `Monnaie à rendre : ${formatMGA(change)}.`}
        </p>
      )}

      <h3 className={sectionClass}>Autres informations (facultatif)</h3>

      <Field id="assignedAt" label="Date du passage" hint="Laissez vide pour utiliser la date d'aujourd'hui.">
        <input id="assignedAt" name="assignedAt" type="date" className={inputClass} />
      </Field>
      <Field id="notes" label="Observations">
        <textarea id="notes" name="notes" maxLength={2000} rows={2} className={inputClass} />
      </Field>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || (isCash && hasAmounts && change < 0)}
        className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Enregistrement..." : "Enregistrer le passage et le paiement"}
      </button>
    </form>
  );
}
