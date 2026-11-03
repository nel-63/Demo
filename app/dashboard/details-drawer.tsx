"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Banknote,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  Clock3,
  Coins,
  CreditCard,
  ExternalLink,
  Hourglass,
  Info,
  MapPin,
  Package,
  Route,
  Scale,
  Search,
  Truck,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Badge, Cell, DetailsResult } from "@/lib/details-types";
import {
  DRAWER_DEFAULT_WIDTH,
  DRAWER_KEY_STEP,
  DRAWER_KEY_STEP_LARGE,
  clampDrawerWidth,
  drawerWidthBounds,
} from "@/lib/drawer-width";

const KIND_ICONS: Record<string, LucideIcon> = {
  locations: MapPin,
  supervisors: UserCog,
  drivers: Users,
  vehicles: Truck,
  transports: Route,
  products: Package,
  tonnage: Scale,
  payments: CreditCard,
  received: Banknote,
  change: Coins,
  outstanding: Hourglass,
};

// Pictogramme associé à chaque type de donnée (les statuts de transport utilisent « Route »).
export function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = KIND_ICONS[kind] ?? Route;
  return <Icon className={className} aria-hidden="true" />;
}

// Pastille : l'état est toujours donné par une icône ET un libellé, jamais par la couleur seule.
const BADGES: Record<Badge, { className: string; Icon: LucideIcon }> = {
  ok: { className: "bg-emerald-50 text-emerald-700", Icon: CircleCheck },
  warn: { className: "bg-amber-50 text-amber-700", Icon: Clock3 },
  bad: { className: "bg-red-50 text-red-700", Icon: CircleX },
  info: { className: "bg-blue-50 text-blue-700", Icon: Info },
  muted: { className: "bg-slate-100 text-slate-700", Icon: Info },
};

function CellView({ cell }: { cell: Cell }) {
  if (cell.href) {
    return (
      <Link href={cell.href} className="font-medium text-blue-700 underline-offset-2 hover:underline">
        {cell.t}
      </Link>
    );
  }
  if (!cell.badge) return <>{cell.t}</>;
  const { className, Icon } = BADGES[cell.badge];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium ${className}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {cell.t}
    </span>
  );
}

type Loaded = { key: string; data?: DetailsResult; error?: string };

