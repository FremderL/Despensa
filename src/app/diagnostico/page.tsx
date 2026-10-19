import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import { PruebaDeAccion } from "@/components/diagnostico-cliente";
import { Aviso, Tarjeta } from "@/components/ui";
import { env } from "@/env";
import { NOMBRES_COOKIE, sesionActual } from "@/lib/session";

export const metadata = { title: "Diagnóstico" };

/**
 * Página de diagnóstico de la sesión.
 *
 * Existe porque la causa más común de "me pide iniciar sesión otra vez" es
 * que el navegador está descartando la cookie en silencio, y eso no deja
 * rastro en el servidor: desde fuera, una petición sin cookie y una petición
 * de alguien que nunca entró son idénticas.
 *
 * Sólo en desarrollo. No muestra ningún valor de cookie ni token: sólo qué
 * nombres llegaron y si la sesión se pudo resolver.
 */
export default async function PaginaDiagnostico() {
  if (env.isProd) notFound();

  const [store, h, sesion] = await Promise.all([cookies(), headers(), sesionActual()]);

  const recibidas = NOMBRES_COOKIE.filter((n) => Boolean(store.get(n)?.value));
  const todasLasCookies = store.getAll().map((c) => c.name);

  const cabeceras: Array<[string, string]> = [
    ["host", h.get("host") ?? "—"],
    ["x-forwarded-host", h.get("x-forwarded-host") ?? "—"],
    ["x-forwarded-proto", h.get("x-forwarded-proto") ?? "—"],
    ["origin", h.get("origin") ?? "—"],
    ["referer", h.get("referer") ?? "—"],
    ["sec-fetch-dest", h.get("sec-fetch-dest") ?? "—"],
    ["sec-fetch-site", h.get("sec-fetch-site") ?? "—"],
    ["user-agent", (h.get("user-agent") ?? "—").slice(0, 120)],
  ];

  const empotrada = h.get("sec-fetch-dest") === "iframe";

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Diagnóstico de sesión
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Página de desarrollo. Sirve para ver por qué el navegador acepta o descarta la cookie.
          No muestra ningún valor de cookie ni token.
        </p>
      </div>

      <Tarjeta className="p-5">
        <h2 className="font-semibold text-slate-900 dark:text-white">1 · ¿Hay sesión?</h2>
        {sesion ? (
          <Aviso tono="exito" className="mt-3">
            Sí: <strong>{sesion.user.name}</strong> ({sesion.user.email}). La sesión se resolvió
            correctamente contra la base de datos.
          </Aviso>
        ) : (
          <Aviso tono="error" className="mt-3">
            No. O no llegó ninguna cookie válida, o la sesión caducó, o la base de datos se recreó
            y con ella se borraron todas las sesiones.
          </Aviso>
        )}
      </Tarjeta>

      <Tarjeta className="p-5">
        <h2 className="font-semibold text-slate-900 dark:text-white">2 · Cookies que llegaron</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Se emiten dos variantes con el mismo testigo. Dentro de un iframe sólo debería llegar la
          que lleva <code>Partitioned</code>.
        </p>

        <ul className="mt-3 space-y-2 text-sm">
          {NOMBRES_COOKIE.map((n) => {
            const llego = recibidas.includes(n);
            return (
              <li key={n} className="flex items-center gap-2">
                <span className={llego ? "text-emerald-600" : "text-rose-600"}>{llego ? "✓" : "✗"}</span>
                <code className="text-slate-700 dark:text-slate-200">{n}</code>
                <span className="text-xs text-slate-500">
                  {n.endsWith("_emb") ? "(SameSite=None; Secure; Partitioned)" : "(SameSite=Lax)"}
                </span>
              </li>
            );
          })}
        </ul>

        {recibidas.length === 0 && (
          <Aviso tono="aviso" className="mt-3">
            No llegó ninguna. Si acabas de iniciar sesión, el navegador está rechazando ambas
            variantes: suele pasar en Safari, que bloquea toda cookie de terceros, o si el iframe
            está restringido.
          </Aviso>
        )}

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Todas las cookies visibles para el servidor: {todasLasCookies.join(", ") || "ninguna"}
        </p>
      </Tarjeta>

      <Tarjeta className="p-5">
        <h2 className="font-semibold text-slate-900 dark:text-white">3 · Contexto de la petición</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {empotrada
            ? "Esta página se está mostrando dentro de un iframe."
            : "Esta página se está mostrando como documento de primer nivel."}
        </p>
        <dl className="mt-3 space-y-1 font-mono text-xs">
          {cabeceras.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-40 shrink-0 text-slate-500">{k}</dt>
              <dd className="min-w-0 break-all text-slate-700 dark:text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>
      </Tarjeta>

      <Tarjeta className="p-5">
        <h2 className="font-semibold text-slate-900 dark:text-white">4 · ¿Funcionan las escrituras?</h2>
        <p className="mt-1 mb-4 text-sm text-slate-600 dark:text-slate-400">
          Este botón envía una acción de servidor que no modifica nada. Comprueba de una vez la
          verificación de origen, el envío de la cookie y la sesión.
        </p>
        <PruebaDeAccion />
      </Tarjeta>
    </div>
  );
}
