"use client";

import { useEffect } from "react";
import Link from "next/link";

// Dans cette version de Next.js, la fonction de relance s'appelle `retry`.
export default function ErrorPage({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Une erreur est survenue</h1>
        <p className="mt-3 text-slate-600">
          La page n&apos;a pas pu s&apos;afficher. Réessayez ou retournez au tableau de bord.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800"
          >
            Réessayer
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-100"
          >
            Tableau de bord
          </Link>
        </div>
      </section>
    </main>
  );
}
