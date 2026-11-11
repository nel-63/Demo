"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  calculateMaritimeTotals,
  formatMaritimeAmount,
  type MaritimeProductInput,
} from "@/lib/maritime-declarations";

type DeclarationValues = {
  companyName: string;
  boatName: string;
  boatRegistration: string;
  boatCapacity: string;
  captainName: string;
  captainPhone: string;
  captainEmail: string;
  originDepartureDate: string;
  arrivalDate: string;
  departureDate: string;
  products: MaritimeProductInput[];
};

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const LABEL_CLASS = "mb-1 block text-sm font-medium text-slate-800";
const SECTION_CLASS = "border-b border-slate-200 pb-2 pt-3 text-lg font-semibold text-slate-900";

export default function DeclarationForm({
  initial,
  declarationId,
}: {
  initial?: DeclarationValues;
  declarationId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<DeclarationValues>(
    initial ?? {
      companyName: "",
      boatName: "",
      boatRegistration: "",
      boatCapacity: "",
      captainName: "",
      captainPhone: "",
      captainEmail: "",
      originDepartureDate: "",
      arrivalDate: "",
      departureDate: "",
      products: [{ productType: "", quantity: "", unitPrice: "" }],
    },
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { lineTotals, total } = calculateMaritimeTotals(values.products);

  function setField<K extends keyof Omit<DeclarationValues, "products">>(
    key: K,
    value: DeclarationValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setProduct(index: number, key: keyof MaritimeProductInput, value: string) {
    setValues((current) => ({
      ...current,
      products: current.products.map((product, productIndex) =>
        productIndex === index ? { ...product, [key]: value } : product,
      ),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch(
        declarationId ? `/api/maritime/declarations/${declarationId}` : "/api/maritime/declarations",
        {
          method: declarationId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.message ?? "Enregistrement impossible.");
        return;
      }
      const id = declarationId ?? result.declaration?.id;
      if (typeof id !== "string") {
        setError("La déclaration a été enregistrée, mais sa référence est introuvable.");
        return;
      }
      router.replace(`/dashboard/maritime/${id}`);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="space-y-4">
        <h2 className={SECTION_CLASS}>Société et bateau</h2>
        <label className="block">
          <span className={LABEL_CLASS}>Nom de la société de pêche</span>
          <input className={INPUT_CLASS} required maxLength={200} value={values.companyName}
            onChange={(event) => setField("companyName", event.target.value)} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL_CLASS}>Nom du bateau</span>
            <input className={INPUT_CLASS} required maxLength={150} value={values.boatName}
              onChange={(event) => setField("boatName", event.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Immatriculation</span>
            <input className={INPUT_CLASS} required maxLength={80} value={values.boatRegistration}
              onChange={(event) => setField("boatRegistration", event.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className={LABEL_CLASS}>Capacité du bateau (tonnes)</span>
          <input className={INPUT_CLASS} type="number" min="0.001" max="999999999.999"
            step="0.001" required value={values.boatCapacity}
            onChange={(event) => setField("boatCapacity", event.target.value)} />
        </label>
      </section>

      <section className="space-y-4">
        <h2 className={SECTION_CLASS}>Commandant</h2>
        <label className="block">
          <span className={LABEL_CLASS}>Nom du commandant</span>
          <input className={INPUT_CLASS} required maxLength={150} value={values.captainName}
            onChange={(event) => setField("captainName", event.target.value)} />
        </label>
        <p className="text-sm text-slate-600">Renseignez au moins un moyen de contact : téléphone ou email.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL_CLASS}>Téléphone</span>
            <input className={INPUT_CLASS} type="tel" maxLength={40} value={values.captainPhone}
              onChange={(event) => setField("captainPhone", event.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Email</span>
            <input className={INPUT_CLASS} type="email" maxLength={254} value={values.captainEmail}
              onChange={(event) => setField("captainEmail", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={SECTION_CLASS}>Dates</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={LABEL_CLASS}>Départ du port d&apos;origine</span>
            <input className={INPUT_CLASS} type="date" required value={values.originDepartureDate}
              onChange={(event) => setField("originDepartureDate", event.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Entrée (arrivée ici)</span>
            <input className={INPUT_CLASS} type="date" required value={values.arrivalDate}
              onChange={(event) => setField("arrivalDate", event.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Départ d&apos;ici</span>
            <input className={INPUT_CLASS} type="date" required value={values.departureDate}
              onChange={(event) => setField("departureDate", event.target.value)} />
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={SECTION_CLASS}>Produits</h2>
          <button type="button" onClick={() => setValues((current) => ({
            ...current,
            products: [...current.products, { productType: "", quantity: "", unitPrice: "" }],
          }))} className="rounded-lg border border-blue-700 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">
            + Ajouter un produit
          </button>
        </div>
        {values.products.map((product, index) => (
          <fieldset key={product.id ?? index} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
            <legend className="px-1 text-sm font-semibold text-slate-700">Produit {index + 1}</legend>
            {product.id && <input type="hidden" name="productId" value={product.id} readOnly />}
            <label className="block">
              <span className={LABEL_CLASS}>Type de produit</span>
              <input className={INPUT_CLASS} required maxLength={100} value={product.productType}
                onChange={(event) => setProduct(index, "productType", event.target.value)} />
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Quantité (kg)</span>
              <input className={INPUT_CLASS} type="number" min="0.001" step="0.001" required
                value={product.quantity} onChange={(event) => setProduct(index, "quantity", event.target.value)} />
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Prix (Ar/kg)</span>
              <input className={INPUT_CLASS} type="number" min="0" step="0.01" required
                value={product.unitPrice} onChange={(event) => setProduct(index, "unitPrice", event.target.value)} />
            </label>
            <div>
              <span className={LABEL_CLASS}>Total de la ligne (Ar)</span>
              <output className="block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                {lineTotals[index] === null ? "—" : formatMaritimeAmount(lineTotals[index] ?? "0")}
              </output>
            </div>
            <button type="button" disabled={values.products.length === 1}
              onClick={() => setValues((current) => ({
                ...current,
                products: current.products.filter((_, productIndex) => productIndex !== index),
              }))}
              aria-label={`Retirer le produit ${index + 1}`}
              className="self-end rounded-lg border border-red-300 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
              Retirer
            </button>
          </fieldset>
        ))}
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-right font-semibold text-blue-900" aria-live="polite">
          Total général : {formatMaritimeAmount(total)} Ar
        </p>
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      <button type="submit" disabled={saving || values.products.length === 0}
        className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
        {saving ? "Enregistrement..." : declarationId ? "Enregistrer les modifications" : "Créer la déclaration"}
      </button>
    </form>
  );
}
