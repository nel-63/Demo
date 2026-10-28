export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <div className="mx-auto max-w-7xl animate-pulse" role="status" aria-live="polite">
        <div className="h-4 w-48 rounded bg-slate-200" />
        <div className="mt-6 h-9 w-72 rounded bg-slate-200" />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="h-28 rounded-xl bg-slate-200" />
          <div className="h-28 rounded-xl bg-slate-200" />
          <div className="h-28 rounded-xl bg-slate-200" />
        </div>
        <span className="sr-only">Chargement...</span>
      </div>
    </main>
  );
}
