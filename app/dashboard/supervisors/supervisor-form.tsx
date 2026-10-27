"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type LocationOption = {
  id: string;
  name: string;
};

export default function SupervisorForm({
  locations,
}: {
  locations: LocationOption[];
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
      const response = await fetch("/api/supervisors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? "Creation impossible.");
        return;
      }

      form.reset();
      setSuccess("Le compte du regisseur a ete cree et affecte au lieu choisi.");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    { name: "firstName", label: "Prenom", required: true },
    { name: "lastName", label: "Nom", required: true },
    { name: "email", label: "Adresse email", type: "email", required: true },
    { name: "phoneNumber", label: "Telephone", type: "tel", required: false },
    { name: "nationalId", label: "Numero CIN", required: true },
    { name: "address", label: "Adresse personnelle", required: false },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((field) => (
        <div key={field.name}>
          <label htmlFor={field.name} className="mb-1 block text-sm font-medium text-slate-700">
            {field.label}
          </label>
          <input
            id={field.name}
            name={field.name}
            type={field.type ?? "text"}
            required={field.required}
            maxLength={field.name === "address" ? 300 : 100}
            autoComplete={field.name === "email" ? "email" : "off"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      ))}

      <div>
        <label htmlFor="locationId" className="mb-1 block text-sm font-medium text-slate-700">
          Lieu d'affectation
        </label>
        <select
          id="locationId"
          name="locationId"
          required
          defaultValue=""
          disabled={locations.length === 0}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
        >
          <option value="" disabled>
            Selectionner un lieu
          </option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>

        {locations.length === 0 && (
          <p className="mt-2 text-sm text-amber-700">
            Aucun lieu n'est disponible. Cree d'abord un lieu.
          </p>
        )}
        <Link href="/dashboard/locations" className="mt-2 inline-block text-sm text-blue-700 hover:underline">
          Creer ou consulter les lieux
        </Link>
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
          Mot de passe initial
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={200}
          autoComplete="new-password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
        />
        <p className="mt-1 text-xs text-slate-500">
          Au moins 12 caracteres.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {success && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || locations.length === 0}
        className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {loading ? "Creation..." : "Creer le regisseur"}
      </button>
    </form>
  );
}