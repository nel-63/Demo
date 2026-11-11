"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function MaritimeUserForm() {
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
      const response = await fetch("/api/maritime-users", {
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
      setSuccess("Le compte de l'utilisateur maritime a été créé.");
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
    { name: "latitude", label: "Latitude", required: true, min: "-90", max: "90" },
    { name: "longitude", label: "Longitude", required: true, min: "-180", max: "180" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((field) => (
        <div key={field.name}>
          <label htmlFor={field.name} className="mb-1 block text-sm font-medium text-slate-700">{field.label}</label>
          <input
            id={field.name}
            name={field.name}
            type={field.type ?? "text"}
            inputMode={field.min ? "decimal" : undefined}
            required={field.required}
            min={field.min}
            max={field.max}
            maxLength={field.name === "email" ? 254 : 100}
            autoComplete={field.name === "email" ? "email" : "off"}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      ))}
      <p className="-mt-2 text-xs text-slate-600">Saisissez les coordonnées en degrés décimaux, avec un point comme séparateur (6 décimales maximum).</p>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">Mot de passe initial</label>
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
        <p className="mt-1 text-xs text-slate-700">Au moins 12 caractères.</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{success}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {loading ? "Création..." : "Créer l'utilisateur maritime"}
      </button>
    </form>
  );
}
