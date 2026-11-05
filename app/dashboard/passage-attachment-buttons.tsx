"use client";

import { useEffect, useState } from "react";
import AttachmentModal from "./attachment-modal";

type AttachmentKind = "pjt" | "quittance";

export default function PassageAttachmentButtons({
  passageId,
  hasPjt,
  hasQuittance,
}: {
  passageId: string;
  hasPjt?: boolean;
  hasQuittance?: boolean;
}) {
  const [kind, setKind] = useState<AttachmentKind | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (src) {
        URL.revokeObjectURL(src);
      }
    };
  }, [src]);

  const openAttachment = async (attachmentKind: AttachmentKind) => {
    setKind(attachmentKind);
    setLoading(true);
    setError(null);

    if (src) {
      URL.revokeObjectURL(src);
      setSrc(null);
    }

    try {
      const response = await fetch(`/api/passages/${passageId}/attachments/${attachmentKind}`);
      if (!response.ok) {
        throw new Error("Impossible de récupérer l’image demandée.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setSrc(url);
    } catch {
      setError("L’image n’a pas pu être chargée.");
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setKind(null);
    setLoading(false);
    setError(null);
    if (src) {
      URL.revokeObjectURL(src);
      setSrc(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {hasPjt && (
          <button
            type="button"
            onClick={() => openAttachment("pjt")}
            className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            Voir ticket
          </button>
        )}
        {hasQuittance && (
          <button
            type="button"
            onClick={() => openAttachment("quittance")}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
          >
            Voir quittance
          </button>
        )}
      </div>

      <AttachmentModal
        isOpen={kind !== null}
        title={kind === "pjt" ? "Ticket du contrôleur" : "Quittance"}
        src={src}
        loading={loading}
        error={error}
        onClose={closeModal}
      />
    </>
  );
}
