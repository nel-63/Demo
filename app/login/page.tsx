"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CircleAlert, Eye, EyeOff, MapPin, ShieldCheck, Truck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "Connexion impossible.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Panneau de marque (ordinateur) */}
      <section className="hidden flex-col justify-between bg-slate-900 p-12 text-white lg:flex xl:p-20">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
            <Truck className="size-6" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold">Caisse &amp; Transports</span>
        </div>

        <div>
          <h2 className="max-w-md text-4xl font-bold leading-tight tracking-tight">
            Vos passages et vos paiements, en toute clarté.
          </h2>
          <p className="mt-4 max-w-md text-lg text-slate-300">
            Un outil simple pour suivre chaque produit, chaque encaissement et chaque lieu,
            avec un historique complet.
          </p>
          <ul className="mt-10 space-y-5">
            {[
              { icon: MapPin, text: "Chaque lieu a ses propres données, partagées entre ses régisseurs" },
              { icon: Banknote, text: "Montants en MGA, contrôlés par le serveur" },
              { icon: ShieldCheck, text: "Chaque action est enregistrée dans le journal d'audit" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-800">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="font-medium">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-slate-300">Accès réservé aux comptes professionnels.</p>
      </section>

      {/* Formulaire */}
      <section className="flex items-center justify-center bg-slate-100 px-4 py-10 sm:px-8">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg sm:p-10">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Truck className="size-5" aria-hidden="true" />
            </span>
            <span className="font-semibold text-slate-900">Caisse &amp; Transports</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Connexion</h1>
          <p className="mt-2 text-slate-700">Connectez-vous avec votre compte professionnel.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-800">
                Adresse email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-800">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-3.5 pr-12 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-700 hover:text-slate-900"
                >
                  {showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-700">
            Mot de passe oublié ? Contactez votre administrateur.
          </p>
        </div>
      </section>
    </main>
  );
}
