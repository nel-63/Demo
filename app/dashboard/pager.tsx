import Link from "next/link";

// Pagination partagée pour les listes (paramètre ?page=).
export default function Pager({
  basePath,
  page,
  pageCount,
  total,
  ariaLabel = "Pagination",
  previousLabel = "Précédent",
  nextLabel = "Suivant",
}: {
  basePath: string;
  page: number;
  pageCount: number;
  total?: number;
  ariaLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
}) {
  if (pageCount <= 1) return null;
  const separator = basePath.includes("?") ? "&" : "?";
  const href = (target: number) => (target > 1 ? `${basePath}${separator}page=${target}` : basePath);
  const linkClass =
    "inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";
  const disabledClass = `${linkClass} cursor-not-allowed bg-slate-100 text-slate-400 hover:bg-slate-100`;

  return (
    <nav className="my-5 flex flex-wrap items-center justify-between gap-3" aria-label={ariaLabel}>
      {page > 1 ? (
        <Link href={href(page - 1)} className={`${linkClass} order-2 flex-1 sm:order-1`}>
          &larr; {previousLabel}
        </Link>
      ) : (
        <span aria-disabled="true" className={`${disabledClass} order-2 flex-1 sm:order-1`}>
          &larr; {previousLabel}
        </span>
      )}
      <span aria-current="page" className="order-1 w-full text-center text-sm text-slate-700 sm:order-2 sm:w-auto">
        Page {page} sur {pageCount}{total === undefined ? "" : ` · ${total} passages`}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className={`${linkClass} order-3 flex-1`}>
          {nextLabel} &rarr;
        </Link>
      ) : (
        <span aria-disabled="true" className={`${disabledClass} order-3 flex-1`}>
          {nextLabel} &rarr;
        </span>
      )}
    </nav>
  );
}
