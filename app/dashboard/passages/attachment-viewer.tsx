/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";

type AttachmentKind = "pjt" | "quittance";

export default function AttachmentViewer({
  passageId,
  hasPjt,
  hasQuittance,
}: {
  passageId: string;
  hasPjt: boolean;
  hasQuittance: boolean;
}) {
  const [active, setActive] = useState<AttachmentKind | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => requestController.current?.abort();
  }, []);

  useEffect(() => {
    if (!imageUrl) return;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // close() is intentionally implemented inline below; only the active modal matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function open(kind: AttachmentKind) {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setActive(kind);
    setImageUrl(null);
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`/api/passages/${encodeURIComponent(passageId)}/attachments/${kind}`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message ?? "Impossible de charger cette image.");
      }
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error("Le serveur n'a pas renvoyé une image valide.");
      if (!controller.signal.aborted) setImageUrl(URL.createObjectURL(blob));
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Impossible de charger cette image.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function close() {
    requestController.current?.abort();
    requestController.current = null;
    setActive(null);
    setImageUrl(null);
    setError("");
    setLoading(false);
  }

  const buttonClass = "rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {hasPjt && <button type="button" onClick={() => open("pjt")} className={buttonClass}>Voir le ticket</button>}
        {hasQuittance && <button type="button" onClick={() => open("quittance")} className={buttonClass}>Voir la quittance</button>}
        {!hasPjt && !hasQuittance && <span className="text-slate-500">Aucune image</span>}
      </div>

      {active && (
        <div
          role="presentation"
          onClick={close}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-3 sm:p-6"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="passage-attachment-title"
            onClick={(event) => event.stopPropagation()}
            className="relative flex max-h-[94vh] w-full max-w-6xl flex-col rounded-2xl bg-white p-3 shadow-2xl sm:p-5"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="passage-attachment-title" className="font-semibold text-slate-900">
                {active === "pjt" ? "Ticket du contrôleur" : "Photo de la quittance"}
              </h2>
              <button type="button" onClick={close} aria-label="Fermer l'image" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Fermer ✕
              </button>
            </div>
            <div className="flex min-h-[240px] flex-1 items-center justify-center overflow-auto rounded-xl bg-slate-100">
              {loading && <p role="status" className="p-8 text-sm text-slate-600">Chargement de l'image…</p>}
              {error && <p role="alert" className="p-8 text-sm text-red-700">{error}</p>}
              {imageUrl && !loading && <img src={imageUrl} alt={active === "pjt" ? "Ticket du contrôleur" : "Photo de la quittance"} className="max-h-[82vh] max-w-full object-contain" />}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