export default function DetailsDrawer({
  kind,
  label,
  onClose,
}: {
  kind: string;
  label: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [locationId, setLocationId] = useState("");
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Largeur choisie par l'utilisateur (écran large). Conservée tant que le panneau est ouvert,
  // réinitialisée à la fermeture puisque le composant est alors démonté.
  const [width, setWidth] = useState(() =>
    clampDrawerWidth(DRAWER_DEFAULT_WIDTH, typeof window === "undefined" ? DRAWER_DEFAULT_WIDTH : window.innerWidth),
  );
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? DRAWER_DEFAULT_WIDTH : window.innerWidth,
  );
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  const requestKey = `${debounced}|${locationId}|${retry}`;

  // Recherche : on attend la fin de la saisie avant d'interroger le serveur.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (debounced) params.set("q", debounced);
    if (locationId) params.set("locationId", locationId);

    fetch(`/api/details/${encodeURIComponent(kind)}?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message ?? "Impossible de charger le détail.");
        setLoaded({ key: requestKey, data: body as DetailsResult });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({
          key: requestKey,
          error: error instanceof Error ? error.message : "Impossible de contacter le serveur.",
        });
      });

    return () => controller.abort();
  }, [kind, debounced, locationId, requestKey]);

  // Échap ferme ; le défilement de la page est bloqué ; le focus entre dans le panneau.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // Si la fenêtre rétrécit, la largeur est ramenée dans les bornes.
  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setWidth((current) => clampDrawerWidth(current, window.innerWidth));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Pendant le glissement : pas de sélection de texte, curseur de redimensionnement.
  // Le nettoyage couvre aussi le démontage du panneau en plein geste.
  useEffect(() => {
    if (!resizing) return;
    const previousSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.body.style.userSelect = previousSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [resizing]);

  function onHandlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !panelRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: panelRef.current.getBoundingClientRect().width,
    };
    setResizing(true);
  }

  function onHandlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // Panneau ancré à droite : déplacer la poignée vers la gauche agrandit.
    setWidth(clampDrawerWidth(drag.startWidth + (drag.startX - event.clientX), window.innerWidth));
  }

  // Fin du geste : relâchement, annulation (ex. tactile interrompu) ou capture perdue.
  function endResize(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setResizing(false);
  }

  function onHandleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? DRAWER_KEY_STEP_LARGE : DRAWER_KEY_STEP;
    const { min, max } = drawerWidthBounds(window.innerWidth);
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = width + step;
    else if (event.key === "ArrowRight") next = width - step;
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    setWidth(clampDrawerWidth(next, window.innerWidth));
  }

  // Tab reste dans le panneau tant qu'il est ouvert.
  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [role="separator"][tabindex="0"]',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const data = loaded?.key === requestKey ? loaded.data : undefined;
  const error = loaded?.key === requestKey ? loaded.error : undefined;
  const loading = loaded?.key !== requestKey;
  // Pendant un rechargement on garde l'ancien résultat affiché (pas de clignotement).
  const shown = data ?? loaded?.data;

  const rows = useMemo(() => {
    if (!shown) return [];
    if (!sort) return shown.rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...shown.rows].sort((a, b) => {
      const x = a.cells[sort.key];
      const y = b.cells[sort.key];
      const vx = x?.s ?? x?.t ?? "";
      const vy = y?.s ?? y?.t ?? "";
      if (typeof vx === "number" && typeof vy === "number") return (vx - vy) * factor;
      return String(vx).localeCompare(String(vy), "fr", { numeric: true }) * factor;
    });
  }, [shown, sort]);

  function toggleSort(key: string) {
    setSort((current) =>
      current?.key !== key ? { key, dir: "asc" } : current.dir === "asc" ? { key, dir: "desc" } : null,
    );
  }

  const titleId = `details-title-${kind}`;
  const bounds = drawerWidthBounds(viewportWidth);
  // La variable CSS ne s'applique qu'à partir de md ; en dessous, le panneau reste une feuille pleine largeur.
  const panelStyle = { "--drawer-w": `${width}px` } as CSSProperties;

  return createPortal(
    <div className="fixed inset-0 z-50" onKeyDown={trapFocus}>
      <div
        className="details-backdrop absolute inset-0 bg-slate-900/50"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={panelStyle}
        className="details-panel absolute inset-x-0 bottom-0 flex h-[92dvh] flex-col rounded-t-2xl bg-white shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-(--drawer-w) md:max-w-full md:rounded-none md:rounded-l-2xl"
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionner le panneau"
          aria-valuenow={Math.min(Math.max(width, bounds.min), bounds.max)}
          aria-valuemin={bounds.min}
          aria-valuemax={bounds.max}
          tabIndex={0}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onLostPointerCapture={endResize}
          onKeyDown={onHandleKeyDown}
          className={`group absolute inset-y-0 -left-1.5 z-20 hidden w-3 cursor-col-resize touch-none items-center justify-center outline-none md:flex ${resizing ? "bg-blue-100/60" : ""}`}
        >
          <span
            aria-hidden="true"
            className={`h-12 w-1 rounded-full bg-slate-300 transition-colors group-hover:bg-blue-600 group-focus-visible:bg-blue-600 ${resizing ? "bg-blue-600" : ""}`}
          />
        </div>

        <header className="flex items-start gap-4 border-b border-slate-200 p-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <KindIcon kind={kind} className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {shown?.title ?? label}
            </h2>
            <p className="mt-0.5 break-words text-2xl font-bold text-slate-900">
              {shown?.total ?? <span className="text-slate-600">…</span>}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer le panneau"
            className="rounded-xl border border-slate-300 p-2 text-slate-700 hover:bg-slate-100"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-600"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher dans cette liste"
              aria-label="Rechercher dans cette liste"
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-base text-slate-900"
            />
          </div>

          {shown?.locations && shown.locations.length > 1 && (
            <select
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              aria-label="Filtrer par lieu"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900"
            >
              <option value="">Tous les lieux</option>
              {shown.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading}>
          {error ? (
            <div role="alert" className="m-5 rounded-xl bg-red-50 p-4 text-red-700">
              <p className="font-medium">{error}</p>
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
                className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold hover:bg-red-100"
              >
                Réessayer
              </button>
            </div>
          ) : !shown ? (
            <div role="status" className="animate-pulse space-y-3 p-5">
              <span className="sr-only">Chargement...</span>
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-10 rounded-lg bg-slate-200" />
              ))}
            </div>
          ) : shown.rows.length === 0 ? (
            <p className="p-8 text-center text-slate-700">
              {debounced
                ? `Aucun résultat pour « ${debounced} ».`
                : "Aucun élément à afficher pour le moment."}
            </p>
          ) : (
            <table className={`w-full min-w-max text-left text-sm ${loading ? "opacity-60" : ""}`}>
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-700 shadow-[0_1px_0_#e2e8f0]">
                <tr>
                  {shown.columns.map((column) => {
                    const active = sort?.key === column.key;
                    const SortIcon = !active ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                        className={`px-4 py-3 font-semibold ${column.align === "right" ? "text-right" : ""}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className="inline-flex items-center gap-1 rounded hover:text-slate-900"
                        >
                          {column.label}
                          <SortIcon className="size-4" aria-hidden="true" />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50">
                    {shown.columns.map((column) => (
                      <td
                        key={column.key}
                        className={`whitespace-nowrap px-4 py-3 text-slate-900 ${column.align === "right" ? "text-right" : ""}`}
                      >
                        <CellView cell={row.cells[column.key] ?? { t: "—" }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
          <p className="text-sm text-slate-700" aria-live="polite">
            {shown &&
              (shown.truncated
                ? `${shown.rows.length} premiers éléments sur ${shown.count}.`
                : `${shown.count} élément${shown.count > 1 ? "s" : ""}.`)}
          </p>
          {shown?.href && (
            <Link
              href={shown.href}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Ouvrir la page complète
              <ExternalLink className="size-4" aria-hidden="true" />
            </Link>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

