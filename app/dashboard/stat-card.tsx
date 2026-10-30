"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import DetailsDrawer, { KindIcon } from "./details-drawer";

const cardClass =
  "group block w-full cursor-pointer rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md";

// Hook commun : ouvre le panneau et rend le focus au bouton à la fermeture.
function useDrawer() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  return { open, setOpen, triggerRef, close };
}

export function StatCard({
  label,
  value,
  description,
  kind,
}: {
  label: string;
  value: string | number;
  description: string;
  kind: string;
}) {
  const { open, setOpen, triggerRef, close } = useDrawer();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`${cardClass} p-5`}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="text-sm font-medium text-slate-700">{label}</span>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <KindIcon kind={kind} className="size-5" />
          </span>
        </span>
        <span className="mt-2 block break-words text-2xl font-bold text-slate-900">{value}</span>
        <span className="mt-2 block text-sm text-slate-600">{description}</span>
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-slate-700 group-hover:text-blue-700">
          Voir le détail
          <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </button>
      {open && <DetailsDrawer kind={kind} label={label} onClose={close} />}
    </>
  );
}

// Un chiffre de la répartition par statut (Planifié, En cours...).
export function StatusTile({ label, count, kind }: { label: string; count: number; kind: string }) {
  const { open, setOpen, triggerRef, close } = useDrawer();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="group cursor-pointer rounded-xl bg-slate-100 px-4 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-sm"
      >
        <span className="block text-sm text-slate-700">{label}</span>
        <span className="mt-1 flex items-center gap-2 text-xl font-bold text-slate-900">
          {count}
          <ArrowRight
            className="size-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-blue-700"
            aria-hidden="true"
          />
        </span>
      </button>
      {open && <DetailsDrawer kind={kind} label={label} onClose={close} />}
    </>
  );
}
