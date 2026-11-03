"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_METHOD_LABELS } from "@/lib/audit";
import PassageHistory from "./passage-history";

type Initial = {
  id: string;
  assignedAt: string;
  origin: string;
  destination: string;
  vehicleInfo: string | null;
  driverName: string | null;
  vehicleRegistration: string | null;
  vehicleCharacteristics: string | null;
  driverLicenseNumber: string | null;
  notes: string | null;
  product: { name: string; type: string; tonnage: string };
  payment: { paymentMethod: keyof typeof PAYMENT_METHOD_LABELS; reference: string | null; amountDue: string; amountReceived: string };
};

export default function PassageActions({ initial, canManage }: { initial: Initial; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch(`/api/passages/${initial.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(result.message ?? "Modification impossible."); return; }
      setMessage("Modification enregistrée. L'ancienne version est conservée.");
      router.refresh();
    } catch { setMessage("Erreur de communication avec le serveur."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm("Supprimer logiquement ce passage et ses données liées ? L'historique restera conservé.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/passages/${initial.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(result.message ?? "Suppression impossible."); return; }
      setMessage("Passage supprimé logiquement.");
      router.refresh();
    } catch { setMessage("Erreur de communication avec le serveur."); }
    finally { setBusy(false); }
  }

  const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
  const label = "mb-1 block text-xs font-medium text-slate-700";
  return (
    <div className="min-w-[220px] space-y-2">
      {canManage && <details className="rounded-lg border border-slate-200 p-2">
        <summary className="cursor-pointer text-sm font-semibold text-blue-700">Modifier</summary>
        <form onSubmit={save} className="mt-3 grid gap-2">
          <label className={label}>Nom du produit<input className={field} name="productName" defaultValue={initial.product.name} required maxLength={150}/></label>
          <label className={label}>Type de produit<input className={field} name="productType" defaultValue={initial.product.type} required maxLength={100}/></label>
          <label className={label}>Tonnage (t)<input className={field} name="tonnage" type="number" min="0.01" step="0.01" defaultValue={initial.product.tonnage} required/></label>
          <label className={label}>Date du passage<input className={field} name="assignedAt" type="date" defaultValue={initial.assignedAt} required/></label>
          <label className={label}>Origine<input className={field} name="origin" defaultValue={initial.origin} required maxLength={150}/></label>
          <label className={label}>Destination<input className={field} name="destination" defaultValue={initial.destination} required maxLength={150}/></label>
          <label className={label}>Immatriculation<input className={field} name="vehicleRegistration" defaultValue={initial.vehicleRegistration ?? ""} maxLength={40}/></label>
          <label className={label}>Caractéristiques du véhicule<input className={field} name="vehicleCharacteristics" defaultValue={initial.vehicleCharacteristics ?? initial.vehicleInfo ?? ""} maxLength={200}/></label>
          <label className={label}>Nom du chauffeur<input className={field} name="driverName" defaultValue={initial.driverName ?? ""} maxLength={150}/></label>
          <label className={label}>Numéro de permis<input className={field} name="driverLicenseNumber" defaultValue={initial.driverLicenseNumber ?? ""} maxLength={80}/></label>
          <label className={label}>Autres informations véhicule<input className={field} name="vehicleInfo" defaultValue={initial.vehicleInfo ?? ""} maxLength={200}/></label>
          <label className={label}>Observations<textarea className={field} name="notes" defaultValue={initial.notes ?? ""} maxLength={2000}/></label>
          <label className={label}>Montant dû (MGA)<input className={field} name="amountDue" type="number" min="0.01" step="0.01" defaultValue={initial.payment.amountDue} required/></label>
          <label className={label}>Montant reçu (MGA)<input className={field} name="amountReceived" type="number" min="0.01" step="0.01" defaultValue={initial.payment.amountReceived} required/></label>
          <label className={label}>Mode de paiement<select className={field} name="paymentMethod" defaultValue={initial.payment.paymentMethod}>{Object.entries(PAYMENT_METHOD_LABELS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label className={label}>Référence paiement<input className={field} name="reference" defaultValue={initial.payment.reference ?? ""} maxLength={150}/></label>
          <button disabled={busy} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "En cours…" : "Enregistrer les modifications"}</button>
        </form>
      </details>}
      {canManage && <button type="button" onClick={remove} disabled={busy} className="w-full rounded-lg border border-red-300 px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Supprimer logiquement</button>}
      <PassageHistory passageId={initial.id} productName={initial.product.name} />
      {message && <p role="status" className="text-xs text-slate-700">{message}</p>}
    </div>
  );
}
