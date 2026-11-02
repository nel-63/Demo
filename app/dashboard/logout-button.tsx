"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function LogoutButton({
  variant = "default",
  compact = false,
}: {
  variant?: "default" | "sidebar";
  compact?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setLoading(false);
      window.alert("La déconnexion a échoué. Réessayez.");
    }
  }

  const className =
    variant === "sidebar"
      ? `inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800 disabled:opacity-60 ${
          compact ? "" : "w-full"
        }`
      : "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60";

  return (
    <button type="button" onClick={logout} disabled={loading} className={className}>
      {variant === "sidebar" && <LogOut className="size-4" aria-hidden="true" />}
      {loading ? "Déconnexion..." : compact ? "Quitter" : "Se déconnecter"}
    </button>
  );
}
