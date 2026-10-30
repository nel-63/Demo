"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// Mot de passe aléatoire de 16 caractères (sans caractères ambigus : 0/O, 1/l/I).
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export default function SupervisorAccountActions({
  supervisorId,
  supervisorName,
  isActive,
}: {
  supervisorId: string;
  supervisorName: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);

  async function toggleStatus() {
    const question = isActive
      ? `Désactiver le compte de ${supervisorName} ? Il sera déconnecté et ne pourra plus se connecter.`
      : `Réactiver le compte de ${supervisorName} ?`;

    if (!window.confirm(question)) return;

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/supervisors/${supervisorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.message ?? "Modification impossible.");
        return;
      }

      setMessage(result.message ?? "Statut modifié.");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (password.length < 12) {
      setError("Le mot de passe doit contenir au moins 12 caractères.");
      return;
    }

    if (
      !window.confirm(
        `Réinitialiser le mot de passe de ${supervisorName} ? Ses sessions ouvertes seront fermées.`
      )
    ) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/supervisors/${supervisorId}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.message ?? "Réinitialisation impossible.");
        return;
      }

      setMessage(result.message ?? "Mot de passe réinitialisé.");
      setPassword("");
      setVisible(false);
      setShowReset(false);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-w-52 space-y-2">
      <span
        className={
          isActive
            ? "rounded-full bg-green-50 px-2 py-1 text-xs text-green-700"
            : "rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
        }
      >
        {isActive ? "Actif" : "Inactif"}
      </span>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleStatus}
          disabled={loading}
          aria-label={`${isActive ? "Désactiver" : "Réactiver"} le compte de ${supervisorName}`}
          className={
            isActive
              ? "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              : "rounded-lg border border-green-200 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
          }
        >
          {isActive ? "Désactiver" : "Réactiver"}
        </button>

        <button
          type="button"
          onClick={() => {
            setShowReset((value) => !value);
            setError("");
            setMessage("");
          }}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Mot de passe
        </button>
      </div>

      {showReset && (
        <form onSubmit={resetPassword} className="space-y-2 rounded-lg bg-slate-50 p-3">
          <label
            htmlFor={`password-${supervisorId}`}
            className="block text-xs font-medium text-slate-700"
          >
            Nouveau mot de passe (12 caractères minimum)
          </label>
          <input
            id={`password-${supervisorId}`}
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
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
            >
              Générer
            </button>
            <button
              type="button"
              onClick={() => setVisible((value) => !value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
            >
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

      {message && <p role="status" className="text-xs text-green-700">{message}</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
