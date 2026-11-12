"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// Mot de passe aléatoire de 16 caractères (sans caractères ambigus : 0/O, 1/l/I).
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

type Deletion = {
  redirectTo: string; // page affichée après la suppression
  blocked: boolean; // le compte a un historique : suppression impossible côté serveur
  blockedMessage: string;
};

// Actions sur un compte (activer/désactiver, réinitialiser le mot de passe, supprimer).
// `endpoint` est la route du compte (ex. /api/supervisors/abc) : le statut et la suppression
// l'utilisent directement, le mot de passe passe par `${endpoint}/password`.
// `compact` : version réduite pour une cellule de tableau.
export default function AccountActions({
  endpoint,
  name,
  isActive,
  compact = false,
  deletion,
}: {
  endpoint: string;
  name: string;
  isActive: boolean;
  compact?: boolean;
  deletion?: Deletion;
}) {
  const router = useRouter();
  const passwordId = useId();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);

  async function send(
    url: string,
    init: RequestInit,
    failure: string,
  ): Promise<{ ok: boolean; message?: string }> {
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(url, init);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.message ?? failure);
        return { ok: false };
      }
      return { ok: true, message: result.message };
    } catch {
      setError("Impossible de contacter le serveur.");
      return { ok: false };
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus() {
    const question = isActive
      ? `Désactiver le compte de ${name} ? Il sera déconnecté et ne pourra plus se connecter.`
      : `Réactiver le compte de ${name} ?`;
    if (!window.confirm(question)) return;

    const result = await send(
      endpoint,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      },
      "Modification impossible.",
    );
    if (!result.ok) return;
    setMessage(result.message ?? "Statut modifié.");
    router.refresh();
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (password.length < 12) {
      setError("Le mot de passe doit contenir au moins 12 caractères.");
      return;
    }
    if (!window.confirm(`Réinitialiser le mot de passe de ${name} ? Ses sessions ouvertes seront fermées.`)) {
      return;
    }

    const result = await send(
      `${endpoint}/password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      },
      "Réinitialisation impossible.",
    );
    if (!result.ok) return;
    setMessage(result.message ?? "Mot de passe réinitialisé.");
    setPassword("");
    setVisible(false);
    setShowReset(false);
    router.refresh();
  }

  async function deleteAccount() {
    if (!deletion) return;
    if (!window.confirm(`Supprimer définitivement le compte de ${name} ?`)) return;

    const result = await send(endpoint, { method: "DELETE" }, "Suppression impossible.");
    if (!result.ok) return;
    router.replace(deletion.redirectTo);
    router.refresh();
  }

  const size = compact ? "px-3 py-1.5 text-xs" : "px-3 py-2 text-sm";
  const text = compact ? "text-xs" : "text-sm";
  const dangerButton = `rounded-lg border border-red-200 ${size} font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50`;
  const successButton = `rounded-lg border border-green-200 ${size} font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50`;
  const neutralButton = `rounded-lg border border-slate-300 ${size} font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50`;
  const smallButton = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white";

  const badge = (
    <span
      className={
        isActive
          ? "rounded-full bg-green-50 px-2 py-1 text-xs text-green-700"
          : "rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
      }
    >
      {isActive ? "Actif" : "Inactif"}
    </span>
  );

  const buttons = (
    <>
      <button
        type="button"
        onClick={toggleStatus}
        disabled={loading}
        aria-label={`${isActive ? "Désactiver" : "Réactiver"} le compte de ${name}`}
        className={isActive ? dangerButton : successButton}
      >
        {isActive ? "Désactiver" : "Réactiver"}
        {compact ? "" : " le compte"}
      </button>
      <button
        type="button"
        onClick={() => {
          setShowReset((value) => !value);
          setError("");
          setMessage("");
        }}
        disabled={loading}
        className={neutralButton}
      >
        Mot de passe
      </button>
      {deletion && (
        <button type="button" onClick={deleteAccount} disabled={loading} className={dangerButton}>
          Supprimer le compte
        </button>
      )}
    </>
  );

  return (
    <div className={compact ? "min-w-52 space-y-2" : "space-y-4"}>
      {compact ? (
        <>
          {badge}
          <div className="flex flex-wrap gap-2">{buttons}</div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {badge}
          {buttons}
        </div>
      )}

      {showReset && (
        <form
          onSubmit={resetPassword}
          className={compact ? "space-y-2 rounded-lg bg-slate-50 p-3" : "max-w-xl space-y-3 rounded-lg bg-slate-50 p-4"}
        >
          <label htmlFor={passwordId} className={`block ${text} font-medium text-slate-700`}>
            Nouveau mot de passe (12 caractères minimum)
          </label>
          <input
            id={passwordId}
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPassword(generatePassword());
                setVisible(true);
              }}
              className={smallButton}
            >
              Générer
            </button>
            <button type="button" onClick={() => setVisible((value) => !value)} className={smallButton}>
              {visible ? "Masquer" : "Afficher"}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {loading ? "Enregistrement..." : "Réinitialiser"}
            </button>
          </div>
          <p className="text-xs text-slate-700">
            Notez le mot de passe avant de valider : il ne sera plus affiché ensuite.
          </p>
        </form>
      )}

      {deletion?.blocked && <p className="text-sm text-slate-600">{deletion.blockedMessage}</p>}
      {message && <p role="status" className={`${text} text-green-700`}>{message}</p>}
      {error && <p role="alert" className={`${text} text-red-700`}>{error}</p>}
    </div>
  );
}
