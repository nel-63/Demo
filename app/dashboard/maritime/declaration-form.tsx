"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { calculateMaritimeTotals, formatMaritimeAmount, type MaritimeProductInput } from "@/lib/maritime-declarations";

type CatalogItem = { id: string; name: string; unitPrice: string; isActive?: boolean };
type Values = {
  companyName: string; contactEmail: string; contactPhone: string;
  boatName: string; boatRegistration: string; boatCapacity: string;
  captainName: string; captainPhone: string; captainEmail: string;
  originDepartureDate: string; arrivalDate: string; departureDate: string;
  latitude: string; longitude: string; products: MaritimeProductInput[];
};
type ProductLine = MaritimeProductInput & { key: string };
const STORED = "__stored__";
const INPUT = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const LABEL = "mb-1 block text-sm font-medium text-slate-800";
const SECTION = "border-b border-slate-200 pb-2 pt-3 text-lg font-semibold text-slate-900";
const EMPTY: Values = {
  companyName: "", contactEmail: "", contactPhone: "", boatName: "", boatRegistration: "",
  boatCapacity: "", captainName: "", captainPhone: "", captainEmail: "",
  originDepartureDate: "", arrivalDate: "", departureDate: "", latitude: "", longitude: "", products: [],
};

export default function DeclarationForm({ initial, declarationId }: { initial?: Values; declarationId?: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<Omit<Values, "products">>(() => {
    const value = { ...(initial ?? EMPTY) };
    delete (value as Partial<Values>).products;
    return value;
  });
  const [lines, setLines] = useState<ProductLine[]>(() =>
    (initial?.products ?? []).map((line, index) => ({ ...line, key: "saved-" + index })),
  );
  const keyCounter = useRef(0);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState(declarationId ?? "");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/maritime-product-types");
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (!cancelled) setCatalogError(result.message ?? "Impossible de charger la liste des produits.");
          return;
        }
        const items = Array.isArray(result.maritimeProductTypes) ? result.maritimeProductTypes : [];
        if (!cancelled) setCatalog(items.filter((item: CatalogItem) => item.isActive !== false));
      } catch {
        if (!cancelled) setCatalogError("Impossible de contacter le serveur pour charger les produits.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const itemOf = (line: ProductLine) => line.productId ? catalog.find((item) => item.id === line.productId) : undefined;
  const priceOf = (line: ProductLine) => itemOf(line)?.unitPrice ?? line.unitPrice ?? "0";
  const { total } = calculateMaritimeTotals(lines.map((line) => ({
    quantity: line.quantity || "0", unitPrice: priceOf(line),
  })));

  function setField<K extends keyof Omit<Values, "products">>(key: K, value: Omit<Values, "products">[K]) {
    setInfo((current) => ({ ...current, [key]: value }));
  }
  function addLine() {
    keyCounter.current += 1;
    setLines((current) => [...current, {
      key: "new-" + keyCounter.current, productId: "", productType: "", quantity: "", unitPrice: "",
    }]);
  }
  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }
  function selectProduct(key: string, id: string) {
    if (id === STORED) return;
    const item = catalog.find((entry) => entry.id === id);
    setLines((current) => current.map((line) => line.key === key
      ? { ...line, productId: id, productType: item?.name ?? "", unitPrice: item?.unitPrice ?? "" }
      : line));
  }
  function setQuantity(key: string, quantity: string) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, quantity } : line));
  }
  function validate() {
    if (!info.captainPhone.trim() && !info.captainEmail.trim()) {
      return "Renseignez au moins un moyen de contact du commandant : téléphone ou email.";
    }
    if (info.originDepartureDate > info.arrivalDate ||
      (info.departureDate && info.arrivalDate > info.departureDate)) {
      return "Les dates doivent respecter l'ordre : départ du port d'origine, arrivée ici, puis départ d'ici.";
    }
    if (Boolean(info.latitude.trim()) !== Boolean(info.longitude.trim())) {
      return "Renseignez la latitude et la longitude ensemble.";
    }
    const incomplete = lines.findIndex((line) => (!itemOf(line) && !line.productType) || !line.quantity);
    return incomplete < 0 ? null : "Complétez le type et la quantité du produit " + (incomplete + 1) + ".";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!event.currentTarget.reportValidity()) return;
    const problem = validate();
    if (problem) { setError(problem); return; }
    if (info.departureDate && !window.confirm("Confirmer l'enregistrement de la date de départ du bateau ?")) return;

    setSaving(true);
    try {
      const payload = {
        ...info,
        products: lines.map((line) => {
          const item = itemOf(line);
          const existing = line.id ? { id: line.id } : {};
          return item
            ? { ...existing, productId: item.id, productType: item.name, unitPrice: item.unitPrice, quantity: line.quantity }
            : { ...existing, productType: line.productType ?? "", ...(line.unitPrice ? { unitPrice: line.unitPrice } : {}), quantity: line.quantity };
        }),
      };
      const targetId = savedId || declarationId;
      const response = await fetch(
        targetId ? "/api/maritime/declarations/" + targetId : "/api/maritime/declarations",
        { method: targetId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setError(result.message ?? "Enregistrement impossible."); return; }
      const id = targetId ?? result.declaration?.id;
      if (typeof id !== "string") { setError("La référence de la déclaration est introuvable."); return; }
      setSavedId(id);
      setSaved(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setSaving(false);
    }
  }

  if (saved) return (
    <section role="status" className="space-y-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <div>
        <h2 className="text-xl font-semibold text-emerald-900">Déclaration enregistrée</h2>
        <p className="mt-2 text-slate-800">Les informations du bateau et les produits ont été enregistrés. Vous pouvez encore modifier cette déclaration si vous constatez une erreur.</p>
      </div>
      <dl className="grid gap-3 rounded-xl border border-emerald-200 bg-white p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-600">Société</dt><dd className="font-semibold text-slate-900">{info.companyName}</dd></div>
        <div><dt className="text-slate-600">Bateau</dt><dd className="font-semibold text-slate-900">{info.boatName}</dd></div>
        <div><dt className="text-slate-600">Immatriculation</dt><dd className="font-semibold text-slate-900">{info.boatRegistration}</dd></div>
        <div><dt className="text-slate-600">Nombre de produits</dt><dd className="font-semibold text-slate-900">{lines.length}</dd></div>
      </dl>
      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <button type="button" onClick={() => router.replace("/dashboard/maritime/finished")}
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50">Quitter</button>
        <button type="button" onClick={() => setSaved(false)}
          className="flex-1 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">Modifier</button>
      </div>
    </section>
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-4">
        <h2 className={SECTION}>Société et coordonnées de contact</h2>
        <div><span className={LABEL}>Nom de la société</span><p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800">{info.companyName || "Société associée au compte"}</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={LABEL}>Email de contact</span><input className={INPUT} type="email" required maxLength={254} value={info.contactEmail} onChange={(e) => setField("contactEmail", e.target.value)} /></label>
          <label className="block"><span className={LABEL}>Téléphone de contact</span><input className={INPUT} type="tel" required maxLength={40} value={info.contactPhone} onChange={(e) => setField("contactPhone", e.target.value)} /></label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={SECTION}>Informations du bateau</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={LABEL}>Nom du bateau</span><input className={INPUT} required maxLength={150} value={info.boatName} onChange={(e) => setField("boatName", e.target.value)} /></label>
          <label className="block"><span className={LABEL}>Immatriculation</span><input className={INPUT} required maxLength={80} value={info.boatRegistration} onChange={(e) => setField("boatRegistration", e.target.value)} /></label>
        </div>
        <label className="block"><span className={LABEL}>Capacité du bateau (tonnes)</span><input className={INPUT} type="number" min="0.001" max="999999999.999" step="0.001" required value={info.boatCapacity} onChange={(e) => setField("boatCapacity", e.target.value)} /></label>
      </section>

      <section className="space-y-4">
        <h2 className={SECTION}>Commandant</h2>
        <label className="block"><span className={LABEL}>Nom du commandant</span><input className={INPUT} required maxLength={150} value={info.captainName} onChange={(e) => setField("captainName", e.target.value)} /></label>
        <p className="text-sm text-slate-600">Renseignez au moins un moyen de contact : téléphone ou email.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={LABEL}>Téléphone du commandant</span><input className={INPUT} type="tel" maxLength={40} value={info.captainPhone} onChange={(e) => setField("captainPhone", e.target.value)} /></label>
          <label className="block"><span className={LABEL}>Email du commandant</span><input className={INPUT} type="email" maxLength={254} value={info.captainEmail} onChange={(e) => setField("captainEmail", e.target.value)} /></label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={SECTION}>Dates du passage</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block"><span className={LABEL}>Départ du port d'origine</span><input className={INPUT} type="date" required value={info.originDepartureDate} onChange={(e) => setField("originDepartureDate", e.target.value)} /></label>
          <label className="block"><span className={LABEL}>Date d'arrivée</span><input className={INPUT} type="date" required value={info.arrivalDate} onChange={(e) => setField("arrivalDate", e.target.value)} /></label>
          <label className="block"><span className={LABEL}>Date de départ d'ici (facultative)</span><input className={INPUT} type="date" value={info.departureDate} onChange={(e) => setField("departureDate", e.target.value)} /></label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className={SECTION}>Coordonnées de navigation</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={LABEL}>Latitude</span><input className={INPUT} type="number" min="-90" max="90" step="0.000001" value={info.latitude} onChange={(e) => setField("latitude", e.target.value)} /></label>
          <label className="block"><span className={LABEL}>Longitude</span><input className={INPUT} type="number" min="-180" max="180" step="0.000001" value={info.longitude} onChange={(e) => setField("longitude", e.target.value)} /></label>
        </div>
        <p className="text-sm text-slate-600">Coordonnées facultatives. Renseignez les deux valeurs ensemble.</p>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className={SECTION}>Produits transportés</h2><button type="button" onClick={addLine} disabled={!catalog.length} className="rounded-lg border border-blue-700 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-40">+ Ajouter un produit</button></div>
        {catalogError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{catalogError}</p>}
        {!catalogError && !catalog.length && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Aucun produit actif n'est disponible. Vous pouvez enregistrer le passage sans produit.</p>}
        {lines.map((line, index) => {
          const item = itemOf(line);
          const storedOnly = !item && Boolean(line.productType);
          const selected = item ? item.id : storedOnly ? STORED : "";
          const unitPrice = priceOf(line);
          const lineTotal = calculateMaritimeTotals([{ quantity: line.quantity || "0", unitPrice }]).lineTotals[0];
          return <fieldset key={line.key} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
            <legend className="px-1 text-sm font-semibold text-slate-700">Produit {index + 1}</legend>
            <label className="block"><span className={LABEL}>Type de produit</span><select className={INPUT} required value={selected} onChange={(e) => selectProduct(line.key, e.target.value)}><option value="">Sélectionner un produit</option>{storedOnly && <option value={STORED}>{line.productType}</option>}{catalog.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
            <label className="block"><span className={LABEL}>Quantité (kg)</span><input className={INPUT} type="number" min="0.001" step="0.001" required value={line.quantity} onChange={(e) => setQuantity(line.key, e.target.value)} /></label>
            <div><span className={LABEL}>Prix officiel (Ar/kg)</span><output className="block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right font-semibold tabular-nums">{selected ? formatMaritimeAmount(unitPrice) : "—"}</output></div>
            <div><span className={LABEL}>Montant de la ligne (Ar)</span><output className="block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right font-semibold tabular-nums">{selected && lineTotal != null ? formatMaritimeAmount(lineTotal) : "—"}</output></div>
            <button type="button" onClick={() => removeLine(line.key)} aria-label={"Retirer le produit " + (index + 1)} className="self-end rounded-lg border border-red-300 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">Retirer</button>
          </fieldset>;
        })}
        {!lines.length && catalog.length > 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-600">Aucun produit ajouté. Les produits restent facultatifs.</p>}
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-right font-semibold text-blue-900" aria-live="polite">Total général : {formatMaritimeAmount(total)} Ar</p>
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      <button type="submit" disabled={saving} className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Enregistrement..." : savedId || declarationId ? "Enregistrer les modifications" : "Valider et enregistrer"}</button>
    </form>
  );
}
