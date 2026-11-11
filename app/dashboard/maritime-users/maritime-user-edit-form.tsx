"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Values = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  latitude?: string;
  longitude?: string;
};

export default function MaritimeUserEditForm({
  maritimeUserId,
  initialValues,
}: {
  maritimeUserId: string;
  initialValues: Values;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(`/api/maritime-users/${maritimeUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message ?? "Modification impossible.");
        return;
      }
      setMessage("Les informations ont été modifiées.");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    { name: "firstName", label: "Prénom", required: true },
    { name: "lastName", label: "Nom", required: true },
    { name: "email", label: "Adresse email / identifiant", type: "email", required: true },
    { name: "phoneNumber", label: "Téléphone", type: "tel", required: false },
    { name: "latitude", label: "Latitude", required: false, min: "-90", max: "90" },
    { name: "longitude", label: "Longitude", required: false, min: "-180", max: "180" },
  ] as const;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((field) => (
        <div key={field.name}>
          <label htmlFor={field.name} className="mb-1 block text-sm font-medium text-slate-700">{field.label}</label>
          <input
            id={field.name}
            name={field.name}
            type={"type" in field ? field.type : "text"}
            inputMode={"min" in field ? "decimal" : undefined}
            required={field.required}
            min={"min" in field ? field.min : undefined}
            max={"max" in field ? field.max : undefined}
            maxLength={field.name === "email" ? 254 : 100}
            value={values[field.name] ?? ""}
            onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      ))}
      <p className="-mt-2 text-xs text-slate-600">Coordonnées en degrés décimaux, avec un point comme séparateur (6 décimales maximum).</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
      <button type="submit" disabled={loading} className="rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
        {loading ? "Enregistrement..." : "Enregistrer les modifications"}
      </button>
    </form>
  );
}
