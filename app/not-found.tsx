import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Erreur 404</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Page introuvable</h1>
        <p className="mt-3 text-slate-600">
          Cette page n&apos;existe pas, ou elle n&apos;appartient pas à votre lieu.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800"
        >
          Retour au tableau de bord
        </Link>
      </section>
    </main>
  );
}
