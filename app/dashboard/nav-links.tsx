"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MapPin,
  Route,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean };

const ADMIN_ITEMS: Item[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/locations", label: "Lieux", icon: MapPin },
  { href: "/dashboard/supervisors", label: "Régisseurs", icon: UserCog },
  { href: "/dashboard/audit", label: "Journal d'audit", icon: ShieldCheck },
];

const SUPERVISOR_ITEMS: Item[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/passages", label: "Passages", icon: Route },
];

export default function NavLinks({
  role,
  variant,
}: {
  role: string;
  variant: "sidebar" | "bottom";
}) {
  const pathname = usePathname();
  const items = role === "ADMIN" ? ADMIN_ITEMS : SUPERVISOR_ITEMS;

  return (
    <ul className={variant === "sidebar" ? "space-y-1" : "flex"}>
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        const className =
          variant === "sidebar"
            ? `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`
            : `flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-semibold transition ${
                active ? "text-blue-700" : "text-slate-700 hover:text-slate-900"
              }`;

        return (
          <li key={item.href} className={variant === "bottom" ? "flex-1" : undefined}>
            <Link href={item.href} aria-current={active ? "page" : undefined} className={className}>
              <Icon
                className={`size-5 shrink-0 ${variant === "sidebar" && active ? "text-blue-300" : ""}`}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
