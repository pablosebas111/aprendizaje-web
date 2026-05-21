"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Inicio" },
  { href: "/importar-csv", label: "Importar CSV" },
  { href: "/overview-gastos", label: "Overview financiero" },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="surface-panel flex w-64 shrink-0 flex-col border-r border-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)] px-4 py-6">
      <div className="mb-8 px-2">
        <p className="text-xs font-medium uppercase tracking-widest text-[color:color-mix(in_oklab,var(--foreground)_45%,transparent)]">
          Finanzas IA
        </p>
        <p className="mt-1 text-sm font-semibold">Finanzas / CSV</p>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "surface-subtle text-[var(--foreground)]"
                  : "text-[color:color-mix(in_oklab,var(--foreground)_70%,transparent)] hover:surface-subtle hover:text-[var(--foreground)]",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
