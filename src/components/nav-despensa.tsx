"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { IconoAjustes, IconoLista, IconoPersonas, IconoDespensa } from "@/components/iconos";
import { cx, Insignia } from "@/components/ui";
import { ETIQUETA_ROL, type Rol } from "@/lib/catalogos";

export function NavDespensa({
  despensa,
  rol,
}: {
  despensa: { id: string; name: string };
  rol: Rol;
}) {
  const ruta = usePathname();
  const base = `/despensas/${despensa.id}`;

  const pestanas = [
    { href: base, etiqueta: "Panel", icono: IconoDespensa, exacta: true },
    { href: `${base}/inventario`, etiqueta: "Inventario", icono: IconoLista },
    { href: `${base}/miembros`, etiqueta: "Miembros", icono: IconoPersonas },
    { href: `${base}/ajustes`, etiqueta: "Ajustes", icono: IconoAjustes },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {despensa.name}
        </h1>
        <Insignia>{ETIQUETA_ROL[rol]}</Insignia>
      </div>

      <nav className="mt-4 -mb-px flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {pestanas.map((p) => {
          const activa = p.exacta ? ruta === p.href : ruta.startsWith(p.href);
          const Icono = p.icono;
          return (
            <Link
              key={p.href}
              href={p.href}
              aria-current={activa ? "page" : undefined}
              className={cx(
                "flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition",
                activa
                  ? "border-marca-600 text-marca-700 dark:border-marca-400 dark:text-marca-300"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              <Icono className="size-4" />
              {p.etiqueta}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
