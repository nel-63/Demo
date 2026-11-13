"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { calculateMaritimeTotals, formatMaritimeAmount, type MaritimeProductInput } from "@/lib/maritime-declarations";

type CatalogItem = { id: string; name: string; unitPrice: string };
type ProductLine = MaritimeProductInput & { clientId: string };
type Values = {
  companyName: string; contactEmail: string; contactPhone: string; boatName: string; boatRegistration: string;
  boatCapacity: string; captainName: string; captainPhone: string; captainEmail: string;
  originDepartureDate: string; arrivalDate: string; departureDate: string; latitude: string; longitude: string;
  products: ProductLine[];
};
type Errors = Record<string, string>;
const INPUT = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const LABEL = "mb-1 block text-sm font-medium text-slate-800";
const SECTION = "border-b border-slate-200 pb-2 pt-3 text-lg font-semibold text-slate-900";
const emptyValues = (): Values => ({
  companyName:"",contactEmail:"",contactPhone:"",boatName:"",boatRegistration:"",boatCapacity:"",
  captainName:"",captainPhone:"",captainEmail:"",originDepartureDate:"",arrivalDate:"",departureDate:"",
  latitude:"",longitude:"",products:[],
});
const clientId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `line-${Date.now()}-${Math.random()}`;

export default function DeclarationForm({ initial, declarationId }: { initial?: Omit<Values, "products"> & { products: MaritimeProductInput[] }; declarationId?: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step,setStep] = useState<1|2>(1);
  const [catalog,setCatalog] = useState<CatalogItem[]>([]);
  const [catalogError,setCatalogError] = useState("");
  const [values,setValues] = useState<Values>(() => {
    const base = { ...emptyValues(), ...initial };
    return { ...base, products: (initial?.products ?? []).map((p) => ({ ...p, productId: p.productId ?? (p as MaritimeProductInput & { productTypeId?: string }).productTypeId ?? "", clientId: clientId() })) };
  });
  const [errors,setErrors] = useState<Errors>({});
  const [error,setError] = useState("");
  const [saving,setSaving] = useState(false);
  const [closed,setClosed] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/maritime-product-types");
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || "Le catalogue des produits n'a pas pu être chargé.");
        const items = Array.isArray(result.maritimeProductTypes) ? result.maritimeProductTypes : [];
        if (active) setCatalog(items);
      } catch (e) {
        if (active) setCatalogError(e instanceof Error ? e.message : "Impossible de charger le catalogue des produits.");
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const total = useMemo(() => calculateMaritimeTotals(values.products.map(p => ({
    quantity: p.quantity || "0",
    unitPrice: catalog.find(item => item.id === p.productId)?.unitPrice ?? p.unitPrice ?? "0",
  }))).total, [values.products,catalog]);

  function setField(key: keyof Omit<Values,"products">, value: string) {
    setValues(v => ({ ...v, [key]: value }));
    setErrors(e => { const next={...e}; delete next[key]; return next; });
  }
  function validateInformation(): boolean {
    const next: Errors = {};
    if (!values.companyName.trim()) next.companyName = "Le nom de la société est obligatoire.";
    if (!values.contactEmail.trim()) next.contactEmail = "L'email de contact du compte est obligatoire.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)) next.contactEmail = "L'email de contact du compte n'est pas valide.";
    if (!values.contactPhone.trim()) next.contactPhone = "Le téléphone de contact du compte est obligatoire.";
    if (!values.boatName.trim()) next.boatName = "Le nom du bateau est obligatoire.";
    if (!values.boatRegistration.trim()) next.boatRegistration = "L'immatriculation est obligatoire.";
    if (!values.boatCapacity || !/^\d+(?:\.\d{1,3})?$/.test(values.boatCapacity) || Number(values.boatCapacity)<=0) next.boatCapacity = "La capacité du bateau doit être supérieure à zéro.";
    if (!values.captainName.trim()) next.captainName = "Le nom du commandant est obligatoire.";
    if (!values.captainPhone.trim() && !values.captainEmail.trim()) next.captainPhone = "Renseignez au moins un moyen de contact du commandant : téléphone ou email.";
    if (values.captainEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.captainEmail)) next.captainEmail = "L'email du commandant n'est pas valide.";
    const validDate = (v:string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v+"T00:00:00.000Z").getTime()) && new Date(v+"T00:00:00.000Z").toISOString().slice(0,10)===v;
    if (!validDate(values.originDepartureDate)) next.originDepartureDate = "La date de départ du port d'origine est obligatoire et doit être valide.";
    if (!validDate(values.arrivalDate)) next.arrivalDate = "La date d'arrivée ici est obligatoire et doit être valide.";
    if (values.departureDate && !validDate(values.departureDate)) next.departureDate = "La date de départ d'ici doit être une date valide.";
    if (validDate(values.originDepartureDate) && validDate(values.arrivalDate) && values.originDepartureDate > values.arrivalDate) next.arrivalDate = "Les dates doivent respecter l'ordre : départ du port d'origine, arrivée ici, puis départ d'ici.";
    if (values.departureDate && validDate(values.arrivalDate) && validDate(values.departureDate) && values.arrivalDate > values.departureDate) next.departureDate = "Les dates doivent respecter l'ordre : départ du port d'origine, arrivée ici, puis départ d'ici.";
    const lat=values.latitude.trim(), lon=values.longitude.trim();
    if (Boolean(lat)!==Boolean(lon)) { next.latitude="Renseignez la latitude et la longitude ensemble."; next.longitude="Renseignez la latitude et la longitude ensemble."; }
    if (lat && (!Number.isFinite(Number(lat)) || Number(lat)<-90 || Number(lat)>90)) next.latitude="La latitude doit être comprise entre -90 et 90.";
    if (lon && (!Number.isFinite(Number(lon)) || Number(lon)<-180 || Number(lon)>180)) next.longitude="La longitude doit être comprise entre -180 et 180.";
    setErrors(next);
    if (Object.keys(next).length) {
      const first = Object.keys(next)[0];
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return false;
    }
    return true;
  }
  function nextStep() {
    if (!formRef.current?.reportValidity()) return;
    if (validateInformation()) { setStep(2); setError(""); }
  }
  function updateProduct(clientKey:string, patch:Partial<ProductLine>) {
    setValues(v => ({ ...v, products:v.products.map(p => p.clientId===clientKey ? {...p,...patch}:p) }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (step===1) { nextStep(); return; }
    if (!validateInformation() || !formRef.current?.reportValidity()) { setStep(1); return; }
    if (values.departureDate && !window.confirm("Enregistrer le départ ? Après cet enregistrement, votre compte sera fermé : vous ne pourrez plus vous connecter ni modifier cette déclaration.")) return;
    setSaving(true);
    try {
      const payload = {
        ...values,
        products: values.products.map(({clientId: _clientId,...product}) => ({
          ...product,
          productType: product.productType || catalog.find(item=>item.id===product.productId)?.name || "",
          unitPrice: catalog.find(item=>item.id===product.productId)?.unitPrice ?? product.unitPrice ?? undefined,
        })),
      };
      const response = await fetch(declarationId ? `/api/maritime/declarations/${declarationId}` : "/api/maritime/declarations", {
        method: declarationId ? "PUT" : "POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload),
      });
      const result=await response.json().catch(()=>({}));
      if (!response.ok) { setError(result.message ?? "Enregistrement impossible."); return; }
      if (result.accountDeactivated) { setClosed(true); return; }
      const id=declarationId ?? result.declaration?.id;
      if (typeof id!=="string") { setError("La déclaration a été enregistrée, mais sa référence est introuvable."); return; }
      router.replace(`/dashboard/maritime/${id}`); router.refresh();
    } catch { setError("Impossible de contacter le serveur."); }
    finally { setSaving(false); }
  }

  if (closed) return <section role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
    <h2 className="text-xl font-semibold text-emerald-900">Départ enregistré</h2>
    <p className="mt-2 text-slate-800">Votre déclaration est enregistrée et votre compte est maintenant fermé. Vous ne pouvez plus vous connecter avec cet accès.</p>
    <Link href="/login" className="mt-4 inline-flex rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">Retour à la connexion</Link>
  </section>;

  const fieldError=(name:keyof Values) => errors[name] ? <p role="alert" className="mt-1 text-sm text-red-700">{errors[name]}</p> : null;
  return <form ref={formRef} onSubmit={submit} className="space-y-5">
    <ol aria-label="Progression du formulaire" className="grid grid-cols-2 gap-2 text-sm font-semibold">
      <li className={`rounded-xl px-4 py-3 ${step===1?"bg-blue-700 text-white":"bg-slate-100 text-slate-600"}`}>1. Informations</li>
      <li className={`rounded-xl px-4 py-3 ${step===2?"bg-blue-700 text-white":"bg-slate-100 text-slate-600"}`}>2. Produits</li>
    </ol>

    {step===1 ? <>
      <section className="space-y-4">
        <h2 className={SECTION}>Société et contacts du compte</h2>
        <label className="block"><span className={LABEL}>Société</span><p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800">{values.companyName || "Société associée au compte"}</p></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={LABEL}>Email de contact du compte</span><input name="contactEmail" className={INPUT} type="email" required maxLength={254} value={values.contactEmail} onChange={e=>setField("contactEmail",e.target.value)} />{fieldError("contactEmail")}</label>
          <label className="block"><span className={LABEL}>Téléphone de contact du compte</span><input name="contactPhone" className={INPUT} type="tel" required maxLength={40} value={values.contactPhone} onChange={e=>setField("contactPhone",e.target.value)} />{fieldError("contactPhone")}</label>
        </div>
      </section>
      <section className="space-y-4">
        <h2 className={SECTION}>Informations du bateau</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={LABEL}>Nom du bateau</span><input name="boatName" className={INPUT} required maxLength={150} value={values.boatName} onChange={e=>setField("boatName",e.target.value)} />{fieldError("boatName")}</label>
          <label className="block"><span className={LABEL}>Immatriculation</span><input name="boatRegistration" className={INPUT} required maxLength={80} value={values.boatRegistration} onChange={e=>setField("boatRegistration",e.target.value)} />{fieldError("boatRegistration")}</label>
        </div>
        <label className="block"><span className={LABEL}>Capacité du bateau (tonnes)</span><input name="boatCapacity" className={INPUT} type="number" min="0.001" max="999999999.999" step="0.001" required value={values.boatCapacity} onChange={e=>setField("boatCapacity",e.target.value)} />{fieldError("boatCapacity")}</label>
      </section>
      <section className="space-y-4">
        <h2 className={SECTION}>Commandant</h2>
        <label className="block"><span className={LABEL}>Nom du commandant</span><input name="captainName" className={INPUT} required maxLength={150} value={values.captainName} onChange={e=>setField("captainName",e.target.value)} />{fieldError("captainName")}</label>
        <p className="text-sm text-slate-600">Renseignez au moins un moyen de contact : téléphone ou email.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={LABEL}>Téléphone</span><input name="captainPhone" className={INPUT} type="tel" maxLength={40} value={values.captainPhone} onChange={e=>setField("captainPhone",e.target.value)} />{fieldError("captainPhone")}</label>
          <label className="block"><span className={LABEL}>Email</span><input name="captainEmail" className={INPUT} type="email" maxLength={254} value={values.captainEmail} onChange={e=>setField("captainEmail",e.target.value)} />{fieldError("captainEmail")}</label>
        </div>
      </section>
      <section className="space-y-4">
        <h2 className={SECTION}>Dates</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block"><span className={LABEL}>Départ du port d'origine</span><input name="originDepartureDate" className={INPUT} type="date" required value={values.originDepartureDate} onChange={e=>setField("originDepartureDate",e.target.value)} />{fieldError("originDepartureDate")}</label>
          <label className="block"><span className={LABEL}>Entrée (arrivée ici)</span><input name="arrivalDate" className={INPUT} type="date" required value={values.arrivalDate} onChange={e=>setField("arrivalDate",e.target.value)} />{fieldError("arrivalDate")}</label>
          <label className="block"><span className={LABEL}>Date de sortie (facultative)</span><input name="departureDate" className={INPUT} type="date" value={values.departureDate} onChange={e=>setField("departureDate",e.target.value)} />{fieldError("departureDate")}</label>
        </div>
      </section>
      <section className="space-y-4">
        <h2 className={SECTION}>Coordonnées de navigation</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={LABEL}>Latitude</span><input name="latitude" className={INPUT} type="number" min="-90" max="90" step="0.000001" value={values.latitude} onChange={e=>setField("latitude",e.target.value)} />{fieldError("latitude")}</label>
          <label className="block"><span className={LABEL}>Longitude</span><input name="longitude" className={INPUT} type="number" min="-180" max="180" step="0.000001" value={values.longitude} onChange={e=>setField("longitude",e.target.value)} />{fieldError("longitude")}</label>
        </div>
        <p className="text-sm text-slate-600">Les coordonnées sont facultatives, mais doivent être renseignées ensemble.</p>
      </section>
      <button type="button" onClick={nextStep} className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800">Suivant</button>
    </> : <>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className={SECTION}>Produits</h2>
          <button type="button" onClick={()=>setValues(v=>({...v,products:[...v.products,{productId:"",productType:"",quantity:"",unitPrice:"",clientId:clientId()}]}))} disabled={catalog.length===0} className="rounded-lg border border-blue-700 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">+ Ajouter un produit</button>
        </div>
        {catalogError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{catalogError}</p>}
        {!catalogError && catalog.length===0 && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Aucun produit maritime actif n'est disponible pour le moment. Vous pouvez enregistrer le passage sans produit.</p>}
        {values.products.map((product,index)=>{
          const selected=catalog.find(item=>item.id===product.productId);
          const price=selected?.unitPrice ?? product.unitPrice ?? "0";
          const line=calculateMaritimeTotals([{quantity:product.quantity||"0",unitPrice:price}]).lineTotals[0];
          return <fieldset key={product.clientId} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
            <legend className="px-1 text-sm font-semibold text-slate-700">Produit {index+1}</legend>
            <label className="block"><span className={LABEL}>Type de produit</span><select required className={INPUT} value={product.productId??""} onChange={e=>{const item=catalog.find(p=>p.id===e.target.value);updateProduct(product.clientId,{productId:e.target.value,productType:item?.name??"",unitPrice:item?.unitPrice??""});}} disabled={catalog.length===0}><option value="">Sélectionner un produit</option>{catalog.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="block"><span className={LABEL}>Quantité (kg)</span><input className={INPUT} type="number" min="0.001" step="0.001" required value={product.quantity} onChange={e=>updateProduct(product.clientId,{quantity:e.target.value})}/></label>
            <div><span className={LABEL}>Prix officiel (MGA/kg)</span><output className="block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right font-semibold tabular-nums">{price!=="0"?formatMaritimeAmount(price):"—"}</output></div>
            <div><span className={LABEL}>Montant de la ligne (MGA)</span><output className="block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right font-semibold tabular-nums">{line===null?"—":formatMaritimeAmount(line??"0")}</output></div>
            <button type="button" onClick={()=>setValues(v=>({...v,products:v.products.filter(p=>p.clientId!==product.clientId)}))} aria-label={`Retirer le produit ${index+1}`} className="self-end rounded-lg border border-red-300 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">Retirer</button>
          </fieldset>;
        })}
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-right font-semibold text-blue-900" aria-live="polite">Total général : {formatMaritimeAmount(total)} MGA</p>
      </section>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={()=>{setStep(1);setError("");}} className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50">Précédent</button>
        <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{saving?"Enregistrement...":declarationId?"Enregistrer les modifications":"Créer la déclaration"}</button>
      </div>
    </>}
    {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
  </form>;
}
