"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_METHOD_LABELS } from "@/lib/audit";
import { PRODUCT_TYPES } from "@/lib/product-types";

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const labelClass = "mb-1 block text-sm font-medium text-slate-800";
const sectionClass = "border-b border-slate-200 pb-2 pt-3 font-semibold text-slate-900";

function Field({
  id,
  label,
  hint,
  required = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span aria-hidden="true" className="ml-1 text-red-600">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-sm text-slate-600">{hint}</p>}
    </div>
  );
}

export default function PassageForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState("CASH");
  const [due, setDue] = useState("");
  const isCash = method === "CASH";

  function handleInvalid(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
    const fields: Record<string, string> = {
      vehicleRegistration: "le numéro d'immatriculation",
      vehicleCharacteristics: "les caractéristiques du véhicule",
      driverName: "le nom du chauffeur",
      driverLicenseNumber: "le numéro de permis du chauffeur",
    };
    const label = fields[target.name];
    if (label) setError(`Le champ ${label} est obligatoire.`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const form = event.currentTarget;
    const values = new FormData(form);
    const requiredFields = [
      ["vehicleRegistration", "l'immatriculation du véhicule"],
      ["vehicleCharacteristics", "les caractéristiques du véhicule"],
      ["driverName", "le nom du chauffeur"],
      ["driverLicenseNumber", "le numéro de permis du chauffeur"],
    ] as const;
    const missingFields = requiredFields
      .filter(([name]) => !String(values.get(name) ?? "").trim())
      .map(([, label]) => label);
    if (missingFields.length > 0) {
      setError(`Renseignez ${missingFields.join(", ")} avant d'enregistrer le passage.`);
      return;
    }

    setLoading(true);
    values.set("paymentMethod", method);
    values.set("amountDue", due);

    try {
      const response = await fetch("/api/passages", {
        method: "POST",
        body: values,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.message ?? "Enregistrement impossible.");
        return;
      }

      setSuccess("Passage et paiement enregistrés.");
      form.reset();
      setMethod("CASH");
      setDue("");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} onInvalidCapture={handleInvalid} className="space-y-4">
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

      <Field id="origin" label="Lieu de départ" hint="">
        <input id="origin" name="origin" type="text" required maxLength={150} placeholder="Lieu de départ" className={inputClass} />
      </Field>
      <Field id="destination" label="Lieu d'arrivée" hint="">
        <input id="destination" name="destination" type="text" required maxLength={150} placeholder="Lieu d'arrivée" className={inputClass} />
      </Field>

      <h3 className={sectionClass}>Véhicule et chauffeur</h3>

      <Field id="vehicleRegistration" label="Numéro d'immatriculation" required>
        <input id="vehicleRegistration" name="vehicleRegistration" required maxLength={40} className={inputClass} />
      </Field>
      <Field id="vehicleCharacteristics" label="Caractéristiques du véhicule" hint="Type, marque, couleur, capacité, etc." required>
        <input id="vehicleCharacteristics" name="vehicleCharacteristics" required maxLength={200} className={inputClass} />
      </Field>
      <Field id="driverName" label="Nom du chauffeur" required>
        <input id="driverName" name="driverName" required maxLength={150} className={inputClass} />
      </Field>
      <Field id="driverLicenseNumber" label="Numéro de permis du chauffeur" required>
        <input id="driverLicenseNumber" name="driverLicenseNumber" required maxLength={80} className={inputClass} />
      </Field>

      <h3 className={sectionClass}>Informations complémentaires sur le transport</h3>
      <Field id="nomOp" label="Nom de l'opérateur">
        <input id="nomOp" name="nomOp" maxLength={150} className={inputClass} />
      </Field>
      <Field id="nomSoc" label="Nom de la société">
        <input id="nomSoc" name="nomSoc" maxLength={200} className={inputClass} />
      </Field>
      <Field id="coli" label="Mode de colisage">
        <input id="coli" name="coli" maxLength={100} className={inputClass} />
      </Field>
      <Field id="nbColi" label="Nombre de colis">
        <input id="nbColi" name="nbColi" type="number" min="0" step="1" inputMode="numeric" className={inputClass} />
      </Field>
      <Field id="nQuittance" label="Numéro de quittance">
        <input id="nQuittance" name="nQuittance" maxLength={100} className={inputClass} />
      </Field>
      <Field id="dateQuittance" label="Date de quittance">
        <input id="dateQuittance" name="dateQuittance" type="date" className={inputClass} />
      </Field>
      <Field id="pjt" label="Pièce jointe — ticket du contrôleur" hint="JPEG, PNG ou WebP. 5 Mo maximum.">
        <input id="pjt" name="pjt" type="file" accept="image/jpeg,image/png,image/webp" className={inputClass} />
      </Field>
      <Field id="quittance" label="Photo de la quittance" hint="JPEG, PNG ou WebP. 5 Mo maximum.">
        <input id="quittance" name="quittance" type="file" accept="image/jpeg,image/png,image/webp" className={inputClass} />
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

      {!isCash && (
        <Field id="reference" label="Référence du paiement" hint="Numéro de virement, de chèque ou de transaction.">
          <input id="reference" name="reference" required maxLength={150} className={inputClass} />
        </Field>
      )}

      <h3 className={sectionClass}>Autres informations (facultatif)</h3>

      <Field id="assignedAt" label="Date du passage" hint="Laissez vide pour utiliser la date d'aujourd'hui.">
        <input id="assignedAt" name="assignedAt" type="date" className={inputClass} />
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
        disabled={loading}
        className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Enregistrement..." : "Enregistrer le passage et le paiement"}
      </button>
    </form>
  );
}
