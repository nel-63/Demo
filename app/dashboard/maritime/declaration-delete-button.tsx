"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeclarationDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Supprimer définitivement cette déclaration et tous ses produits ? Cette action est irréversible.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/maritime/declarations/${id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(result.message ?? "Suppression impossible.");
        return;
      }
      router.replace("/dashboard/maritime/new");
      router.refresh();
    } catch {
      window.alert("Impossible de contacter le serveur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={remove} disabled={busy}
      className="rounded-xl border border-red-300 px-4 py-2.5 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
      {busy ? "Suppression..." : "Supprimer définitivement"}
    </button>
  );
}
