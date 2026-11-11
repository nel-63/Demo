"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  calculateMaritimeTotals,
  formatMaritimeAmount,
  type MaritimeProductInput,
} from "@/lib/maritime-declarations";

type MaritimeCatalogItem = {
  id: string;
  name: string;
  unitPrice: string;
  isActive: boolean;
};

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
  const [catalog, setCatalog] = useState<MaritimeCatalogItem[]>([]);
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
      products: [{ productId: "", productType: "", quantity: "" }],
    },
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadCatalog() {
      const response = await fetch("/api/maritime-product-types");
      const result = await response.json().catch(() => ({ maritimeProductTypes: [] }));
      const items = Array.isArray(result.maritimeProductTypes) ? result.maritimeProductTypes : [];
      setCatalog(items.filter((item: { isActive?: boolean }) => item.isActive !== false));
    }
    void loadCatalog();
  }, []);

  const normalizedProducts = values.products.map((product) => {
    const catalogItem = catalog.find((item) => item.id === product.productId);
    const price = catalogItem ? catalogItem.unitPrice : product.unitPrice ?? "0";
    return { ...product, unitPrice: price };
  });
  const { lineTotals, total } = calculateMaritimeTotals(normalizedProducts as Array<{ quantity: string; unitPrice: string }>);

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
      const payload = {
        ...values,
        products: values.products.map((product) => ({
          ...product,
          productType: product.productType || catalog.find((item) => item.id === product.productId)?.name || "",
          unitPrice: product.unitPrice || catalog.find((item) => item.id === product.productId)?.unitPrice || undefined,
        })),
      };
      const response = await fetch(
        declarationId ? `/api/maritime/declarations/${declarationId}` : "/api/maritime/declarations",
        {
          method: declarationId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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

  const canAddProduct = catalog.length > 0;

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
          <button
            type="button"
            onClick={() => setValues((current) => ({
              ...current,
              products: [...current.products, { productId: "", productType: "", quantity: "", unitPrice: "" }],
            }))}
            disabled={!canAddProduct}
            className="rounded-lg border border-blue-700 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Ajouter un produit
          </button>
        </div>

        {!canAddProduct && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Aucun produit maritime actif n&apos;est disponible. Demandez à l&apos;administrateur de créer un catalogue avant d&apos;ajouter une déclaration.
          </p>
        )}

        {values.products.map((product, index) => {
          const selectedProduct = catalog.find((item) => item.id === product.productId);
          const officialUnitPrice = selectedProduct ? selectedProduct.unitPrice : product.unitPrice ?? "0";
          const lineTotal = calculateMaritimeTotals([{ quantity: product.quantity || "0", unitPrice: officialUnitPrice }]).lineTotals[0];

          return (
            <fieldset key={`${index}-${product.productId ?? "empty"}`} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
              <legend className="px-1 text-sm font-semibold text-slate-700">Produit {index + 1}</legend>
              <label className="block">
                <span className={LABEL_CLASS}>Type de produit</span>
                <select
                  className={INPUT_CLASS}
                  value={product.productId ?? ""}
                  onChange={(event) => {
                    const nextProductId = event.target.value;
                    const nextProduct = catalog.find((item) => item.id === nextProductId);
                    setProduct(index, "productId", nextProductId);
                    setProduct(index, "productType", nextProduct?.name ?? "");
                    setProduct(index, "unitPrice", nextProduct?.unitPrice ?? "");
                  }}
                  disabled={catalog.length === 0}
                >
                  <option value="">Sélectionner un produit</option>
                  {catalog.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={LABEL_CLASS}>Quantité (kg)</span>
                <input className={INPUT_CLASS} type="number" min="0.001" step="0.001" required
                  value={product.quantity} onChange={(event) => setProduct(index, "quantity", event.target.value)} />
              </label>
              <div>
                <span className={LABEL_CLASS}>Prix officiel (MGA/kg)</span>
                <output className="block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                  {officialUnitPrice ? formatMaritimeAmount(officialUnitPrice) : "—"}
                </output>
              </div>
              <div>
                <span className={LABEL_CLASS}>Montant de la ligne (MGA)</span>
                <output className="block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                  {lineTotal === null ? "—" : formatMaritimeAmount(lineTotal ?? "0")}
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
          );
        })}

        <p className="rounded-xl bg-blue-50 px-4 py-3 text-right font-semibold text-blue-900" aria-live="polite">
          Total général : {formatMaritimeAmount(total)} MGA
        </p>
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      <button type="submit" disabled={saving || values.products.length === 0 || !canAddProduct}
        className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
        {saving ? "Enregistrement..." : declarationId ? "Enregistrer les modifications" : "Créer la déclaration"}
      </button>
    </form>
  );
}
