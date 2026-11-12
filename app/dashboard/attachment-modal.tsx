"use client";

import Image from "next/image";
import { useEffect } from "react";

type AttachmentModalProps = {
  isOpen: boolean;
  title: string;
  src: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

export default function AttachmentModal({
  isOpen,
  title,
  src,
  loading,
  error,
  onClose,
}: AttachmentModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            aria-label="Fermer la vue de l'image"
          >
            Fermer
          </button>
        </div>

        <div className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
          {loading && <p className="text-sm text-slate-700">Chargement de l&apos;image…</p>}
          {!loading && error && <p className="text-sm font-medium text-red-700">{error}</p>}
          {!loading && !error && src && (
            <img src={src} alt={title} className="max-h-[75vh] max-w-full object-contain" />
          )}
        </div>
      </div>
    </div>
  );
}
