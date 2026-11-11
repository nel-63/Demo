"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export default function MaritimeUserAccountActions({
  maritimeUserId,
  maritimeUserName,
  isActive,
  declarationCount,
}: {
  maritimeUserId: string;
  maritimeUserName: string;
  isActive: boolean;
  declarationCount: number;
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
      ? `Désactiver le compte de ${maritimeUserName} ? Il sera déconnecté et ne pourra plus se connecter.`
      : `Réactiver le compte de ${maritimeUserName} ?`;
    if (!window.confirm(question)) return;

    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/maritime-users/${maritimeUserId}`, {
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
    if (!window.confirm(`Réinitialiser le mot de passe de ${maritimeUserName} ? Ses sessions ouvertes seront fermées.`)) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/maritime-users/${maritimeUserId}/password`, {
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

  async function deleteAccount() {
    if (!window.confirm(`Supprimer définitivement le compte de ${maritimeUserName} ?`)) return;
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/maritime-users/${maritimeUserId}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.message ?? "Suppression impossible.");
        return;
      }
      router.replace("/dashboard/maritime-users");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={isActive
          ? "rounded-full bg-green-50 px-2 py-1 text-xs text-green-700"
          : "rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"}>
          {isActive ? "Actif" : "Inactif"}
        </span>
        <button
          type="button"
          onClick={toggleStatus}
          disabled={loading}
          className={isActive
            ? "rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            : "rounded-lg border border-green-200 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"}
        >
          {isActive ? "Désactiver le compte" : "Réactiver le compte"}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowReset((value) => !value);
            setError("");
            setMessage("");
          }}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Mot de passe
        </button>
        <button
          type="button"
          onClick={deleteAccount}
          disabled={loading}
          className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Supprimer le compte
        </button>
      </div>

      {showReset && (
        <form onSubmit={resetPassword} className="max-w-xl space-y-3 rounded-lg bg-slate-50 p-4">
          <label htmlFor={`password-${maritimeUserId}`} className="block text-sm font-medium text-slate-700">
            Nouveau mot de passe (12 caractères minimum)
          </label>
          <input
            id={`password-${maritimeUserId}`}
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
            <button type="button" onClick={() => { setPassword(generatePassword()); setVisible(true); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white">
              Générer
            </button>
            <button type="button" onClick={() => setVisible((value) => !value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white">
              {visible ? "Masquer" : "Afficher"}
            </button>
            <button type="submit" disabled={loading} className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {loading ? "Enregistrement..." : "Réinitialiser"}
            </button>
          </div>
          <p className="text-xs text-slate-700">Notez le mot de passe avant de valider : il ne sera plus affiché ensuite.</p>
        </form>
      )}
      {declarationCount > 0 && (
        <p className="text-sm text-slate-600">Ce compte a des déclarations : il ne peut pas être supprimé. Désactivez-le à la place.</p>
      )}
      {message && <p role="status" className="text-sm text-green-700">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
