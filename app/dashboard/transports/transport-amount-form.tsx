"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function TransportAmountForm({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch(`/api/transports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? result.message ?? "Modification impossible.");
        return;
      }

      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="min-w-36 space-y-2">
      <input
        name="amountDue"
        type="number"
        min="0.01"
        max="999999999999.99"
        step="0.01"
        required
        aria-label="Montant total a regler"
        placeholder="Montant MGA"
        className="w-full rounded-lg border border-slate-300 px-2 py-2"
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {loading ? "..." : "Fixer le montant"}
      </button>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </form>
  );
}