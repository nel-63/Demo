import Link from "next/link";

// Précédent / suivant pour les listes des fiches (paramètre ?page=).
export default function Pager({
  basePath,
  page,
  pageCount,
}: {
  basePath: string;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const separator = basePath.includes("?") ? "&" : "?";
  const href = (target: number) => (target > 1 ? `${basePath}${separator}page=${target}` : basePath);
  const linkClass =
    "rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100";

  return (
    <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
      {page > 1 ? <Link href={href(page - 1)} className={linkClass}>&larr; Précédent</Link> : <span />}
      <span className="text-slate-700">Page {page} sur {pageCount}</span>
      {page < pageCount ? <Link href={href(page + 1)} className={linkClass}>Suivant &rarr;</Link> : <span />}
    </nav>
  );
}
