"use client";

import { useCallback, useEffect, useState } from "react";

type MaritimeProductType = {
  id: string;
  name: string;
  unitPrice: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function MaritimeProductTypesPage() {
  const [items, setItems] = useState<MaritimeProductType[]>([]);
  const [name, setName] = useState("");
  const [unitPrice, setUnitPrice] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async (query: string) => {
    const response = await fetch(`/api/maritime-product-types?q=${encodeURIComponent(query)}`);
    const result = await response.json().catch(() => ({ maritimeProductTypes: [] }));
    return Array.isArray(result.maritimeProductTypes) ? result.maritimeProductTypes : [];
  }, []);

  useEffect(() => {
    let isMounted = true;

    const refreshProducts = async () => {
      const nextItems = await loadProducts(search);
      if (isMounted) {
        setItems(nextItems);
      }
    };

    void refreshProducts();

    return () => {
      isMounted = false;
    };
  }, [search, loadProducts]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/maritime-product-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, unitPrice, isActive }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.message ?? "Impossible d'enregistrer le produit.");
        return;
      }
      setName("");
      setUnitPrice("0");
      setIsActive(true);
      await loadProducts(search);
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Produits maritimes</h1>
        <p className="mt-2 text-slate-600">Gérez les types de produits disponibles pour les déclarations maritimes.</p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Ajouter un produit</h2>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Nom du produit</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" required maxLength={150} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Prix officiel (MGA/kg)</span>
              <input type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" required />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
              Produit actif
            </label>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={saving} className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Catalogue</h2>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un produit" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="space-y-3">
            {items.length === 0 ? (
              <p className="text-slate-600">Aucun produit maritime trouvé.</p>
            ) : items.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{item.name}</div>
                  <div className="text-sm text-slate-600">{Number(item.unitPrice).toLocaleString("fr-FR")} MGA/kg</div>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${item.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-700"}`}>
                  {item.isActive ? "Actif" : "Inactif"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
