"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ClipboardList, MapPin, Menu, UserRound, X } from "lucide-react";
import { cx } from "./ui";
import { Logo } from "./logo";

const clientItems = [
  { href: "/map", label: "Карта", icon: <MapPin size={22} /> },
  { href: "/ticket", label: "Мои записи", icon: <ClipboardList size={22} /> },
  { href: "/profile", label: "Профиль", icon: <UserRound size={22} /> },
];

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

/** Desktop: links in the header. Mobile: fixed bottom tab bar, like the reference. */
export function ClientNav() {
  const path = usePathname();
  return (
    <>
      <nav aria-label="Основная навигация" className="hidden items-center gap-1 md:flex">
        {clientItems.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={isActive(path, i.href) ? "page" : undefined}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-ink"
          >
            {i.label}
          </Link>
        ))}
      </nav>
      <nav
        aria-label="Основная навигация"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {clientItems.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={isActive(path, i.href) ? "page" : undefined}
            className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted aria-[current=page]:text-accent-ink"
          >
            {i.icon}
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

export type DashItem = { href: string; label: string; icon: ReactNode; badge?: number };

/** Dark sidebar from the reference; on mobile it becomes a slide-out drawer. */
export function DashboardNav({ items, footer }: { items: DashItem[]; footer?: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const exact = items.map((i) => i.href);
  // the most specific matching item wins, so "/owner" is not active on "/owner/stations/1"
  const active = exact.filter((h) => isActive(path, h)).sort((a, b) => b.length - a.length)[0];

  const list = (
    <nav aria-label="Меню кабинета" className="flex flex-col gap-1">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          onClick={() => setOpen(false)}
          aria-current={i.href === active ? "page" : undefined}
          className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white aria-[current=page]:bg-navy-700 aria-[current=page]:text-white"
        >
          <span aria-hidden className="text-accent-bright">{i.icon}</span>
          <span className="flex-1">{i.label}</span>
          {!!i.badge && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">{i.badge}</span>
          )}
        </Link>
      ))}
    </nav>
  );

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between bg-navy-900 px-4 py-3 lg:hidden">
        <Logo dark />
        <button
          onClick={() => setOpen(true)}
          aria-label="Открыть меню"
          aria-expanded={open}
          className="rounded-lg p-2 text-white hover:bg-white/10"
        >
          <Menu size={24} />
        </button>
      </header>

      {open && <div className="fixed inset-0 z-50 bg-navy-950/60 lg:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-6 bg-navy-900 p-4 transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          <Logo dark />
          <button onClick={() => setOpen(false)} aria-label="Закрыть меню" className="rounded-lg p-2 text-white hover:bg-white/10 lg:hidden">
            <X size={22} />
          </button>
        </div>
        <div className="flex-1">{list}</div>
        {footer}
      </aside>
    </>
  );
}
