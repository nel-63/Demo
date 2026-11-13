"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { dashboardPathForRole } from "@/lib/role-routes";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.message ?? "Connexion impossible."); return; }
      router.replace(dashboardPathForRole(data.user?.role ?? ""));
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 sm:px-8">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg sm:p-10">
        <div className="mb-7 flex items-center gap-3">
                      <Image src="/Baobab Landscape Emblem.png" alt="Logo Région Menabe" width={408} height={408} className="h-26 w-26" loading="eager"/>
          <span className="text-center text-lg font-semibold text-slate-900">REGION MENABE <br /> Gestion des opérations</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Connexion</h1>
        <form method="post" onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="identifier" className="mb-1 block text-sm font-medium text-slate-800">Identifiant, email ou téléphone</label>
            <input id="identifier" name="identifier" type="text" autoComplete="username" required value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"/>
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-800">Mot de passe</label>
            <div className="relative">
              <input id="password" name="password" type={showPassword ? "text" : "password"}
                autoComplete="current-password" required value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-3.5 pr-12 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"/>
              <button type="button" onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-700 hover:text-slate-900">
                {showPassword ? <EyeOff className="size-5" aria-hidden="true"/> : <Eye className="size-5" aria-hidden="true"/>}
              </button>
            </div>
          </div>
          {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true"/><span>{error}</span>
          </p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </section>
    </main>
  );
}
