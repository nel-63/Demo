"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const LABEL_CLASS = "mb-1 block text-sm font-medium text-slate-800";

export default function MaritimeOnboardingForm({
  companyName,
}: {
  companyName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch("/api/maritime/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.message ?? "Enregistrement impossible.");
        return;
      }

      if (result.accountDeactivated) {
        router.replace("/login");
      } else {
        router.replace("/dashboard/maritime");
      }
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-4">
        <h2 className="border-b border-slate-200 pb-2 text-lg font-semibold text-slate-900">Société et bateau</h2>
        <div>
          <span className={LABEL_CLASS}>Société</span>
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800">{companyName}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className={LABEL_CLASS}>Nom du bateau</span>
            <input className={INPUT_CLASS} name="boatName" required maxLength={150} />
          </label>
          <label>
            <span className={LABEL_CLASS}>Numéro d&apos;immatriculation</span>
            <input className={INPUT_CLASS} name="boatRegistration" required maxLength={80} />
          </label>
        </div>
        <label className="block">
          <span className={LABEL_CLASS}>Capacité du bateau (tonnes)</span>
          <input className={INPUT_CLASS} name="boatCapacity" type="number" min="0.001" max="999999999.999" step="0.001" required />
        </label>
      </section>

      <section className="space-y-4">
        <h2 className="border-b border-slate-200 pb-2 text-lg font-semibold text-slate-900">Coordonnées personnelles</h2>
        <p className="text-sm text-slate-600">Ces coordonnées serviront à vos prochaines connexions.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className={LABEL_CLASS}>Téléphone</span>
            <input className={INPUT_CLASS} name="contactPhone" type="tel" maxLength={40} required />
          </label>
          <label>
            <span className={LABEL_CLASS}>Adresse email</span>
            <input className={INPUT_CLASS} name="contactEmail" type="email" maxLength={254} required />
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="border-b border-slate-200 pb-2 text-lg font-semibold text-slate-900">Commandant</h2>
        <label className="block">
          <span className={LABEL_CLASS}>Nom du commandant</span>
          <input className={INPUT_CLASS} name="captainName" required maxLength={150} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className={LABEL_CLASS}>Téléphone du commandant</span>
            <input className={INPUT_CLASS} name="captainPhone" type="tel" maxLength={40} />
          </label>
          <label>
            <span className={LABEL_CLASS}>Email du commandant</span>
            <input className={INPUT_CLASS} name="captainEmail" type="email" maxLength={254} />
          </label>
        </div>
        <p className="text-sm text-slate-600">Renseignez au moins un moyen de contact du commandant.</p>
      </section>

      <section className="space-y-4">
        <h2 className="border-b border-slate-200 pb-2 text-lg font-semibold text-slate-900">Dates</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label>
            <span className={LABEL_CLASS}>Départ du port d&apos;origine</span>
            <input className={INPUT_CLASS} name="originDepartureDate" type="date" required />
          </label>
          <label>
            <span className={LABEL_CLASS}>Date d&apos;entrée</span>
            <input className={INPUT_CLASS} name="arrivalDate" type="date" required />
          </label>
          <label>
            <span className={LABEL_CLASS}>Date de sortie de la zone maritime</span>
            <input className={INPUT_CLASS} name="departureDate" type="date" />
          </label>
        </div>
        <p className="text-sm text-slate-600">Enregistrer une date de sortie clôture votre session et désactive le compte.</p>
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      <button type="submit" disabled={saving} className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
        {saving ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
