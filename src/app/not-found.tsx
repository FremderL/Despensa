import Link from "next/link";

import { BotonEnlace } from "@/components/ui";

export default function NoEncontrado() {
  return (
    <main id="contenido" className="flex flex-1 items-center justify-center px-5 py-24">
      <div className="max-w-md text-center">
        <p className="text-6xl font-bold text-marca-700 dark:text-marca-400">404</p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Aquí no hay nada
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          La página no existe, o pertenece a una despensa de la que no eres miembro. Damos la misma
          respuesta en ambos casos a propósito: así nadie puede averiguar qué despensas existen
          probando direcciones.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <BotonEnlace href="/despensas">Ir a mis despensas</BotonEnlace>
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            Inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
