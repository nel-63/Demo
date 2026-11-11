"use client";

import { useEffect, useState } from "react";

type ProfileState = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  latitude: string | null;
  longitude: string | null;
};

export default function MaritimeProfilePage() {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/profile");
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.message ?? "Impossible de charger votre profil.");
        return;
      }
      const item = result.profile as ProfileState;
      setProfile(item);
      setLatitude(item.latitude ?? "");
      setLongitude(item.longitude ?? "");
    }
    void load();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.message ?? "Mise à jour impossible.");
        return;
      }
      const item = result.profile as { latitude: string | null; longitude: string | null };
      setProfile((current) => current ? { ...current, latitude: item.latitude, longitude: item.longitude } : current);
      setLatitude(item.latitude ?? "");
      setLongitude(item.longitude ?? "");
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return <p className="text-slate-600">Chargement du profil…</p>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Mon profil</h1>
        <p className="mt-2 text-slate-600">Mettez à jour vos coordonnées de navigation.</p>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 space-y-1">
          <p className="font-semibold text-slate-900">{profile.firstName} {profile.lastName}</p>
          <p className="text-sm text-slate-600">{profile.email}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Latitude</span>
            <input value={latitude} onChange={(event) => setLatitude(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" min="-90" max="90" step="0.000001" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Longitude</span>
            <input value={longitude} onChange={(event) => setLongitude(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" min="-180" max="180" step="0.000001" />
          </label>
          <p className="text-xs text-slate-600">Les coordonnées sont optionnelles tant qu'elles n'ont pas été renseignées.</p>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={saving} className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{saving ? "Enregistrement…" : "Enregistrer les coordonnées"}</button>
        </form>
      </section>
    </div>
  );
}
