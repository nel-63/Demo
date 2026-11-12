
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
      setSuccess("Le compte de la société maritime a été créé.");
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
        <label htmlFor="companyName" className="mb-1 block text-sm font-medium text-slate-700">
          Nom de la société maritime
        </label>
        <input
          id="companyName"
          name="companyName"
          required
          maxLength={200}
          autoComplete="organization"
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
          Identifiant de connexion (email)
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="username"
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
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
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
        <p className="mt-1 text-xs text-slate-700">Au moins 12 caractères.</p>
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
        disabled={loading}
        className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {loading ? "Création..." : "Créer le compte de la société"}
      </button>
    </form>
  );
}
