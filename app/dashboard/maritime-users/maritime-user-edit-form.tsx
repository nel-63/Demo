"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Values = { companyName: string; email: string };

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

      setMessage("Les informations de la société ont été modifiées.");
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
          required
          maxLength={200}
          value={values.companyName}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              companyName: event.target.value,
            }))
          }
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
          Identifiant de connexion (email)
        </label>
        <input
          id="email"
          type="email"
          required
          maxLength={254}
          value={values.email}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              email: event.target.value,
            }))
          }
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {loading ? "Enregistrement..." : "Enregistrer les modifications"}
      </button>
    </form>
  );
}