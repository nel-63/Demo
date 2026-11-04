import { Suspense, type ReactNode } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LogoutButton from "./logout-button";
import NavLinks from "./nav-links";

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/Baobab Landscape Emblem.png"
        alt="Logo Région Menabe"
        width={408}
        height={408}
        className="h-26 w-26"
      />
      <span className="leading-tight">
        <span className="block font-semibold text-white">REGION MENABE</span>
        <span className="block text-xs text-slate-300">Régisseur</span>
      </span>
    </div>
  );
}

async function Shell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdmin = user.role === "ADMIN";
  let placeName: string | null = null;

  if (!isAdmin) {
    const profile = await prisma.supervisor.findUnique({
      where: { userId: user.id },
      select: { assignedLocation: { select: { name: true, deletedAt: true } } },
    });
    placeName = profile?.assignedLocation && !profile.assignedLocation.deletedAt
      ? profile.assignedLocation.name
      : null;
  }

  const fullName = `${user.firstName} ${user.lastName}`;
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  const roleLabel = isAdmin ? "Administrateur" : placeName ? `Régisseur · ${placeName}` : "Régisseur · Aucun lieu actif";

  return (
    <div className="min-h-screen md:flex">
      <a
        href="#contenu"
        className="sr-only z-50 rounded-lg bg-white px-4 py-2 font-semibold text-blue-700 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Aller au contenu
      </a>

      {/* Barre latérale (ordinateur) */}
      <aside className="hidden bg-slate-900 md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
        <div className="px-5 py-6">
          <Brand />
        </div>
        <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-3">
          <NavLinks role={user.role} variant="sidebar" />
        </nav>
        <div className="border-t border-slate-700 p-4">
          <div className="mb-3 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-white"
            >
              {initials}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-white">{fullName}</span>
              <span className="block truncate text-xs text-slate-300">{roleLabel}</span>
            </span>
          </div>
          <LogoutButton variant="sidebar" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre du haut (mobile) */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 md:hidden">
          <Brand />
          <LogoutButton variant="sidebar" compact />
        </header>

        <main id="contenu" className="flex-1 p-4 pb-28 sm:p-6 sm:pb-28 md:p-10 md:pb-10">
          {children}
        </main>
      </div>

      {/* Navigation du bas (mobile) */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white shadow-[0_-4px_16px_rgba(15,23,42,0.08)] md:hidden"
      >
        <NavLinks role={user.role} variant="bottom" />
      </nav>
    </div>
  );
}

function ShellFallback() {
  return (
    <div className="min-h-screen md:flex" aria-busy="true">
      <div className="hidden bg-slate-900 md:block md:w-64 md:shrink-0" />
      <div className="flex-1 p-6">
        <span className="sr-only">Chargement...</span>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
